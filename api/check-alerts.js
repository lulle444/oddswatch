// Scheduled check (the "Warm board" GitHub Action calls it every 10 minutes): rebuilds the board from both platforms
// and saves it for fresh server instances, saves one hour of prices for the charts, compares the board with every
// alert and pings Telegram, and sends the daily gaps note in the evening. Safe to call publicly: a lock allows one
// run per window, and every send is deduplicated.
const {send} = require("../lib/telegram");
const {redis} = require("../lib/store");
const {board: getBoard} = require("../lib/odds");
const H = require("../lib/history");
const A = require("../lib/alerts");

const DAILY_HOUR = 17;   // 17:00 UTC: afternoon in New York, evening in Denmark

module.exports = async function handler(req, res){
  if (!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL))
    return res.status(200).json({skipped: "database not connected yet"});
  try {
    if (!(await redis("SET", A.K.lock, String(Date.now()), "NX", "EX", 240)))
      return res.status(200).json({skipped: "ran recently"});
    const board = await getBoard({fresh: true}), out = {pairs: board.pairs.length, ms: board.ms};
    out.saved = await H.save(board);
    if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(200).json({...out, skipped: "no bot token yet"});

    let sent = 0, gone = 0;
    for (const a of await A.allAlerts()){
      const before = JSON.stringify(a), msg = A.check(a, board);
      if (msg){
        try { await send(a.chat, msg); sent++; }
        catch (e) { if (/blocked|chat not found|deactivated/i.test(e.message)){ await A.removeAlert(a.chat, a.id); gone++; continue; } throw e; }
      }
      if (a.gone){ await A.removeAlert(a.chat, a.id); continue; }
      if (JSON.stringify(a) !== before) await A.saveAlert(a);
    }
    out.alerts = {sent, removed: gone};

    const now = new Date();
    if (now.getUTCHours() >= DAILY_HOUR && await redis("SET", A.K.sent(A.today()), "1", "NX", "EX", String(3 * 86400))){
      const text = A.daily(board, await H.ago(24).catch(() => null)), subs = await redis("SMEMBERS", A.K.daily) || [];
      let n = 0;
      for (const chat of subs){
        try { await send(chat, text); n++; }
        catch (e) { if (/blocked|chat not found|deactivated/i.test(e.message)) await A.unsubscribe(chat); }
      }
      out.daily = n;
    }
    res.status(200).json(out);
  } catch (e) {
    console.error("check-alerts:", e);
    res.status(500).json({error: String(e.message || e)});
  }
};

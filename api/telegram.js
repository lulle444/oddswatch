// Telegram webhook for the odds bot.
const B = require("../brand.json");
const {send, tg, esc, webhookSecret} = require("../lib/telegram");
const {board: getBoard} = require("../lib/odds");
const A = require("../lib/alerts");
const {redis} = require("../lib/store");

const num = x => parseFloat(String(x || "").replace(",", ".").replace(/%|pts?|points?/i, ""));
const both = r => `Polymarket <b>${A.pc(r.poly.p)}</b> · Kalshi <b>${A.pc(r.kalshi.p)}</b> · gap <b>${A.gp(r.gap)} pts</b>`;

async function card(chat, q){
  const board = await getBoard(), r = A.findPair(board, q);
  if (!r) return send(chat, `I couldn’t find a question both markets price for “${esc(q)}”. Try <code>/odds senate</code>, or tap 🔔 on any question at ${A.SITE}`);
  const h = await A.rememberShort(r.id);
  const g = Math.max(3, Math.ceil(Math.abs(r.gap) + 2));
  return send(chat, `<b>${esc(A.label(r))}</b>\n${both(r)}${r.thin ? "\n<i>Thinly traded: the gap may not be real.</i>" : ""}\n\nWhat should I watch?`,
    {reply_markup: {inline_keyboard: [
      [g, g + 3, g + 7].map(v => ({text: `↔️ gap ${v}+ pts`, callback_data: `g|${h}|${v}`})),
      [5, 10, 20].map(v => ({text: `📈 moves ${v} pts`, callback_data: `m|${h}|${v}`})),
      [{text: `See it on ${B.name}`, url: A.link(r)}],
    ]}});
}

async function create(chat, kind, q, thr){
  if (!(thr >= 1 && thr <= 60)) return send(chat, `Pick a number of points between 1 and 60, like <code>/${kind} senate ${kind === "gap" ? 5 : 10}</code>.`);
  const board = await getBoard(), r = A.findPair(board, q);
  if (!r) return send(chat, `I couldn’t find that question. Tap 🔔 on any question at ${A.SITE}`);
  const fields = kind === "gap"
    ? {kind, id2: r.id, label: A.label(r), thr, armed: Math.abs(r.gap) < thr}
    : {kind, id2: r.id, label: A.label(r), thr, base: [r.poly.p, r.kalshi.p]};
  const res = await A.addAlert(chat, fields);
  if (res.error) return send(chat, res.error);
  const what = kind === "gap" ? `Polymarket and Kalshi are <b>${thr} points</b> or more apart` : `the odds move <b>${thr} points</b> on either platform`;
  return send(chat, `${res.dup ? "You already have this one" : "Done"}. I’ll message you when ${what} on <b>${esc(A.label(r))}</b>.\nNow: ${both(r)}` +
    (kind === "gap" && Math.abs(r.gap) >= thr ? `\n\nThey’re already that far apart, so I’ll wait until the gap closes back ${A.REARM} points and opens again.` : "") +
    `\nChecked every 10 minutes. See all your alerts with /list.`);
}

async function odds(chat, q){
  const board = await getBoard(), r = A.findPair(board, q);
  if (!r) return send(chat, `I couldn’t find that question. Browse them all at ${A.SITE}`);
  return card(chat, r.id);
}

async function list(chat){
  const alerts = await A.listAlerts(chat);
  const lines = alerts.map((a, i) => `${i + 1}. ${esc(a.label)}: ${a.kind === "gap" ? `gap ${a.thr}+ pts` : `moves ${a.thr} pts`}`);
  const rows = alerts.map((a, i) => [{text: `Remove ${i + 1}`, callback_data: `d|${a.id}`}]);
  rows.push([{text: `Open ${B.name}`, url: A.SITE}]);
  return send(chat, lines.length ? "<b>Your alerts</b>\n" + lines.join("\n") : `You have no alerts yet. Send <code>/gap senate 5</code>, or tap 🔔 on any question at ${A.SITE}.`,
    {reply_markup: {inline_keyboard: rows}});
}

// Gap alerts on every question a reader starred on the site (handed over under a short code by /api/watch)
async function watchlist(chat, code){
  const raw = await redis("GET", `ow:wl:${code}`);
  if (!raw) return send(chat, `That link has expired. Open ${A.SITE}, star the questions you want and tap “Alert me on these” again.`);
  const board = await getBoard(), ids = JSON.parse(raw), lines = [];
  let added = 0, had = 0, full = null;
  for (const id of ids){
    const r = board.pairs.find(x => x.id === id);
    if (!r) continue;
    const thr = Math.max(5, Math.ceil(Math.abs(r.gap) + 2));
    const res = await A.addAlert(chat, {kind: "gap", id2: r.id, label: A.label(r), thr, armed: true});
    if (res.error){ full = res.error; break; }
    res.dup ? had++ : added++;
    lines.push(`• ${esc(A.label(r))}: gap ${thr}+ pts (now ${Math.abs(r.gap).toFixed(1)})`);
  }
  return send(chat, `⭐ <b>Watching your ${lines.length} starred question${lines.length === 1 ? "" : "s"}.</b> I’ll message you when Polymarket and Kalshi drift apart on any of them.\n\n${lines.join("\n")}` +
    (had ? `\n\n${had} of them you already had.` : "") + (full ? `\n\n${full}` : "") + `\n\nChecked every 10 minutes. /list to change them.`);
}

async function daily(chat){
  await A.subscribe(chat);
  return send(chat, `📊 <b>You’re in for the daily gaps.</b> Every evening I’ll send the five biggest gaps between Polymarket and Kalshi on liquid questions, and the day’s biggest moves.`,
    {reply_markup: {inline_keyboard: [[{text: "Stop the daily note", callback_data: "w|off"}]]}});
}
const dailyOff = chat => A.unsubscribe(chat).then(() => send(chat, "Daily note stopped. Send /daily to start it again."));

async function top(chat){
  const board = await getBoard(), lines = A.gapLines(board, 6);
  return send(chat, lines.length ? `<b>Biggest gaps right now</b> (liquid questions)\n\n${lines.join("\n")}\n\n${A.SITE}/gaps` : "No liquid question has a gap right now.");
}

const WELCOME = `<b>${esc(B.name)}</b>: same event, different odds. I watch Polymarket and Kalshi side by side.\n\n` +
  `• <code>/gap senate 5</code>: when the two markets are 5 points or more apart on a question.\n` +
  `• <code>/move fed 10</code>: when the odds move 10 points on either platform.\n` +
  `• <code>/odds chiefs</code>: both prices now.\n` +
  `• /top: the biggest gaps right now. /daily: every evening, the day’s biggest gaps.\n` +
  `• /list to see or remove your alerts, /stop to remove everything.\n\n` +
  `Or tap 🔔 on any question at ${A.SITE}. Not financial advice.`;

// "/gap senate democrat 5" -> ["senate democrat", 5]
function split(args){
  const n = args.length && !isNaN(num(args[args.length - 1])) ? num(args.pop()) : null;
  return [args.join(" "), n];
}

async function onMessage(m){
  const chat = m.chat.id, text = String(m.text || "").trim();
  const [cmd, ...args] = text.split(/\s+/), c = cmd.toLowerCase().replace(/@\w+$/, "");
  if (c === "/start"){
    const pl = args[0] || "";
    if (/^g_[A-Za-z0-9_-]{1,60}$/.test(pl)) return card(chat, pl.slice(2));
    if (pl === "daily") return daily(chat);
    if (/^w_[A-Za-z0-9_-]{6,20}$/.test(pl)) return watchlist(chat, pl.slice(2));
    return send(chat, WELCOME, {reply_markup: {inline_keyboard: [[{text: `Open ${B.name}`, url: A.SITE}]]}});
  }
  if (c === "/gap" || c === "/move"){
    const [q, n] = split(args), kind = c.slice(1);
    if (!q) return send(chat, `Tell me which question, like <code>/${kind} senate ${kind === "gap" ? 5 : 10}</code>.`);
    return n == null ? card(chat, q) : create(chat, kind, q, n);
  }
  if (c === "/odds") return args.length ? odds(chat, args.join(" ")) : top(chat);
  if (c === "/top") return top(chat);
  if (c === "/daily") return args[0] && /^(off|stop)$/i.test(args[0]) ? dailyOff(chat) : daily(chat);
  if (c === "/list") return list(chat);
  if (c === "/stop"){
    const [n] = await Promise.all([A.removeAll(chat), A.unsubscribe(chat)]);
    return send(chat, `Removed ${n} alert${n === 1 ? "" : "s"} and stopped the daily note.`);
  }
  if (!c.startsWith("/") && text.length > 2) return odds(chat, text);
  return send(chat, WELCOME);
}

async function onCallback(q){
  const chat = q.message && q.message.chat.id, [kind, a, b] = String(q.data || "").split("|");
  await tg("answerCallbackQuery", {callback_query_id: q.id}).catch(() => {});
  if (!chat) return;
  if (kind === "g" || kind === "m"){
    const id = await A.idOfShort(a);
    return id ? create(chat, kind === "g" ? "gap" : "move", id, parseFloat(b)) : send(chat, "That button has expired. Send /gap with the question’s name.");
  }
  if (kind === "d"){ await A.removeAlert(chat, a); return list(chat); }
  if (kind === "w" && a === "off") return dailyOff(chat);
}

module.exports = async function handler(req, res){
  if (req.method !== "POST" || req.headers["x-telegram-bot-api-secret-token"] !== webhookSecret())
    return res.status(401).json({error: "unauthorized"});
  try {
    const u = req.body || {};
    if (u.message && u.message.chat && u.message.chat.type === "private") await onMessage(u.message);
    else if (u.callback_query) await onCallback(u.callback_query);
  } catch (e) {
    console.error("telegram webhook:", e);
  }
  res.status(200).json({ok: true});   // always 200 so Telegram doesn't retry a failing update forever
};

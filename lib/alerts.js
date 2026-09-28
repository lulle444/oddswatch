// Telegram alerts and the daily gaps note, shared by the bot webhook and the scheduled check.
//   gap   Polymarket and Kalshi at least `thr` points apart on one question
//   move  the odds on one question moving `thr` points on either platform from where they were when last reported
const crypto = require("crypto");
const B = require("../brand.json");
const {redis, pipeline} = require("./store");
const {esc} = require("./telegram");

const SITE = "https://" + B.domain;
const BOT = String(B.telegram || "").replace(/^@/, "");
const K = {
  alerts: "ow:alerts",               // hash: alert id -> JSON
  chat: c => `ow:chat:${c}`,         // set of alert ids per chat
  short: "ow:short",                 // hash: 8-char hash -> pair id (Telegram buttons carry 64 bytes at most)
  daily: "ow:daily:subs",            // chats that get the daily gaps note
  sent: d => `ow:daily:sent:${d}`,
  lock: "ow:lock",
};
const MAX_PER_CHAT = 25;
const REARM = 2;                     // points back before a gap alert can fire again
const GONE_AFTER = 2 * 86400e3;      // a question missing this long has settled or closed

const pc = p => p == null ? "–" : (p * 100 < 9.95 && p * 100 > 0.05 ? (p * 100).toFixed(1) : Math.round(p * 100)) + "%";
const gp = g => (g > 0 ? "+" : g < 0 ? "−" : "±") + Math.abs(g).toFixed(1);
const big = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v || 0));
const label = r => r.outcome ? `${r.title} · ${r.outcome}` : r.title;
const short = id => crypto.createHash("sha1").update(String(id)).digest("base64url").slice(0, 8);
const today = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const link = r => `${SITE}/q/${r.slug}`;

// "senate democrat", "chiefs", a Kalshi ticker, a page slug -> the busiest matching pair
function findPair(board, q){
  const s = String(q || "").trim().toLowerCase().replace(/_/g, ".");
  if (!s) return null;
  const exact = board.pairs.find(r => r.id.toLowerCase() === s || r.slug === s || r.id.toLowerCase() === s.replace(/\./g, "_"));
  if (exact) return exact;
  const words = s.split(/\s+/);
  const hay = r => `${r.title} ${r.outcome || ""} ${r.kalshi.title} ${r.kOutcome || ""} ${r.cat}`.toLowerCase();
  return board.pairs.filter(r => words.every(w => hay(r).includes(w)))
    .sort((a, b) => (a.thin - b.thin) || (b.poly.vol24 + b.kalshi.vol24) - (a.poly.vol24 + a.kalshi.vol24))[0] || null;
}
async function rememberShort(id){ const h = short(id); await redis("HSET", K.short, h, id); return h; }
const idOfShort = h => redis("HGET", K.short, h);

async function listAlerts(chat){
  const ids = await redis("SMEMBERS", K.chat(chat)) || [];
  if (!ids.length) return [];
  return (await redis("HMGET", K.alerts, ...ids) || []).filter(Boolean).map(v => JSON.parse(v));
}
async function addAlert(chat, fields){
  const existing = await listAlerts(chat);
  const dup = existing.find(a => a.kind === fields.kind && a.id2 === fields.id2 && a.thr === fields.thr);
  if (dup) return {alert: dup, dup: true};
  if (existing.length >= MAX_PER_CHAT) return {error: `You can have up to ${MAX_PER_CHAT} alerts. Remove one with /list first.`};
  const alert = {id: crypto.randomBytes(5).toString("hex"), chat, ...fields, created: Date.now()};
  await pipeline([["HSET", K.alerts, alert.id, JSON.stringify(alert)], ["SADD", K.chat(chat), alert.id]]);
  return {alert};
}
const saveAlert = a => redis("HSET", K.alerts, a.id, JSON.stringify(a));
const removeAlert = (chat, id) => pipeline([["HDEL", K.alerts, id], ["SREM", K.chat(chat), id]]);
async function removeAll(chat){
  const ids = await redis("SMEMBERS", K.chat(chat)) || [];
  await pipeline([["DEL", K.chat(chat)], ...(ids.length ? [["HDEL", K.alerts, ...ids]] : [])]);
  return ids.length;
}
async function allAlerts(){
  const raw = await redis("HGETALL", K.alerts) || [];
  const out = [];
  for (let i = 1; i < raw.length; i += 2) out.push(JSON.parse(raw[i]));
  return out;
}

// Returns the message to send, or null. Mutates the alert's state (armed, base, missing); the caller saves it.
function check(a, board, t = Date.now()){
  const r = board.pairs.find(x => x.id === a.id2);
  if (!r){
    a.missing = a.missing || t;
    if (t - a.missing > GONE_AFTER){
      a.gone = true;
      return `🏁 <b>${esc(a.label)}</b> is no longer open on both platforms, so I’ve removed this alert. It has most likely settled.`;
    }
    return null;
  }
  delete a.missing;
  const both = `<b>Polymarket ${pc(r.poly.p)}</b> · <b>Kalshi ${pc(r.kalshi.p)}</b>`;
  if (a.kind === "gap"){
    const g = Math.abs(r.gap);
    if (a.armed === false){ if (g <= a.thr - REARM || r.thin) a.armed = true; return null; }
    if (r.thin || g < a.thr) return null;
    a.armed = false;
    return `↔️ <b>${esc(label(r))}</b>\nThe two markets are <b>${g.toFixed(1)} points</b> apart, past your ${a.thr}-point level.\n${both}\n\n` +
      `${r.gap > 0 ? "Polymarket" : "Kalshi"} is the more confident side. I’ll tell you again once the gap has closed back ${REARM} points and opens again. /list to change your alerts.\n${link(r)}`;
  }
  if (a.kind === "move"){
    const dp = (r.poly.p - a.base[0]) * 100, dk = (r.kalshi.p - a.base[1]) * 100;
    const m = Math.abs(dp) >= Math.abs(dk) ? dp : dk;
    if (Math.abs(m) < a.thr) return null;
    const msg = `${m > 0 ? "📈" : "📉"} <b>${esc(label(r))}</b> moved ${gp(m)} points.\n${both}\n` +
      `Was Polymarket ${pc(a.base[0])} · Kalshi ${pc(a.base[1])}.\n\nI’ll report the next ${a.thr}-point move from here. /list to change your alerts.\n${link(r)}`;
    a.base = [r.poly.p, r.kalshi.p];
    return msg;
  }
  return null;
}

/* ---------- the daily gaps note ---------- */
const gapLines = (board, n = 5) => board.pairs.filter(r => !r.thin && !r.live && !r.wx).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, n)
  .map((r, i) => `${i + 1}. ${esc(label(r))}\n    Poly ${pc(r.poly.p)} · Kalshi ${pc(r.kalshi.p)} · <b>${Math.abs(r.gap).toFixed(1)} pts</b>`);

function daily(board, prev){
  let moves = "";
  if (prev){
    const ch = board.pairs.filter(r => !r.thin && prev[r.id]).map(r => ({r, d: ((r.poly.p + r.kalshi.p) - (prev[r.id][0] + prev[r.id][1])) * 50}))
      .filter(x => Math.abs(x.d) >= 3).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 4);
    if (ch.length) moves = `\n\n<b>Biggest moves in 24 hours</b> (average of both)\n` + ch.map(({r, d}) => `${d > 0 ? "▲" : "▼"} ${esc(label(r))}: ${pc((r.poly.p + r.kalshi.p) / 2)} (${gp(d)})`).join("\n");
  }
  return `📊 <b>Today’s biggest gaps: Polymarket vs Kalshi</b>\n\n${gapLines(board).join("\n")}` + moves +
    `\n\n${board.pairs.length} questions priced on both. ${SITE}/gaps`;
}
const subscribe = chat => redis("SADD", K.daily, String(chat));
const unsubscribe = chat => redis("SREM", K.daily, String(chat));

module.exports = {K, SITE, BOT, REARM, pc, gp, big, label, link, today, findPair, rememberShort, idOfShort,
  listAlerts, addAlert, saveAlert, removeAlert, removeAll, allAlerts, check, gapLines, daily, subscribe, unsubscribe};

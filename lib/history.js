// Hourly price history for every pair, kept in Redis. One hour's prices are split into 16 small buckets by pair id,
// so a pair's chart reads one bucket per hour (a single MGET) instead of every pair's prices.
//   ow:h:{bucket}:{hour} = {"KXNFLGAME-26SEP27KCMIA-KC": [925, 875], ...}   Polymarket, Kalshi, in tenths of a percent
const crypto = require("crypto");
const {redis, pipeline} = require("./store");

const BUCKETS = 16, KEEP_DAYS = 32, HOUR = 3600e3;
const bucket = id => crypto.createHash("md5").update(String(id)).digest()[0] % BUCKETS;
const key = (b, h) => `ow:h:${b}:${h}`;
const hourOf = t => Math.floor(t / HOUR);

// Saves the board once per hour; returns how many pairs were saved, or 0 when this hour is already saved.
async function save(board, t = Date.now()){
  const h = hourOf(t);
  if (!(await redis("SET", `ow:h:done:${h}`, "1", "NX", "EX", "7200"))) return 0;
  const parts = Array.from({length: BUCKETS}, () => ({}));
  for (const r of board.pairs) parts[bucket(r.id)][r.id] = [Math.round(r.poly.p * 1000), Math.round(r.kalshi.p * 1000)];
  await pipeline(parts.map((o, b) => ["SET", key(b, h), JSON.stringify(o), "EX", String(KEEP_DAYS * 86400)]));
  return board.pairs.length;
}

// [[time, polymarket %, kalshi %], ...] for one pair over the past `days`, one point per saved hour
async function series(id, days = 7, t = Date.now()){
  const b = bucket(id), now = hourOf(t), n = Math.min(KEEP_DAYS * 24, Math.max(1, Math.round(days * 24)));
  const hours = Array.from({length: n}, (_, i) => now - n + 1 + i);
  const vals = await redis("MGET", ...hours.map(h => key(b, h))) || [];
  const out = [];
  vals.forEach((v, i) => {
    if (!v) return;
    const x = JSON.parse(v)[id];
    if (x) out.push([hours[i] * HOUR, x[0] / 10, x[1] / 10]);
  });
  return out;
}

// Prices for every pair about `hoursAgo` hours ago (for the daily moves), {id: [poly, kalshi]} in 0..1
async function ago(hoursAgo, t = Date.now()){
  const h = hourOf(t) - hoursAgo;
  for (const x of [h, h - 1, h + 1]){
    const vals = await redis("MGET", ...Array.from({length: BUCKETS}, (_, b) => key(b, x))) || [];
    if (vals.some(Boolean)){
      const out = {};
      for (const v of vals) if (v) for (const [id, [p, k]] of Object.entries(JSON.parse(v))) out[id] = [p / 1000, k / 1000];
      return out;
    }
  }
  return null;
}

module.exports = {save, series, ago, bucket};

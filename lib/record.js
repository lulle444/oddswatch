// Who was right: when a question both platforms priced settles, we look up how it settled and which market had put the
// higher chance on what happened, a day before the end (or just before kick-off for a game).
//   ow:track     hash: pair id -> what we need to score it later (title, page, Polymarket market, last seen)
//   ow:settled   list, newest first: one JSON per settled question
//   ow:scored    set of pair ids already scored
// The scheduled check calls step() every 10 minutes.
const {redis, pipeline} = require("./store");
const H = require("./history");
const {tickerStart} = require("./odds");

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const POLY = "https://gamma-api.polymarket.com";
const K = {track: "ow:track", settled: "ow:settled", scored: "ow:scored", seeded: "ow:track:seeded"};
const GONE = 40 * 60e3;             // missing from the board this long: go and ask whether it settled
const GIVE_UP = 14 * 86400e3;       // still open on Kalshi two weeks after it left the board: it just stopped matching
const POLY_WAIT = 3 * 86400e3;      // Polymarket settles through a vote that can take a day or two
const KEEP = 3000;
const HOUR = 3600e3;

const getJSON = async (url, ms = 12000) => {
  const r = await fetch(url, {headers: {accept: "application/json", "user-agent": "oddswatch/1.0"}, signal: AbortSignal.timeout(ms)});
  if (!r.ok) throw Object.assign(new Error(`${new URL(url).host} ${r.status}`), {status: r.status});
  return r.json();
};

function entry(r, t){
  return {s: r.slug, t: r.title, o: r.outcome, c: r.cat, m: r.poly.market, side: r.poly.side || 0, first: t, seen: t, live: !!r.live, wx: !!r.wx};
}

// The first time: every pair in the saved hourly prices that has already left the board, so settled questions from
// before this check existed still count. They have no title yet; Kalshi's is used when they settle.
async function seed(board, t){
  if (!(await redis("SET", K.seeded, "1", "NX"))) return 0;
  const now = Math.floor(t / HOUR), onBoard = new Set(board.pairs.map(r => r.id)), last = {};
  for (let h = now - 24 * 31; h <= now; h += 6){
    const keys = [];
    for (let x = h; x < h + 6 && x <= now; x++) for (let b = 0; b < 16; b++) keys.push(`ow:h:${b}:${x}`);
    const vals = await redis("MGET", ...keys) || [];
    vals.forEach((v, i) => { if (v) for (const id of Object.keys(JSON.parse(v))) last[id] = Math.max(last[id] || 0, (h + Math.floor(i / 16)) * HOUR); });
  }
  const add = Object.entries(last).filter(([id]) => !onBoard.has(id)).map(([id, seen]) => [id, JSON.stringify({seen, first: seen, seed: 1})]);
  if (add.length) await redis("HSET", K.track, ...add.flat());
  return add.length;
}

// The price each market gave the outcome at the moment we compare: just before a game starts, else a day before the
// question left the board. null when we didn't see the pair long enough to have a fair price.
async function priceAt(id, e){
  const pts = await H.series(id, 32, e.seen);
  if (!pts.length) return null;
  const start = tickerStart(id);
  const target = start && start < e.seen ? start - HOUR / 2 : e.seen - 24 * HOUR;
  let best = null;
  for (const p of pts) if (p[0] <= target && p[1] != null && p[2] != null) best = p;
  if (!best){
    best = pts.find(p => p[1] != null && p[2] != null);
    if (!best || best[0] > e.seen - 2 * HOUR) return null;
  }
  return {t: best[0], poly: best[1] / 100, kalshi: best[2] / 100};
}

// Polymarket's result for our outcome: 1, 0, 0.5 for a 50-50, or null while it hasn't settled
async function polyResult(e){
  if (!e.m) return null;
  try {
    const m = await getJSON(`${POLY}/markets/${e.m}`);
    if (!m.closed && !/^resolved$/i.test(m.umaResolutionStatus || "")) return null;
    const px = JSON.parse(m.outcomePrices || "[]").map(Number), p = px[e.side || 0];
    if (!isFinite(p)) return null;
    return p >= 0.99 ? 1 : p <= 0.01 ? 0 : Math.abs(p - 0.5) < 0.02 ? 0.5 : null;
  } catch (e) { return null; }
}

function winner(res, pr){
  const dp = Math.abs(pr.poly - res), dk = Math.abs(pr.kalshi - res);
  return Math.abs(dp - dk) < 0.01 ? "tie" : dp < dk ? "poly" : "kalshi";
}

async function step(board, t = Date.now()){
  const out = {tracked: 0, asked: 0, settled: 0};
  out.seeded = await seed(board, t).catch(() => 0);
  const raw = await redis("HGETALL", K.track) || [], track = {};
  for (let i = 0; i < raw.length; i += 2) track[raw[i]] = JSON.parse(raw[i + 1]);

  // follow every liquid pair from the moment we see it, and keep noting that it is still there
  const put = {};
  for (const r of board.pairs){
    const e = track[r.id];
    if (e){ e.seen = t; if (e.seed){ Object.assign(e, entry(r, e.first)); delete e.seed; } put[r.id] = e; }
    else if (!r.thin && !r.wx) put[r.id] = track[r.id] = entry(r, t);
  }
  out.tracked = Object.keys(track).length;

  // ask Kalshi about the ones that left the board, oldest first, 60 at a time
  const gone = Object.entries(track).filter(([, e]) => t - e.seen > GONE).sort((a, b) => (a[1].asked || 0) - (b[1].asked || 0)).slice(0, 60);
  const drop = [], settled = [];
  for (let i = 0; i < gone.length; i += 20){
    const part = gone.slice(i, i + 20);
    let markets = [];
    try { markets = (await getJSON(`${KALSHI}/markets?tickers=${part.map(([id]) => encodeURIComponent(id)).join(",")}&limit=20`)).markets || []; }
    catch (err) { continue; }
    out.asked += part.length;
    const by = new Map(markets.map(m => [m.ticker, m]));
    for (const [id, e] of part){
      const m = by.get(id);
      e.asked = t; put[id] = e;
      if (!m){ drop.push(id); continue; }
      const res = /^yes$/i.test(m.result) ? 1 : /^no$/i.test(m.result) ? 0 : null;
      if (res == null || !/settled|finalized|determined/i.test(m.status || "")){
        if (/active|open|initialized/i.test(m.status || "") && t - e.seen > GIVE_UP) drop.push(id);
        continue;
      }
      const pres = await polyResult(e);
      if (pres == null && e.m && t - e.seen < POLY_WAIT) continue;   // wait for Polymarket to settle too
      const pr = await priceAt(id, e).catch(() => null);
      drop.push(id);
      if (!pr || e.wx) continue;
      const row = {id, s: e.s || null, t: e.t || m.title, o: e.t ? e.o : (m.yes_sub_title || null), c: e.c || null, at: Date.parse(m.close_time) || t,
        res, pres, p: [+pr.poly.toFixed(3), +pr.kalshi.toFixed(3)], pt: pr.t, live: e.live || undefined};
      row.win = pres != null && pres !== res ? "split" : winner(res, pr);
      settled.push(row);
    }
  }
  const cmds = [];
  const keep = Object.entries(put).filter(([id]) => !drop.includes(id));
  if (keep.length) cmds.push(["HSET", K.track, ...keep.flatMap(([id, e]) => [id, JSON.stringify(e)])]);
  if (drop.length) cmds.push(["HDEL", K.track, ...drop]);
  if (settled.length){
    const fresh = [];
    for (const row of settled) if (await redis("SADD", K.scored, row.id)) fresh.push(row);
    if (fresh.length) cmds.push(["LPUSH", K.settled, ...fresh.map(x => JSON.stringify(x))], ["LTRIM", K.settled, "0", String(KEEP - 1)]);
    out.settled = fresh.length;
  }
  await pipeline(cmds);
  return out;
}

// The scoreboard: how often each market had the settled outcome closer, and by how much it missed on average.
async function scoreboard(){
  const rows = (await redis("LRANGE", K.settled, "0", String(KEEP - 1)) || []).map(x => JSON.parse(x));
  const fair = rows.filter(r => r.win !== "split");
  const n = {poly: 0, kalshi: 0, tie: 0};
  let mp = 0, mk = 0;
  for (const r of fair){ n[r.win]++; mp += Math.abs(r.p[0] - r.res); mk += Math.abs(r.p[1] - r.res); }
  return {
    t: Date.now(), n: fair.length, wins: n, splits: rows.filter(r => r.win === "split").length,
    miss: fair.length ? {poly: +(mp / fair.length * 100).toFixed(1), kalshi: +(mk / fair.length * 100).toFixed(1)} : null,
    recent: rows.slice(0, 60), split: rows.filter(r => r.win === "split").slice(0, 20),
  };
}

module.exports = {K, step, scoreboard, winner};

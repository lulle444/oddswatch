// Who moved first: when news lands, one market usually reprices before the other. Two views:
//   now    questions where one platform has moved in the last 6 or 24 hours and the other hasn't followed (yet)
//   lead   over the past week, each time one market jumped and the other followed within a few hours, who went first
// The lead count reads a week of hourly prices, so the scheduled check works it out once an hour and saves it (ow:lead).
const {redis} = require("./store");
const H = require("./history");

const HOUR = 3600e3, WEEK = 168;
const JUMP = 3;          // points in one hour that count as a jump
const FOLLOW = 3;        // hours the other market gets to follow
const K = {lead: "ow:lead"};

// One platform moved at least 4 points and the other less than half as far (or the other way): the other is lagging.
// Both moved at least 4 points the same way: they moved together.
function now(board, prev, hours){
  const lag = [], together = [];
  if (!prev) return {hours, lag, together};
  for (const r of board.pairs){
    if (r.thin || r.live || r.wx || !prev[r.id]) continue;
    const dp = (r.poly.p - prev[r.id][0]) * 100, dk = (r.kalshi.p - prev[r.id][1]) * 100;
    const big = Math.abs(dp) >= Math.abs(dk) ? "poly" : "kalshi", a = Math.max(Math.abs(dp), Math.abs(dk)), b = Math.min(Math.abs(dp), Math.abs(dk));
    const same = Math.sign(dp) === Math.sign(dk) && b > 0;
    const row = {id: r.id, m: r.poly.market, s: r.slug, t: r.title, o: r.outcome, p: [r.poly.p, r.kalshi.p], was: prev[r.id], d: [+dp.toFixed(1), +dk.toFixed(1)], lead: big, gap: r.gap};
    if (a >= 4 && (!same || b < a / 2)) lag.push({...row, lag: +(a - (same ? b : -b)).toFixed(1)});
    else if (a >= 4 && same && b >= 4) together.push(row);
  }
  lag.sort((x, y) => y.lag - x.lag);
  together.sort((x, y) => Math.abs(y.d[0] + y.d[1]) - Math.abs(x.d[0] + x.d[1]));
  // both teams of one game are one Polymarket market moving: show it once
  const once = rows => rows.filter((x, i) => rows.findIndex(y => y.m === x.m) === i);
  return {hours, lag: once(lag).slice(0, 25), together: once(together).slice(0, 15)};
}

// A week of hourly prices for every pair: {id: [[hour, poly, kalshi], ...]} in points
async function week(t){
  const h1 = Math.floor(t / HOUR), hours = Array.from({length: WEEK}, (_, i) => h1 - WEEK + 1 + i), out = {};
  for (let b = 0; b < 16; b++){
    const vals = await redis("MGET", ...hours.map(h => `ow:h:${b}:${h}`)) || [];
    vals.forEach((v, i) => {
      if (!v) return;
      for (const [id, [p, k]] of Object.entries(JSON.parse(v))) (out[id] = out[id] || []).push([hours[i], p / 10, k / 10]);
    });
  }
  return out;
}

// Each jump of 3+ points in one hour on one platform, while the other moved less than a third of that, and the other
// then moved the same way by at least half the jump within 3 hours: a lead for the first. Both jumping in the same
// hour: same hour. The hourly prices can't see who went first inside one hour.
function leads(series, names){
  const n = {poly: 0, kalshi: 0, same: 0}, recent = [], seen = new Set();
  // both outcomes of a head-to-head game are one Polymarket market: count its move once
  const first = (id, h, kind) => { const k = `${names[id] && names[id].m || id}:${h}:${kind}`; if (seen.has(k)) return false; seen.add(k); return true; };
  for (const [id, pts] of Object.entries(series)){
    for (let i = 1; i < pts.length; i++){
      if (pts[i][0] - pts[i - 1][0] !== 1) continue;
      const dp = pts[i][1] - pts[i - 1][1], dk = pts[i][2] - pts[i - 1][2];
      if (Math.abs(dp) >= JUMP && Math.abs(dk) >= JUMP && Math.sign(dp) === Math.sign(dk)){ if (first(id, pts[i][0], "same")) n.same++; continue; }
      for (const [who, d, other, j] of [["poly", dp, dk, 2], ["kalshi", dk, dp, 1]]){
        if (Math.abs(d) < JUMP || Math.abs(other) > Math.abs(d) / 3) continue;
        const base = pts[i][j];
        const later = pts.slice(i + 1, i + 1 + FOLLOW).filter(p => p[0] - pts[i][0] <= FOLLOW);
        const f = later.find(p => Math.sign(p[j] - base) === Math.sign(d) && Math.abs(p[j] - base) >= Math.abs(d) / 2);
        if (!f || !first(id, pts[i][0], who)) continue;
        n[who]++;
        recent.push({id, t: names[id] ? names[id].t : null, o: names[id] ? names[id].o : null, s: names[id] ? names[id].s : null,
          who, at: pts[i][0] * HOUR, d: +d.toFixed(1), after: f[0] - pts[i][0], fd: +(f[j] - base).toFixed(1)});
      }
    }
  }
  recent.sort((a, b) => b.at - a.at);
  return {n, recent: recent.slice(0, 20)};
}

// Called by the scheduled check; works the week out at most once an hour.
async function saveLead(board, t = Date.now()){
  const h = Math.floor(t / HOUR);
  if (!(await redis("SET", `ow:lead:done:${h}`, "1", "NX", "EX", "7200"))) return null;
  const liquid = new Map(board.pairs.filter(r => !r.wx).map(r => [r.id, {t: r.title, o: r.outcome, s: r.slug, m: r.poly.market, thin: r.thin, live: r.live}]));
  const all = await week(t), series = {};
  for (const [id, pts] of Object.entries(all)) if (liquid.has(id) && !liquid.get(id).thin) series[id] = pts;
  const out = {t, pairs: Object.keys(series).length, ...leads(series, Object.fromEntries(liquid))};
  await redis("SET", K.lead, JSON.stringify(out), "EX", String(3 * 3600));
  return out.n;
}

async function view(board){
  const [p6, p24, lead] = await Promise.all([H.ago(6).catch(() => null), H.ago(24).catch(() => null), redis("GET", K.lead).catch(() => null)]);
  return {t: board.t, h6: now(board, p6, 6), h24: now(board, p24, 24), lead: lead ? JSON.parse(lead) : null};
}

module.exports = {now, leads, saveLead, view};

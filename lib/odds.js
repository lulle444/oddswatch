// The board: every open market on Polymarket and Kalshi, and the pairs where both platforms price the same outcome.
// Both platforms publish their markets on free public APIs with no key. We read the busiest few hundred events on
// Polymarket and every open event on Kalshi, then match events by their titles and dates, and outcomes inside them
// by their labels (lib/match.js). A price is the chance the platform gives an outcome, 0 to 1.
const {matchAll, slugify} = require("./match");
const OVERRIDES = require("./pairs");

const POLY = "https://gamma-api.polymarket.com";
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const POLY_PAGES = 8;          // 8 × 100 events, busiest first
const KALSHI_BUDGET = 28000;   // ms to spend paging through Kalshi's open events
const TTL = 3 * 60e3;          // rebuild at most every 3 minutes per server instance

const num = v => v == null || v === "" ? null : isFinite(+v) ? +v : null;
const clamp = p => p == null ? null : Math.min(1, Math.max(0, p));

async function getJSON(url, ms = 15000){
  const r = await fetch(url, {headers: {accept: "application/json", "user-agent": "oddswatch/1.0"}, signal: AbortSignal.timeout(ms)});
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}
const parseList = v => { try { return Array.isArray(v) ? v : JSON.parse(v || "[]"); } catch (e) { return []; } };

// What each platform calls its topics, folded into ours.
const CATS = [
  {id: "politics", name: "Politics", re: /politic|election|midterm|senate|house|congress|president|governor|mayor|primar|geopolit|world|government|trump|policy|supreme court|parliament|minister/i},
  {id: "economy", name: "Economy", re: /econom|fed\b|federal reserve|rates?\b|inflation|cpi|jobs|recession|gdp|financ|business|compan|stock|earnings|tariff|tech|ipo/i},
  {id: "crypto", name: "Crypto", re: /crypto|bitcoin|ethereum|solana|\bbtc\b|\beth\b|token|stablecoin/i},
  {id: "sports", name: "Sports", re: /sport|nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf|ufc|mma|boxing|f1|formula|cricket|world cup|premier league|champions league|ncaa|olymp/i},
  {id: "culture", name: "Culture", re: /culture|entertain|movie|film|music|award|oscar|grammy|emmy|tv|celebrit|social|mention|science|climate|weather|space|ai\b/i},
];
// Kalshi's own categories, when an event carries one
const KCAT = {politics: "politics", elections: "politics", world: "politics", economics: "economy", financials: "economy", companies: "economy",
  "science and technology": "culture", crypto: "crypto", sports: "sports", entertainment: "culture", "climate and weather": "culture",
  social: "culture", mentions: "culture", health: "culture", transportation: "economy"};
function catOf(...labels){
  const s = labels.filter(Boolean).join(" | ");
  for (const c of CATS) if (c.re.test(s)) return c.id;
  return "other";
}

/* ---------- Polymarket ---------- */
// Polymarket shows the midpoint of the order book as the price, unless the spread is wider than 10 cents, when it
// shows the last trade. We do the same.
function polyPrice(m){
  const bid = num(m.bestBid), ask = num(m.bestAsk), last = num(m.lastTradePrice), prices = parseList(m.outcomePrices).map(num);
  if (bid != null && ask != null && ask > 0 && ask - bid <= 0.1) return {p: (bid + ask) / 2, bid, ask};
  return {p: last != null && last > 0 ? last : prices[0], bid, ask};
}

function polyEvent(e){
  const tags = (e.tags || []).map(t => t.label || t.slug || "").filter(Boolean);
  const live = (e.markets || []).filter(m => m.active !== false && !m.closed && m.acceptingOrders !== false && m.archived !== true);
  const multi = live.length > 1;
  const markets = [];
  for (const m of live){
    const outs = parseList(m.outcomes), {p, bid, ask} = polyPrice(m);
    if (p == null) continue;
    const base = {mid: String(m.id), mslug: m.slug, vol24: num(m.volume24hr) || 0, vol: num(m.volumeNum ?? m.volume) || 0,
      liq: num(m.liquidityNum ?? m.liquidity) || 0, chg1d: num(m.oneDayPriceChange), end: m.endDate || e.endDate, question: m.question,
      token: parseList(m.clobTokenIds)[0] || null, smt: m.sportsMarketType || null,
      // the taker fee rate this market charges (price × (1 − price) × rate per share), 0 where fees are off
      fee: m.feesEnabled === false ? 0 : num(m.feeSchedule && m.feeSchedule.rate), src: m.resolutionSource || null};
    const yesNo = outs.length === 2 && /^yes$/i.test(outs[0]) && /^no$/i.test(outs[1]);
    if (yesNo || !outs.length){
      markets.push({...base, label: multi ? (m.groupItemTitle || m.question) : "Yes", p: clamp(p), bid, ask, slug: m.slug});
    } else if (outs.length === 2){
      // a head-to-head market ("Lakers" vs "Celtics"): both sides are outcomes, the second priced as 1 − the first
      markets.push({...base, label: outs[0], p: clamp(p), bid, ask, slug: m.slug + "-" + slugify(outs[0])});
      markets.push({...base, label: outs[1], p: clamp(1 - p), bid: ask == null ? null : 1 - ask, ask: bid == null ? null : 1 - bid,
        chg1d: base.chg1d == null ? null : -base.chg1d, slug: m.slug + "-" + slugify(outs[1]), token: parseList(m.clobTokenIds)[1] || null, side: 1});
    }
  }
  const teams = Array.isArray(e.teams) ? e.teams.map(t => ({name: t.name || "", abbr: t.abbreviation || "", alias: t.alias || ""})) : [];
  return {src: "poly", id: String(e.id), slug: e.slug, title: e.title, end: e.endDate || null, image: e.icon || e.image || null, teams,
    vol24: num(e.volume24hr) || markets.reduce((s, m) => s + m.vol24, 0), vol: num(e.volume) || 0,
    cat: catOf(...tags, e.title), tags, url: `https://polymarket.com/event/${e.slug}`, markets};
}

async function polymarket(){
  const pages = await Promise.all(Array.from({length: POLY_PAGES}, (_, i) =>
    getJSON(`${POLY}/events?limit=100&offset=${i * 100}&active=true&closed=false&archived=false&order=volume24hr&ascending=false`).catch(e => (i ? [] : Promise.reject(e)))));
  const seen = new Set(), out = [];
  for (const e of pages.flat()){
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    const ev = polyEvent(e);
    if (ev.markets.length) out.push(ev);
  }
  return out;
}

/* ---------- Kalshi ---------- */
// Kalshi quotes in cents and, newer, in dollar strings. Price is the midpoint of bid and ask when the spread is
// 10 cents or less, else the last trade, the way Kalshi's own site shows it.
const kd = (m, k) => m[k + "_dollars"] != null ? num(m[k + "_dollars"]) : num(m[k]) == null ? null : num(m[k]) / 100;
const kn = (m, k) => num(m[k + "_fp"]) ?? num(m[k]) ?? 0;
function kalshiPrice(m){
  const bid = kd(m, "yes_bid"), ask = kd(m, "yes_ask"), last = kd(m, "last_price");
  if (bid != null && ask != null && ask > 0 && bid > 0 && ask - bid <= 0.1) return {p: (bid + ask) / 2, bid, ask};
  return {p: last != null && last > 0 ? last : bid != null && ask != null && ask > 0 ? (bid + ask) / 2 : null, bid, ask};
}

function kalshiEvent(e){
  const live = (e.markets || []).filter(m => !m.status || /^(active|open)$/i.test(m.status));
  const multi = live.length > 1;
  const markets = [];
  for (const m of live){
    const {p, bid, ask} = kalshiPrice(m);
    if (p == null) continue;
    markets.push({ticker: m.ticker, label: multi ? (m.yes_sub_title || m.subtitle || m.title) : "Yes", question: m.title,
      p: clamp(p), bid, ask, prev: kd(m, "previous_price"), vol24: kn(m, "volume_24h"), vol: kn(m, "volume"), oi: kn(m, "open_interest"),
      end: m.close_time || m.expiration_time || null, settles: m.expected_expiration_time || m.close_time || null});
  }
  const ends = markets.map(m => Date.parse(m.end)).filter(isFinite);
  const series = (e.series_ticker || e.event_ticker.split("-")[0]).toLowerCase();
  const sources = (e.settlement_sources || []).map(x => x && (x.name || x.url)).filter(Boolean).slice(0, 3);
  return {src: "kalshi", id: e.event_ticker, series, sources, title: e.title, sub: e.sub_title || "", end: ends.length ? new Date(Math.min(...ends)).toISOString() : null,
    vol24: markets.reduce((s, m) => s + m.vol24, 0), vol: markets.reduce((s, m) => s + m.vol, 0),
    cat: KCAT[String(e.category || "").toLowerCase()] || catOf(e.category, e.title), tags: [e.category].filter(Boolean), url: `https://kalshi.com/markets/${series}`, markets};
}

async function kalshi(){
  const out = [], t0 = Date.now();
  let cursor = "", pages = 0, failed = null;
  do {
    const u = `${KALSHI}/events?status=open&with_nested_markets=true&limit=200${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`;
    let j = null, err = null;
    for (let i = 0; i < 4 && !j; i++){
      try { j = await getJSON(u, 20000); }
      catch (e) { err = e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }   // Kalshi answers 429 when read too fast
    }
    if (!j){ if (!pages) throw err; failed = String(err.message || err); break; }
    for (const e of j.events || []){
      if (/^KXMVE/i.test(e.event_ticker || "")) continue;   // bundled multi-game parlays: no Polymarket twin
      const ev = kalshiEvent(e);
      if (ev.markets.length) out.push(ev);
    }
    cursor = j.cursor || "";
    pages++;
  } while (cursor && pages < 150 && Date.now() - t0 < KALSHI_BUDGET);
  return {events: out, pages, complete: !cursor && !failed, failed};
}

/* ---------- the board ---------- */
const THIN_VOL = 2000;     // 24h volume below this on either side, in dollars or contracts: the gap may not be real
const THIN_SPREAD = 0.06;  // or a bid-ask spread wider than 6 points

// "fed-decision-in-october-25-bps-increase": readable, at most 80 characters, cut at a word
const shortSlug = t => { const s = slugify(t); return s.length > 80 ? s.slice(0, 80).replace(/-[^-]*$/, "") : s; };

// Kalshi game tickers carry the start time in US Eastern time, e.g. KXCS2GAME-26SEP280700GLMGC is Sep 28, 2026 at 07:00.
// Esports and many other games settle hours after they start, so the end date alone can't tell that a match is under way.
const MONTHS = {JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11};
function tickerStart(ticker){
  const m = /-(\d{2})([A-Z]{3})(\d{2})(\d{2})(\d{2})[A-Z]/.exec(String(ticker || ""));
  if (!m || !(m[2] in MONTHS)) return null;
  const mon = MONTHS[m[2]], et = mon >= 2 && mon <= 10 ? 4 : 5;   // daylight time roughly March to early November
  return Date.UTC(2000 + +m[1], mon, +m[3], +m[4] + et, +m[5]);
}

const host = u => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : null; } catch (e) { return null; } };
// Only where the date is the question ("by March 31?", "before 2027?"): elsewhere Kalshi often just settles weeks after
// the event (an election is certified later), which changes nothing about who wins.
function rulesFlag(pEnd, kEnd, series, title){
  const a = Date.parse(pEnd), b = Date.parse(kEnd);
  if (!isFinite(a) || !isFinite(b) || /game|match/i.test(series || "") || !/\b(by|before|end of)\b/i.test(title || "")) return undefined;
  const d = Math.round((b - a) / 864e5);
  return Math.abs(d) > 2 ? {days: d} : undefined;
}

function pairRow(pe, pm, ke, km, sim){
  const spread = m => m.bid != null && m.ask != null ? m.ask - m.bid : null;
  // a price at the very edge means the question is all but decided (or a game is in its last minutes): no real gap
  const edge = p => p <= 0.02 || p >= 0.98;
  const thin = edge(pm.p) || edge(km.p) || pm.vol24 < THIN_VOL || km.vol24 < THIN_VOL || (spread(pm) ?? 1) > THIN_SPREAD || (spread(km) ?? 1) > THIN_SPREAD;
  const multi = pe.markets.length > 1;
  return {
    id: km.ticker, slug: shortSlug(`${pe.title.replace(/\s+-\s+more markets$/i, "")} ${multi ? pm.label : ""}`),
    title: pe.title, outcome: multi ? pm.label : null, kOutcome: ke.markets.length > 1 ? km.label : null,
    cat: ke.cat !== "other" ? ke.cat : pe.cat, end: pe.end || ke.end, image: pe.image,
    poly: {p: pm.p, bid: pm.bid, ask: pm.ask, vol24: pm.vol24, vol: pm.vol, chg1d: pm.chg1d, url: pe.url, market: pm.mid, token: pm.token, side: pm.side || 0, question: pm.question,
      fee: pm.fee, end: pm.end || pe.end || null, source: host(pm.src)},
    kalshi: {p: km.p, bid: km.bid, ask: km.ask, vol24: km.vol24, vol: km.vol, oi: km.oi, prev: km.prev, url: ke.url, ticker: km.ticker, event: ke.id, title: ke.title, question: km.question,
      end: km.settles || km.end || null, sources: ke.sources},
    live: !!(ke.series && /game/i.test(ke.series) && ((tickerStart(km.ticker) || Infinity) < Date.now() || Date.parse(pe.end || ke.end) < Date.now())),
    // weather: the two platforms often settle on different stations, so a gap there is rarely a real disagreement
    wx: /^KX(HIGH|LOW|RAIN|SNOW|TEMP|HURR)/i.test(km.ticker || "") || /\b(temperature|rainfall|snowfall|hurricane|degrees)\b/i.test(pe.title),
    // a deadline question whose two deadlines are more than two days apart
    rules: rulesFlag(pm.end || pe.end, km.settles || km.end, ke.series, `${pe.title} ${pm.question || ""}`),
    gap: +((pm.p - km.p) * 100).toFixed(1), avg: +(((pm.p + km.p) / 2) * 100).toFixed(1), thin, sim: +sim.toFixed(2),
  };
}

function build(pe, kk){
  const pairs = matchAll(pe, kk.events, OVERRIDES).map(x => pairRow(x.pe, x.pm, x.ke, x.km, x.sim))
    .filter(r => r.poly.vol > 0 && r.kalshi.vol > 0 && (r.poly.p > 0.005 && r.poly.p < 0.995 || r.kalshi.p > 0.005 && r.kalshi.p < 0.995));
  // two outcomes can share one Polymarket market slug (a head-to-head); keep slugs unique
  const seen = new Map();
  for (const r of pairs){ const n = seen.get(r.slug) || 0; seen.set(r.slug, n + 1); if (n) r.slug += "-" + (n + 1); }
  pairs.sort((a, b) => (b.poly.vol24 + b.kalshi.vol24) - (a.poly.vol24 + a.kalshi.vol24));
  const matched = {polyUrl: new Set(pairs.map(r => r.poly.url)), kalshi: new Set(pairs.map(r => r.kalshi.event))};
  const cats = CATS.concat({id: "other", name: "Other"}).map(c => ({id: c.id, name: c.name, count: pairs.filter(r => r.cat === c.id).length}));
  const brief = e => ({title: e.title, url: e.url, cat: e.cat, vol24: e.vol24, end: e.end,
    top: e.markets.slice().sort((a, b) => b.p - a.p).slice(0, 3).map(m => ({label: m.label, p: m.p}))});
  return {
    t: Date.now(), pairs, cats,
    counts: {polyEvents: pe.length, kalshiEvents: kk.events.length, kalshiPages: kk.pages, kalshiComplete: kk.complete, kalshiError: kk.failed || undefined, pairs: pairs.length,
      polyVol24: Math.round(pe.reduce((s, e) => s + e.vol24, 0)), kalshiVol24: Math.round(kk.events.reduce((s, e) => s + e.vol24, 0))},
    onlyPoly: pe.filter(e => !matched.polyUrl.has(e.url)).sort((a, b) => b.vol24 - a.vol24).slice(0, 12).map(brief),
    onlyKalshi: kk.events.filter(e => !matched.kalshi.has(e.id)).sort((a, b) => b.vol24 - a.vol24).slice(0, 12).map(brief),
  };
}

// A fresh server instance first takes the copy the scheduled check saved in Redis (it is at most a few minutes old),
// so pages don't wait 15 seconds for both platforms. Every instance rebuilds from the APIs when its copy is stale.
const CACHE_KEY = "ow:board";
async function fromCache(){
  try {
    const {redis} = require("./store");
    const v = await redis("GET", CACHE_KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}
async function toCache(b){
  try { const {redis} = require("./store"); await redis("SET", CACHE_KEY, JSON.stringify(b), "EX", "1800"); } catch (e) {}
}

let memo = null, pending = null;
async function board({fresh = false} = {}){
  if (!fresh && memo && Date.now() - memo.t < TTL) return memo;
  if (!fresh && !memo){
    const c = await fromCache();
    if (c && Date.now() - c.t < 8 * 60e3) return (memo = c);
  }
  if (pending) return pending;
  pending = (async () => {
    const t0 = Date.now();
    const [pe, kk] = await Promise.all([polymarket(), kalshi()]);
    const b = build(pe, kk);
    b.ms = Date.now() - t0;
    if (fresh) await toCache(b);
    return (memo = b);
  })().finally(() => { pending = null; });
  try { return await pending; }
  catch (e) { if (memo) return memo; throw e; }
}

// The biggest real gaps right now: both sides liquid, sorted by size.
const gaps = (b, n = 10, min = 0) => b.pairs.filter(r => !r.thin && !r.live && !r.wx && Math.abs(r.gap) >= min).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, n);
const findPair = (b, key) => b.pairs.find(r => r.slug === key || r.id === key || r.id.toLowerCase() === String(key).toLowerCase());

module.exports = {tickerStart, board, build, gaps, findPair, CATS, catOf, polyEvent, kalshiEvent, polyPrice, kalshiPrice};

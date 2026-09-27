// Matching: which Polymarket event is the same question as which Kalshi event, and which outcome inside it is
// which. Titles are cut into words, common words dropped, synonyms folded ("GOP" is "Republican"), and rare words
// weigh more than common ones. Two events match when enough of their weighted words overlap, their years and
// numbers agree and they end close together. Every event matches at most one event on the other side.
// lib/pairs.js can force a pair or block one when the words mislead.

const STOP = new Set(("a an the of in on at to for by with and or vs v versus will be is are was were who what which when where how " +
  "does do did this that than there their it its as from next before after during between up down new than more most less least " +
  "winner win wins won winning market markets odds price prediction happen happens yes no any other another over under out get gets " +
  "party parties candidate race races result results official officially announce announced end ends " +
  "by date day week month year").split(" "));

// whole phrases first, then single words
const PHRASES = [
  [/\bu\.?\s?s\.?\b/g, "us"], [/\bunited states\b/g, "us"], [/\bfederal reserve\b/g, "fed"], [/\binterest rates?\b/g, "rate"],
  [/\bhouse of representatives\b/g, "house"], [/\bnew york city\b/g, "nyc"], [/\bprime minister\b/g, "pm"],
  [/\bsuper bowl\b/g, "superbowl"], [/\bworld series\b/g, "worldseries"], [/\bworld cup\b/g, "worldcup"], [/\bstanley cup\b/g, "stanleycup"],
  [/\bnba finals\b/g, "nbafinals"], [/\bchampions league\b/g, "championsleague"], [/\bpremier league\b/g, "premierleague"],
  [/\bbasis points?\b/g, "bps"], [/(\d)\s?bps\b/g, "$1 bps"], [/\bno change\b/g, "hold"], [/\bunchanged\b/g, "hold"], [/\bpause\b/g, "hold"], [/\bgovernment shutdown\b/g, "shutdown"], [/\belon musk\b/g, "musk"],
  [/\bdonald trump\b/g, "trump"],
  // "D Senate, R House" and "R-House, D-Senate": keep each party with its chamber
  [/\b([dr])[\s-]+(house|senate)\b/g, (_, p, c) => ` ${c}${p === "d" ? "dem" : "rep"} `],
  [/\b(house|senate)[\s-]+([dr])\b/g, (_, c, p) => ` ${c}${p === "d" ? "dem" : "rep"} `], [/\bdonald j\.? trump\b/g, "trump"],
];
const SYN = {
  democrats: "democrat", democratic: "democrat", dem: "democrat", dems: "democrat", d: "democrat",
  republicans: "republican", gop: "republican", rep: "republican", r: "republican",
  presidential: "president", presidency: "president", mayoral: "mayor", gubernatorial: "governor",
  elections: "election", elected: "election", midterms: "midterm", senators: "senate", senator: "senate",
  btc: "bitcoin", eth: "ethereum", sol: "solana", xrp: "ripple",
  cut: "cut", cuts: "cut", hike: "hike", hikes: "hike", raise: "hike", raises: "hike", increase: "hike", decrease: "cut",
  hit: "reach", hits: "reach", reaches: "reach", touch: "reach",
  control: "control", controls: "control", majority: "control",
  approve: "approve", approval: "approve", rating: "approve",
};

function norm(s){
  let t = String(s || "").toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ");
  for (const [re, to] of PHRASES) t = t.replace(re, typeof to === "function" ? to : " " + to + " ");
  t = t.replace(/\$\s?(\d[\d,]*(?:\.\d+)?)\s?([kmb])\b/g, (_, n, u) => String(Math.round(parseFloat(n.replace(/,/g, "")) * {k: 1e3, m: 1e6, b: 1e9}[u])))
    .replace(/(\d),(\d{3})/g, "$1$2").replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/\b(\d+(?:\.\d+)?)k\b/g, (_, n) => String(Math.round(parseFloat(n) * 1e3)));
  return t;
}
function words(s){
  const out = [];
  for (let w of norm(s).split(/[^a-z0-9.↑↓+<>]+/)){
    w = w.replace(/^\.+|\.+$/g, "");
    if (!w) continue;
    if (SYN[w]) w = SYN[w];
    else if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") && !/\d/.test(w)) w = w.slice(0, -1);
    if (STOP.has(w)) continue;
    out.push(w);
  }
  return out;
}
const isYear = w => /^20[2-4]\d$/.test(w);
const isNum = w => /^\d+(\.\d+)?$/.test(w) && !isYear(w);

// Which way a threshold outcome points: "above 4%", "↑ 150,000", "4.25% or higher" all point up.
function direction(s){
  const t = String(s || "").toLowerCase();
  if (/↑|\babove\b|\bover\b|or more|or higher|or above|at least|\bmore than\b|greater|\+\s*$|\bexceed/.test(t)) return "up";
  if (/↓|\bbelow\b|\bunder\b|or less|or lower|or below|at most|\bless than\b|fewer/.test(t)) return "down";
  if (/\bbetween\b|\bto\b\s*\$?\d|–|—|\d\s*-\s*\d/.test(t)) return "range";
  return null;
}

// weighted overlap of two word sets
function score(A, B, idf){
  const a = new Set(A), b = new Set(B);
  let wa = 0, wb = 0, both = 0;
  for (const w of a){ const x = idf(w); wa += x; if (b.has(w)) both += x; }
  for (const w of b) wb += idf(w);
  if (!wa || !wb) return {cos: 0, cover: 0};
  return {cos: both / Math.sqrt(wa * wb), cover: both / Math.min(wa, wb), jac: both / (wa + wb - both)};
}

// years and numbers must agree when both sides name them
function numbersAgree(A, B){
  const ya = A.filter(isYear), yb = B.filter(isYear);
  if (ya.length && yb.length && !ya.some(y => yb.includes(y))) return false;
  const na = A.filter(isNum), nb = B.filter(isNum);
  if (na.length && nb.length && !na.some(n => nb.some(m => +m === +n))) return false;
  return true;
}

const DAY = 864e5;
// words that change what a question asks: both titles have them or neither does
const MUST = ["reach", "exact", "finalist", "matchup", "margin", "ballot", "nominee", "halftime", "performer", "half", "1st", "2nd",
  "quarter", "period", "inning", "btts", "spread", "total", "corner", "second", "third", "runner", "podium", "top", "coding", "women", "men", "first", "last", "exact", "undefeated"];
const mustAgree = (A, B) => MUST.every(w => A.includes(w) === B.includes(w));

// Place and people names: when both titles name some, at least one must be shared ("Highest temperature in
// Chicago" is not "Highest temperature in Boston").
const NOT_NAMES = new Set(("will who which what when where how the a an in on at of by for is are does do fed us u.s. yes no highest lowest " +
  "january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec " +
  "monday tuesday wednesday thursday friday saturday sunday top best next new pro nfl nba mlb nhl ncaa").split(" "));
function names(t){
  const out = new Set();
  const toks = String(t || "").replace(/[’']s\b/g, "").split(/[^A-Za-zÀ-ÿ0-9.]+/).filter(Boolean);
  toks.forEach((w, i) => { if (i > 0 && /^[A-ZÀ-Þ][a-zà-ÿ]{2,}$/.test(w) && !NOT_NAMES.has(w.toLowerCase())) out.add(w.toLowerCase()); });
  return out;
}
// at least half of each side's names must appear somewhere in the other title
function namesAgree(a, b){
  const low = t => new Set(String(t || "").toLowerCase().replace(/[’']s\b/g, "").split(/[^a-zà-ÿ0-9.]+/));
  const half = (N, text) => { if (!N.size) return true; let n = 0; for (const x of N) if (text.has(x)) n++; return n / N.size >= 0.5; };
  return half(names(a), low(b)) && half(names(b), low(a));
}

// "Chiefs vs. Dolphins" and "Miami at Kansas City": when both titles name two sides, each side must match one
const SIDES = /\s+(?:vs\.?|v\.?|at|@)\s+/i;
function sidesAgree(a, b, idf){
  const A = a.split(SIDES), B = b.split(SIDES);
  if (A.length !== 2 || B.length !== 2) return true;
  const w = x => words(x.replace(/[:?].*$/, ""));
  const [a1, a2] = A.map(w), [b1, b2] = B.map(w);
  const same = (x, y) => { const s = score(x, y, idf); return s.cover >= 0.5; };
  return same(a1, b1) && same(a2, b2) || same(a1, b2) && same(a2, b1);
}
const eventText = e => e.src === "kalshi" ? `${e.title} ${e.sub || ""}` : e.title;
const labelText = (e, m) => m.label === "Yes" ? (m.question || e.title) : m.label;

function matchOutcomes(pe, ke, idf){
  const pm = pe.markets, km = ke.markets;
  // a single yes/no question on both sides
  if (pm.length === 1 && km.length === 1 && pm[0].label === "Yes" && km[0].label === "Yes") return [{pm: pm[0], km: km[0], s: 1}];
  const cands = [];
  for (const a of pm){
    const A = words(labelText(pe, a)), da = direction(labelText(pe, a));
    for (const b of km){
      const B = words(labelText(ke, b)), db = direction(labelText(ke, b));
      if (da !== db) continue;
      if (!mustAgree(words(`${pe.title} ${a.label} ${a.question || ""}`), words(`${ke.title} ${b.label} ${b.question || ""}`))) continue;
      if (!numbersAgree(A, B)) continue;
      const na = A.filter(isNum), nb = B.filter(isNum);
      if ((na.length > 0) !== (nb.length > 0)) continue;
      let s;
      if (A.join(" ") === B.join(" ") && A.length) s = 1;
      else { const x = score(A, B, idf); s = x.jac >= 0.4 ? (x.cover + x.jac) / 2 : 0; }
      if (s >= 0.6) cands.push({pm: a, km: b, s});
    }
  }
  cands.sort((x, y) => y.s - x.s);
  const usedP = new Set(), usedK = new Set(), out = [];
  for (const c of cands){
    if (usedP.has(c.pm) || usedK.has(c.km)) continue;
    usedP.add(c.pm); usedK.add(c.km); out.push(c);
  }
  return out;
}

/* ---------- games ----------
   Kalshi lists each game as "Kansas City vs Miami" with tickers like KXNFLGAME-26SEP27KCMIA-KC; Polymarket as
   "Chiefs vs. Dolphins" with the two teams' full names and abbreviations, and the date in the slug. A game matches
   when the date agrees and each Kalshi team is one of the two Polymarket teams. */
const MON = {JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"};
const isKalshiGame = e => /GAME$/i.test(e.series || "") || /GAME-/i.test(e.id || "");
function kalshiDate(e){
  const m = /-(\d{2})([A-Z]{3})(\d{2})/.exec(e.id || "");
  return m && MON[m[2]] ? `20${m[1]}-${MON[m[2]]}-${m[3]}` : null;
}
function polyDate(e){
  for (const s of [e.slug, ...(e.markets || []).map(m => m.slug)]){ const m = /(20\d{2}-\d{2}-\d{2})/.exec(s || ""); if (m) return m[1]; }
  return null;
}
function polyTeams(e){
  if (e.teams && e.teams.length === 2) return e.teams;
  const sides = String(e.title || "").replace(/\s+-\s+more markets$/i, "").split(SIDES);
  return sides.length === 2 ? sides.map(x => ({name: x.trim(), abbr: "", alias: x.trim()})) : null;
}
const flat = s => norm(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function sameTeam(label, abbr, t){
  const k = flat(label);
  if (!k) return false;
  if (abbr && t.abbr && abbr.toLowerCase() === t.abbr.toLowerCase()) return true;
  const full = flat(t.name), alias = flat(t.alias), both = full + " " + alias;
  if (full === k || alias === k || full.startsWith(k) || alias.startsWith(k) || (k.length > 3 && full.endsWith(k))) return true;
  const kw = k.split(" ").filter(w => w.length > 2), bw = new Set(both.split(" "));
  return kw.length > 0 && kw.every(w => bw.has(w));
}
const isDraw = s => /\b(draw|tie)\b/i.test(s || "");
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);

function matchGames(polyEvents, kalshiEvents){
  const byDate = new Map();
  for (const e of polyEvents){
    const d = polyDate(e), t = polyTeams(e);
    if (d && t) (byDate.get(d) || byDate.set(d, []).get(d)).push({e, t});
  }
  const out = [], usedP = new Set(), usedK = new Set();
  for (const ke of kalshiEvents){
    if (!isKalshiGame(ke)) continue;
    const d = kalshiDate(ke);
    if (!d) continue;
    const kTeams = ke.markets.filter(m => !isDraw(m.label)).map(m => ({m, abbr: String(m.ticker || "").split("-").pop()}));
    if (kTeams.length !== 2) continue;
    // "Chiefs vs. Dolphins" and "Chiefs vs. Dolphins - More Markets" share the game; the plain one has the winner
    const cands = [d, addDays(d, -1), addDays(d, 1)].flatMap(x => byDate.get(x) || [])
      .filter(({e, t}) => !usedP.has(e) && kTeams.every(k => t.some(tt => sameTeam(k.m.label, k.abbr, tt))) &&
        !kTeams.every(k => t.filter(tt => sameTeam(k.m.label, k.abbr, tt)).length > 1))
      .sort((a, b) => /more markets/i.test(a.e.title) - /more markets/i.test(b.e.title));
    for (const {e: pe, t} of cands){
      const teamOf = label => t.find(tt => sameTeam(label, "", tt) || flat(label).includes(flat(tt.alias || tt.name)));
      const winner = pe.markets.filter(m => !m.smt || /moneyline/i.test(m.smt));
      const pairs = [];
      for (const km of ke.markets){
        const kt = isDraw(km.label) ? "draw" : t.find(tt => sameTeam(km.label, String(km.ticker || "").split("-").pop(), tt));
        if (!kt) continue;
        const pm = winner.find(m => kt === "draw" ? isDraw(m.label) : !isDraw(m.label) && teamOf(m.label) === kt);
        if (pm) pairs.push({pm, km, s: 1});
      }
      if (pairs.length < 2) continue;
      usedP.add(pe); usedK.add(ke);
      for (const o of pairs) out.push({pe, pm: o.pm, ke, km: o.km, sim: 1, eventSim: 1, game: true});
      break;
    }
  }
  return {out, usedP, usedK};
}

function matchAll(polyEvents, kalshiEvents, overrides = {}){
  const games = matchGames(polyEvents, kalshiEvents);
  polyEvents = polyEvents.filter(e => !games.usedP.has(e));
  kalshiEvents = kalshiEvents.filter(e => !games.usedK.has(e) && !isKalshiGame(e));
  const P = polyEvents.map(e => ({e, w: words(eventText(e))}));
  const K = kalshiEvents.map(e => ({e, w: words(eventText(e))}));
  // rarity of each word across both platforms
  const df = new Map(), N = P.length + K.length || 1;
  for (const x of P.concat(K)) for (const w of new Set(x.w)) df.set(w, (df.get(w) || 0) + 1);
  const idf = w => Math.log(1 + N / (df.get(w) || 1));
  // index Kalshi events by their rarer words
  const index = new Map();
  K.forEach((x, i) => { for (const w of new Set(x.w)) if ((df.get(w) || 0) <= Math.max(2, N * 0.05)) (index.get(w) || index.set(w, []).get(w)).push(i); });

  const block = new Set(overrides.block || []), force = overrides.force || {};
  const cands = [];
  P.forEach((p, pi) => {
    const seen = new Set();
    for (const w of new Set(p.w)) for (const ki of index.get(w) || []) seen.add(ki);
    for (const ki of seen){
      const k = K[ki];
      if (block.has(`${p.e.slug}|${k.e.id}`)) continue;
      if (!numbersAgree(p.w, k.w)) continue;
      // "will it hit $X" is a different question from "where will it close"; "exact outcome" from "who wins"
      if (!mustAgree(p.w, k.w)) continue;
      if (!namesAgree(p.e.title, k.e.title)) continue;
      if (!sidesAgree(p.e.title, k.e.title, idf)) continue;
      const x = score(p.w, k.w, idf), s = (x.cos + x.cover) / 2;
      if (s < 0.5) continue;
      const tp = Date.parse(p.e.end), tk = Date.parse(k.e.end);
      const days = isFinite(tp) && isFinite(tk) ? Math.abs(tp - tk) / DAY : 0;
      if (days > (s >= 0.7 ? 150 : 45)) continue;
      cands.push({pi, ki, s: s - Math.min(days, 60) / 600});
    }
  });
  for (const [slug, id] of Object.entries(force)){
    const pi = P.findIndex(p => p.e.slug === slug), ki = K.findIndex(k => k.e.id === id);
    if (pi >= 0 && ki >= 0) cands.push({pi, ki, s: 9});
  }
  cands.sort((a, b) => b.s - a.s);
  const usedP = new Set(), usedK = new Set(), out = [];
  for (const c of cands){
    if (usedP.has(c.pi) || usedK.has(c.ki)) continue;
    const pe = P[c.pi].e, ke = K[c.ki].e;
    const outs = matchOutcomes(pe, ke, idf);
    if (!outs.length) continue;
    const binary = pe.markets.length === 1 && ke.markets.length === 1;
    if (binary && c.s < 0.8) continue;   // a lone yes/no question has no outcome labels to confirm the match
    usedP.add(c.pi); usedK.add(c.ki);
    for (const o of outs){
      const sim = Math.min(1, c.s) * o.s;
      if (sim >= 0.5) out.push({pe, pm: o.pm, ke, km: o.km, sim, eventSim: c.s});
    }
  }
  return games.out.concat(out);
}

const slugify = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

module.exports = {matchAll, matchGames, matchOutcomes, words, direction, numbersAgree, slugify};

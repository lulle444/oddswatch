// Matching: which Polymarket event is the same question as which Kalshi event, and which outcome inside it is
// which. Titles are cut into words, common words dropped, synonyms folded ("GOP" is "Republican"), and rare words
// weigh more than common ones. Two events match when enough of their weighted words overlap, their years and
// numbers agree and they end close together. Every event matches at most one event on the other side.
// lib/pairs.js can force a pair or block one when the words mislead.

const STOP = new Set(("a an the of in on at to for by with and or vs v versus will be is are was were who what which when where how " +
  "does do did this that than there their it its as from next before after during between up down new than more most less least " +
  "winner win wins won winning market markets odds price prediction happen happens yes no any other another over under out get gets " +
  "party parties candidate nominee nominated nomination race races result results official officially announce announced end ends " +
  "by date day week month year").split(" "));

// whole phrases first, then single words
const PHRASES = [
  [/\bu\.?\s?s\.?\b/g, "us"], [/\bunited states\b/g, "us"], [/\bfederal reserve\b/g, "fed"], [/\binterest rates?\b/g, "rate"],
  [/\bhouse of representatives\b/g, "house"], [/\bnew york city\b/g, "nyc"], [/\bprime minister\b/g, "pm"],
  [/\bsuper bowl\b/g, "superbowl"], [/\bworld series\b/g, "worldseries"], [/\bworld cup\b/g, "worldcup"], [/\bstanley cup\b/g, "stanleycup"],
  [/\bnba finals\b/g, "nbafinals"], [/\bchampions league\b/g, "championsleague"], [/\bpremier league\b/g, "premierleague"],
  [/\bbasis points?\b/g, "bps"], [/(\d)\s?bps\b/g, "$1 bps"], [/\bno change\b/g, "hold"], [/\bunchanged\b/g, "hold"], [/\bpause\b/g, "hold"], [/\bgovernment shutdown\b/g, "shutdown"], [/\belon musk\b/g, "musk"],
  [/\bdonald trump\b/g, "trump"], [/\bdonald j\.? trump\b/g, "trump"],
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
  for (const [re, to] of PHRASES) t = t.replace(re, " " + to + " ");
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
      if (!numbersAgree(A, B)) continue;
      const na = A.filter(isNum), nb = B.filter(isNum);
      if ((na.length > 0) !== (nb.length > 0)) continue;
      let s;
      if (A.join(" ") === B.join(" ") && A.length) s = 1;
      else { const x = score(A, B, idf); s = (x.cover + x.jac) / 2; }
      if (s >= 0.5) cands.push({pm: a, km: b, s});
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

function matchAll(polyEvents, kalshiEvents, overrides = {}){
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
      const hitP = p.w.includes("reach"), hitK = k.w.includes("reach");
      if (hitP !== hitK) continue;   // "will it hit $X" is a different question from "where will it close"
      const x = score(p.w, k.w, idf), s = (x.cos + x.cover) / 2;
      if (s < 0.5) continue;
      const tp = Date.parse(p.e.end), tk = Date.parse(k.e.end);
      const days = isFinite(tp) && isFinite(tk) ? Math.abs(tp - tk) / DAY : 0;
      if (days > (s >= 0.85 ? 150 : 60)) continue;
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
    usedP.add(c.pi); usedK.add(c.ki);
    for (const o of outs) out.push({pe, pm: o.pm, ke, km: o.km, sim: Math.min(1, c.s) * o.s, eventSim: c.s});
  }
  return out;
}

const slugify = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

module.exports = {matchAll, matchOutcomes, words, direction, numbersAgree, slugify};

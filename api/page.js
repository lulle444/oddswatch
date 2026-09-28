// Server-rendered pages (vercel.json rewrites them here):
//   /q/<slug>             one question: both prices, the gap, the chart, and the other outcomes of the same event
//   /topic/<politics|…>   every question in one topic
//   /sitemap-questions.xml
// Each fills a template build.py writes, so the page reads fully before any script runs.
const fs = require("fs"), path = require("path");
const B = require("../brand.json");
const {board: getBoard, CATS} = require("../lib/odds");
const ARB = require("../arb.js");

const SITE = "https://" + B.domain;
const BOT = String(B.telegram || "").replace(/^@/, "");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let PAIR, TOPIC, NOTFOUND;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const pc = p => p == null ? "–" : (p * 100 < 9.95 && p * 100 > 0.05 ? (p * 100).toFixed(1) : Math.round(p * 100)) + "%";
const gp = g => g == null ? "–" : (g > 0 ? "+" : g < 0 ? "−" : "±") + Math.abs(g).toFixed(1);
const big = v => v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v || 0));
const cents = v => v == null ? "–" : Math.round(v * 100) + "¢";
const day = iso => { const t = Date.parse(iso); return isFinite(t) ? new Date(t).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}) : "–"; };
const catName = id => (CATS.find(c => c.id === id) || {name: "Other"}).name;
const startParam = id => String(id).replace(/\./g, "_");

// The same markup app.js draws: one question across the seam, bars growing out from the middle, the gap in orange.
function bars(r){
  const a = r.poly.p * 100, b = r.kalshi.p * 100;
  const fill = (me, other, col, dir) => me > other && me - other >= .5
    ? `background:linear-gradient(to ${dir},var(--b-${col}) 0 ${(other / me * 100).toFixed(1)}%,var(--b-gap) 0)` : `background:var(--b-${col})`;
  return `<span class="lb l"><i style="width:${Math.max(a, .4)}%;${fill(a, b, "poly", "left")}"></i></span><span class="lbm"></span><span class="lb r"><i style="width:${Math.max(b, .4)}%;${fill(b, a, "kalshi", "right")}"></i></span>`;
}
function duel(r){
  return `<div class="duel">
        <div class="side l"><small><i class="key poly"></i>Polymarket</small><b>${pc(r.poly.p)}</b></div>
        <div class="gapb"><small>gap</small>${gp(r.gap)}</div>
        <div class="side r"><small>Kalshi<i class="key kalshi"></i></small><b>${pc(r.kalshi.p)}</b></div>
        ${bars(r)}
      </div>`;
}
const lrow = r => `<li><a class="lrow${r.thin ? " thin" : ""}" href="/q/${r.slug}">
      <span class="lq"><b>${esc(r.outcome || r.title)}</b>${r.rules ? `<small class="flag">Dates differ</small>` : ""}</span>
      <span class="ls l"><small></small><b>${pc(r.poly.p)}</b></span>
      <span class="lg${Math.abs(r.gap) >= 5 && !r.thin ? " big" : ""}">${gp(r.gap)}</span>
      <span class="ls r"><b>${pc(r.kalshi.p)}</b><small></small></span>
      ${bars(r)}</a></li>`;

function summary(r){
  const who = r.outcome ? `“${r.outcome}”` : "Yes";
  const g = Math.abs(r.gap);
  const lead = g < 1 ? "The two markets agree" : `${r.gap > 0 ? "Polymarket" : "Kalshi"} is ${g.toFixed(1)} points more confident`;
  return `Polymarket gives ${who} a ${pc(r.poly.p)} chance and Kalshi ${pc(r.kalshi.p)}. ${lead}.` + (r.thin ? " One side trades thinly, so the gap may not be real." : "");
}

const usd2 = v => (v < 0 ? "−$" : "$") + Math.abs(v).toFixed(2);
const legText = (leg, side) => leg ? `Buy <b>${side}</b> at ${cents(leg.p)}` : "–";

// The trade across both: which side to buy where, and what $100 locks in after fees. app.js redraws it for any stake.
function arbSection(r){
  const a = ARB.plan(r, 100);
  if (!a) return `  <section class="arb" id="arb"><h2 class="center">The trade across both</h2><p class="sub center">One of the order books is empty right now, so there is no price to buy at on both sides.</p></section>`;
  const pl = a.yes.at === "poly" ? [a.yes, "Yes"] : [a.no, "No"], kl = a.yes.at === "kalshi" ? [a.yes, "Yes"] : [a.no, "No"];
  return `  <section class="arb" id="arb">
    <p class="eyebrow center">Arbitrage calculator</p>
    <h2 class="center">The trade <em>across both</em></h2>
    <p class="sub center narrow">Buy Yes where it is cheaper and No where it is dearer. One of the two pays $1 whatever happens, so if both cost less than $1 with fees, the difference is yours.</p>
    <div class="arblegs">
      <div class="half l"><small><i class="key poly"></i>Polymarket</small><span id="arbP">${legText(...pl)}</span></div>
      <div class="arbmid"><small>both for</small><b id="arbCost">${cents(a.cost)}</b></div>
      <div class="half r"><small>Kalshi<i class="key kalshi"></i></small><span id="arbK">${legText(...kl)}</span></div>
    </div>
    <label class="stake"><span>Stake</span><b>$</b><input id="stake" type="number" inputmode="decimal" min="1" max="1000000" step="10" value="100" aria-label="Stake in dollars"></label>
    <div class="facts arbfacts" id="arbFacts">${arbFacts(a)}</div>
    <p class="verdict center" id="arbVerdict">${arbVerdict(a, r)}</p>
    <p class="fine center narrow">At the best price on each book right now, with taker fees: this Polymarket market charges ${(a.polyRate * 100).toFixed(a.polyRate * 100 % 1 ? 1 : 0)}% × price × (1 − price) per share, Kalshi 7% × price × (1 − price) per contract. Only the size resting at the best price fills there, your money is tied up until the end, and it only works if both platforms settle the question the same way, so read the rules below. Not financial advice.</p>
  </section>`;
}
function arbFacts(a){
  const row = (h, v) => `<span class="v l">${h}</span><span class="h"></span><span class="v r">${v}</span>`;
  return row("Contracts on each side", String(a.contracts)) + row("Cost with fees", usd2(a.spent)) + row("of which fees", usd2(a.fees)) +
    row("Pays at the end", usd2(a.payout)) + row("Profit", `<b class="${a.profit > 0 ? "up" : "down"}">${usd2(a.profit)}</b>`) +
    row("Return", `${(a.ret * 100).toFixed(1)}%${a.yearly != null && a.days >= 7 ? ` · ${(a.yearly * 100).toFixed(0)}% a year` : ""}`);
}
function arbVerdict(a, r){
  if (r.live) return `The game is under way, so these prices move by the second and may be gone before you trade.`;
  if (r.thin && a.edge > 0) return `One side trades thinly, so this price may not be real. <b>${(a.edge * 100).toFixed(1)}¢</b> on every $1 on paper.`;
  if (a.edge > 0.2) return `<b>${(a.edge * 100).toFixed(1)}¢</b> on every $1 is too good to be true: the two questions probably differ. Read the rules below.`;
  return a.edge > 0 ? `Locked in: <b class="up">${(a.edge * 100).toFixed(1)}¢</b> on every $1, if both settle the same way.`
    : `No locked-in profit now: both sides cost ${(a.perPair * 100).toFixed(1)}¢ with fees for a $1 payout.`;
}

// The rule texts, fetched from both platforms when the page renders (the CDN keeps the page for a few minutes).
async function rulesOf(r){
  const get = (u, ms = 3500) => fetch(u, {headers: {accept: "application/json"}, signal: AbortSignal.timeout(ms)}).then(x => x.ok ? x.json() : null).catch(() => null);
  const [k, p] = await Promise.all([get(`https://api.elections.kalshi.com/trade-api/v2/markets/${encodeURIComponent(r.kalshi.ticker)}`), r.poly.market ? get(`https://gamma-api.polymarket.com/markets/${encodeURIComponent(r.poly.market)}`) : null]);
  const km = k && k.market;
  return {poly: p && p.description ? p.description : null, kalshi: km ? [km.rules_primary, km.rules_secondary].filter(Boolean).join("\n\n") : null};
}
const para = t => esc(t).split(/\n+/).filter(Boolean).map(x => `<p>${x}</p>`).join("");
function rulesSection(r, txt){
  const flag = r.rules ? `<p class="rulesflag center"><b>The dates differ.</b> Polymarket’s question ends ${esc(day(r.poly.end))} and Kalshi’s settles ${esc(day(r.kalshi.end))}, ${Math.abs(r.rules.days)} days ${r.rules.days > 0 ? "later" : "earlier"}. A gap can be fair when the two ask about different windows.</p>` : "";
  const src = r.kalshi.sources && r.kalshi.sources.length ? r.kalshi.sources.map(esc).join(", ") : "Not named";
  return `    <div class="mirror wording">
      <h2 class="center">The rules, <em>side by side</em></h2>
      ${flag}
      <div class="half l"><p class="rq">${esc(r.poly.question || r.title)}${r.outcome ? ` <b>(${esc(r.outcome)})</b>` : ""}</p>
        <dl><div><dt>Ends</dt><dd>${esc(day(r.poly.end))}</dd></div><div><dt>Source</dt><dd>${esc(r.poly.source || "Named in the rules")}</dd></div></dl>
        ${txt.poly ? `<details><summary>Polymarket’s rules</summary>${para(txt.poly)}</details>` : `<p class="fine">Read the rules on <a href="${esc(r.poly.url)}" target="_blank" rel="noopener">Polymarket</a>.</p>`}</div>
      <div class="half r"><p class="rq">${esc(r.kalshi.question || r.kalshi.title)}${r.kOutcome ? ` <b>(${esc(r.kOutcome)})</b>` : ""}</p>
        <dl><div><dt>Settles</dt><dd>${esc(day(r.kalshi.end))}</dd></div><div><dt>Source</dt><dd>${src}</dd></div></dl>
        ${txt.kalshi ? `<details><summary>Kalshi’s rules</summary>${para(txt.kalshi)}</details>` : `<p class="fine">Read the rules on <a href="${esc(r.kalshi.url)}" target="_blank" rel="noopener">Kalshi</a>.</p>`}</div>
      <p class="fine center narrow">We match these automatically. A different source, deadline or definition can explain a gap, and it can make the two settle differently. <a href="/record">See the ones that did</a>.</p>
    </div>`;
}

function pairPage(b, r, txt){
  const siblings = b.pairs.filter(x => x.title === r.title && x.id !== r.id && x.kalshi.event === r.kalshi.event).sort((x, y) => y.poly.p + y.kalshi.p - x.poly.p - x.kalshi.p);
  const row = (h, p, k) => `<span class="v l">${p}</span><span class="h">${h}</span><span class="v r">${k}</span>`;
  const chg = (now, prev) => prev == null ? "–" : gp((now - prev) * 100) + " pts";
  const bellBtn = BOT ? `<a class="btn" href="https://t.me/${BOT}?start=g_${encodeURIComponent(startParam(r.id))}" target="_blank" rel="noopener"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg> Alert me</a>` : "";
  const shareText = encodeURIComponent(`${r.title}${r.outcome ? " · " + r.outcome : ""}: Polymarket ${pc(r.poly.p)}, Kalshi ${pc(r.kalshi.p)}.`);
  const main = `  <section class="pagehead qhead">
    <p class="eyebrow center">${esc(catName(r.cat))} · ends ${esc(day(r.end))}</p>
    <h1 class="center">${esc(r.title)}</h1>
    <p class="lede center">${r.outcome ? `<b>${esc(r.outcome)}</b>. ` : ""}${esc(summary(r))}</p>
  </section>
  <section class="pair" id="pair" data-id="${esc(r.id)}">
    <div class="spotlight"><div id="duelBox">${duel(r)}</div></div>
    <div class="facts">
      ${row("Chance", pc(r.poly.p), pc(r.kalshi.p))}
      ${row("Best bid / ask", `${cents(r.poly.bid)} / ${cents(r.poly.ask)}`, `${cents(r.kalshi.bid)} / ${cents(r.kalshi.ask)}`)}
      ${row("24h change", chg(r.poly.p, r.poly.chg1d == null ? null : r.poly.p - r.poly.chg1d), chg(r.kalshi.p, r.kalshi.prev))}
      ${row("Traded, 24h", "$" + big(r.poly.vol24), big(r.kalshi.vol24) + " ct")}
      ${row("Traded, all time", "$" + big(r.poly.vol), big(r.kalshi.vol) + " ct")}
    </div>
    <p class="mirrorlinks"><span class="l"><a class="btn poly" href="${esc(r.poly.url)}" target="_blank" rel="noopener">Polymarket ↗</a></span><span class="m">${bellBtn}<button class="btn starbtn" type="button" data-star="${esc(r.id)}" aria-pressed="false"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.5l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z" fill="currentColor" fill-opacity="var(--sf,0)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> Star</button><a class="btn" href="https://x.com/intent/post?text=${shareText}&amp;url=${encodeURIComponent(SITE + "/q/" + r.slug)}${B.x ? "&amp;via=" + B.x : ""}" target="_blank" rel="noopener">Share on X</a></span><span class="r"><a class="btn kalshi" href="${esc(r.kalshi.url)}" target="_blank" rel="noopener">Kalshi ↗</a></span></p>
${arbSection(r)}
    <div class="chartpanel">
      <div class="charthead">
        <div class="legend"><span><i class="key poly"></i>Polymarket</span><span><i class="key kalshi"></i>Kalshi</span><span><i class="key gap"></i>Gap</span></div>
        <div class="seg" id="range" role="group" aria-label="Time range"><button data-days="1">24H</button><button data-days="7" aria-pressed="true">7D</button><button data-days="30">30D</button></div>
      </div>
      <div class="pairchart" id="pairChart"><p class="empty">Loading the chart…</p></div>
      <p class="fine">Prices saved every hour. Each is the chance the market gives this outcome.</p>
    </div>
${rulesSection(r, txt)}
  </section>
${siblings.length ? `  <section class="ledgerwrap">
    <div class="ledgerhead center"><h2>Other outcomes</h2><p class="sub">The rest of “${esc(r.title)}”, priced on both.</p></div>
    <ol class="ledger compact">
${siblings.slice(0, 30).map(lrow).join("\n")}
    </ol>
  </section>` : ""}
  <p class="block center"><a class="btn" href="/">Every question on both</a> <a class="btn" href="/gaps">The biggest gaps</a> <a class="btn" href="/topic/${r.cat}">More ${esc(catName(r.cat).toLowerCase())}</a></p>`;
  const title = `${r.title}${r.outcome ? ": " + r.outcome : ""} odds, Polymarket vs Kalshi · ${B.name}`;
  const ld = {"@context": "https://schema.org", "@type": "WebPage", name: title, url: `${SITE}/q/${r.slug}`, description: summary(r), dateModified: new Date(b.t).toISOString()};
  return PAIR.replace(/__SLUG__/g, esc(r.slug)).replace(/__TITLE__/g, esc(title)).replace(/__DESC__/g, esc(summary(r)))
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n</head>`)
    .replace("__MAIN__", main);
}

const TOPIC_LEDE = {
  politics: "Elections, leaders and laws, priced on Polymarket and Kalshi side by side.",
  economy: "The Fed, inflation, jobs and companies, priced on Polymarket and Kalshi side by side.",
  sports: "Games, seasons and awards, priced on Polymarket and Kalshi side by side.",
  crypto: "Bitcoin, Ethereum and the rest, priced on Polymarket and Kalshi side by side.",
  culture: "Awards, charts, the weather and tech, priced on Polymarket and Kalshi side by side.",
};

module.exports = async function handler(req, res){
  PAIR = PAIR || read("templates/pair.html");
  TOPIC = TOPIC || read("templates/topic.html");
  NOTFOUND = NOTFOUND || read("404.html");
  const q = req.query || {};
  try {
    const b = await getBoard();
    if (q.sitemap){
      res.setHeader("content-type", "application/xml; charset=utf-8");
      res.setHeader("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
      const liq = b.pairs.filter(r => !r.thin).concat(b.pairs.filter(r => r.thin)).slice(0, 2000);
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        liq.map(r => `  <url><loc>${SITE}/q/${r.slug}</loc></url>`).join("\n") + "\n</urlset>\n");
    }
    if (q.p === "topic"){
      const t = String(q.t || "").toLowerCase();
      if (!TOPIC_LEDE[t]) throw Object.assign(new Error("no topic"), {status: 404});
      const n = b.pairs.filter(r => r.cat === t).length, name = catName(t);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "public, s-maxage=600, stale-while-revalidate=3600");
      return res.status(200).send(TOPIC.replace(/__TOPIC__/g, t).replace(/__NAME__/g, name).replace(/__LOWER__/g, name.toLowerCase())
        .replace(/__LEDE__/g, `${TOPIC_LEDE[t]} ${n} questions right now.`).replace(/__DESC__/g, `${n} ${name.toLowerCase()} questions priced on both Polymarket and Kalshi, side by side and live, with the gap between them.`));
    }
    const s = String(q.s || "").toLowerCase();
    const r = b.pairs.find(x => x.slug === s) || b.pairs.find(x => x.id.toLowerCase() === s);
    if (!r) throw Object.assign(new Error("no question"), {status: 404});
    if (r.slug !== s){ res.setHeader("cache-control", "public, s-maxage=3600"); return res.redirect(301, "/q/" + r.slug); }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "public, s-maxage=180, stale-while-revalidate=1800");
    res.status(200).send(pairPage(b, r, await rulesOf(r)));
  } catch (e) {
    if (e.status !== 404) console.error("page:", e);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", e.status === 404 ? "public, s-maxage=300" : "no-store");
    res.status(e.status || 502).send(NOTFOUND);
  }
};

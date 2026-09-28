// Server-rendered pages (vercel.json rewrites them here):
//   /q/<slug>             one question: both prices, the gap, the chart, and the other outcomes of the same event
//   /topic/<politics|…>   every question in one topic
//   /sitemap-questions.xml
// Each fills a template build.py writes, so the page reads fully before any script runs.
const fs = require("fs"), path = require("path");
const B = require("../brand.json");
const {board: getBoard, CATS} = require("../lib/odds");

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

function duel(r){
  const a = r.poly.p * 100, b = r.kalshi.p * 100, lo = Math.min(a, b), hi = Math.max(a, b);
  return `<div class="duel">
        <div class="side poly"><small><span class="key poly"></span>Polymarket</small><b>${pc(r.poly.p)}</b></div>
        <div class="gapb"><small>gap</small>${gp(r.gap)}</div>
        <div class="side kalshi"><small><span class="key kalshi"></span>Kalshi</small><b>${pc(r.kalshi.p)}</b></div>
      </div><div class="track" role="img" aria-label="Polymarket ${pc(r.poly.p)}, Kalshi ${pc(r.kalshi.p)}">
      <span class="band" style="left:${lo}%;width:${Math.max(hi - lo, .6)}%"></span>
      <span class="pin kalshi" style="left:${b}%"></span><span class="pin poly" style="left:${a}%"></span></div>
      <div class="trackscale"><span>0%</span><span>50%</span><span>100%</span></div>`;
}

function summary(r){
  const who = r.outcome ? `“${r.outcome}”` : "Yes";
  const g = Math.abs(r.gap);
  const lead = g < 1 ? "The two markets agree" : `${r.gap > 0 ? "Polymarket" : "Kalshi"} is ${g.toFixed(1)} points more confident`;
  return `Polymarket gives ${who} a ${pc(r.poly.p)} chance and Kalshi ${pc(r.kalshi.p)}. ${lead}.` + (r.thin ? " One side trades thinly, so the gap may not be real." : "");
}

function pairPage(b, r){
  const siblings = b.pairs.filter(x => x.title === r.title && x.id !== r.id && x.kalshi.event === r.kalshi.event).sort((x, y) => y.poly.p + y.kalshi.p - x.poly.p - x.kalshi.p);
  const row = (h, p, k) => `<span class="h">${h}</span><span class="v" style="color:var(--b-poly)">${p}</span><span class="v" style="color:var(--b-kalshi)">${k}</span>`;
  const chg = (now, prev) => prev == null ? "–" : gp((now - prev) * 100) + " pts";
  const bellBtn = BOT ? `<a class="btn" href="https://t.me/${BOT}?start=g_${encodeURIComponent(startParam(r.id))}" target="_blank" rel="noopener"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg> Alert me</a>` : "";
  const shareText = encodeURIComponent(`${r.title}${r.outcome ? " · " + r.outcome : ""}: Polymarket ${pc(r.poly.p)}, Kalshi ${pc(r.kalshi.p)}.`);
  const main = `  <section class="pagehead qhead">
    <p class="eyebrow">${esc(catName(r.cat))} · ends ${esc(day(r.end))}</p>
    <h1>${esc(r.title)}</h1>
    <p class="lede">${r.outcome ? `<b>${esc(r.outcome)}</b>. ` : ""}${esc(summary(r))}</p>
  </section>
  <section class="pair" id="pair" data-id="${esc(r.id)}">
    <div class="panel bigduel">
      <div id="duelBox">${duel(r)}</div>
      <div class="sectionhead" style="margin:26px 0 0">
        <div class="legend"><span><span class="key poly"></span>Polymarket</span><span><span class="key kalshi"></span>Kalshi</span><span><span class="key gap"></span>Gap</span></div>
        <div class="seg" id="range" role="group" aria-label="Time range"><button data-days="1">24H</button><button data-days="7" aria-pressed="true">7D</button><button data-days="30">30D</button></div>
      </div>
      <div class="pairchart" id="pairChart"><p class="empty">Loading the chart…</p></div>
      <p class="fine">Prices saved every hour. Each is the chance the market gives this outcome.</p>
    </div>
    <aside class="panel">
      <h3>Side by side</h3>
      <div class="facts" style="margin-top:10px">
        <span class="h"></span><span class="v" style="font-family:var(--f-body);font-size:12.5px;color:var(--b-muted)">Polymarket</span><span class="v" style="font-family:var(--f-body);font-size:12.5px;color:var(--b-muted);padding-left:14px">Kalshi</span>
        ${row("Chance", pc(r.poly.p), pc(r.kalshi.p))}
        ${row("Best bid / ask", `${cents(r.poly.bid)} / ${cents(r.poly.ask)}`, `${cents(r.kalshi.bid)} / ${cents(r.kalshi.ask)}`)}
        ${row("24h change", chg(r.poly.p, r.poly.chg1d == null ? null : r.poly.p - r.poly.chg1d), chg(r.kalshi.p, r.kalshi.prev))}
        ${row("Traded, 24h", "$" + big(r.poly.vol24), big(r.kalshi.vol24) + " ct")}
        ${row("Traded, all time", "$" + big(r.poly.vol), big(r.kalshi.vol) + " ct")}
      </div>
      <div class="links"><a class="btn poly" href="${esc(r.poly.url)}" target="_blank" rel="noopener">Polymarket ↗</a><a class="btn kalshi" href="${esc(r.kalshi.url)}" target="_blank" rel="noopener">Kalshi ↗</a>${bellBtn}
        <a class="btn" href="https://x.com/intent/post?text=${shareText}&amp;url=${encodeURIComponent(SITE + "/q/" + r.slug)}${B.x ? "&amp;via=" + B.x : ""}" target="_blank" rel="noopener">Share on X</a></div>
      <div class="rules" style="margin-top:22px">
        <h3>How each one words it</h3>
        <p><span class="key poly"></span>${esc(r.poly.question || r.title)}${r.outcome ? ` <b>(${esc(r.outcome)})</b>` : ""}</p>
        <p><span class="key kalshi"></span>${esc(r.kalshi.question || r.kalshi.title)}${r.kOutcome ? ` <b>(${esc(r.kOutcome)})</b>` : ""}</p>
        <p>We match these automatically. Check both platforms’ rules before you trade: a different source or deadline can explain a gap.</p>
      </div>
    </aside>
  </section>
${siblings.length ? `  <section class="panel board">
    <div class="sectionhead"><div><h2>Other outcomes</h2><p class="sub">The rest of “${esc(r.title)}”, priced on both.</p></div></div>
    <div class="tablebox"><table class="ot"><thead><tr><th scope="col">Outcome</th><th scope="col" class="r"><span class="key poly"></span>Polymarket</th><th scope="col" class="r"><span class="key kalshi"></span>Kalshi</th><th scope="col" class="r">Gap</th></tr></thead><tbody>
${siblings.slice(0, 30).map(x => `      <tr class="${x.thin ? "thin" : ""}"><td><a class="qn" href="/q/${x.slug}">${esc(x.outcome || x.title)}</a></td><td class="r pp">${pc(x.poly.p)}</td><td class="r kp">${pc(x.kalshi.p)}</td><td class="r">${gp(x.gap)}</td></tr>`).join("\n")}
    </tbody></table></div>
  </section>` : ""}
  <p class="block"><a class="btn" href="/">Every question on both</a> <a class="btn" href="/gaps">The biggest gaps</a> <a class="btn" href="/topic/${r.cat}">More ${esc(catName(r.cat).toLowerCase())}</a></p>`;
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
    res.status(200).send(pairPage(b, r));
  } catch (e) {
    if (e.status !== 404) console.error("page:", e);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", e.status === 404 ? "public, s-maxage=300" : "no-store");
    res.status(e.status || 502).send(NOTFOUND);
  }
};

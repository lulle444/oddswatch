// Share-preview images (1200×630 PNG) with live numbers. Pages point their og:image here, and X fetches it when a
// link is shared: /api/og?p=home, ?p=gaps, ?p=midterms, ?p=topic&t=politics, ?p=q&s=<question slug>.
// Name, colors and fonts come from brand.json. Anything that fails falls back to the static assets/og.png.
const fs = require("fs"), path = require("path");
const B = require("../brand.json");
const {board: getBoard, CATS} = require("../lib/odds");

const K = B.colors, F = B.fonts;
let logo;
const logoUri = () => logo || (logo = "data:image/svg+xml;base64," + fs.readFileSync(path.join(__dirname, "..", "assets", "logo-mark.svg")).toString("base64"));
const pc = p => p == null ? "–" : (p * 100 < 9.95 && p * 100 > 0.05 ? (p * 100).toFixed(1) : Math.round(p * 100)) + "%";
const gp = g => (g > 0 ? "+" : g < 0 ? "−" : "±") + Math.abs(g).toFixed(1);
const big = v => v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v || 0));
const cut = (s, n) => s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const catName = id => (CATS.find(c => c.id === id) || {name: "Other"}).name;

// tiny element builder for @vercel/og (it takes React-shaped objects)
const h = (style, ...children) => ({type: "div", props: {style: {display: "flex", ...style}, children: children.flat().filter(c => c != null && c !== false)}});

let fonts;
async function loadFonts(){
  if (fonts) return fonts;
  const want = [[F.display, 700], [F.body, 500], [F.body, 600], [F.mono, 500]];
  const out = [];
  await Promise.all(want.map(async ([name, weight]) => {
    try {
      // without a browser user agent Google Fonts answers with TTF, which the renderer can read
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:wght@${weight}`, {signal: AbortSignal.timeout(5000)})).text();
      const url = (css.match(/src: url\((.+?)\) format\('(truetype|opentype|woff)'\)/) || [])[1];
      if (!url) return;
      out.push({name, weight, style: "normal", data: await (await fetch(url, {signal: AbortSignal.timeout(5000)})).arrayBuffer()});
    } catch (e) {}
  }));
  fonts = out;
  return fonts;
}

// The frame every card shares: the wordmark, an eyebrow, faint odds lines, and a footer with the address.
function frame(eyebrow, path, ...body){
  const [w1, w2] = B.wordmark;
  return h({width: 1200, height: 630, flexDirection: "column", padding: "50px 64px 38px", fontFamily: F.body, color: K.ink, backgroundColor: K.bg, position: "relative"},
    {type: "svg", props: {width: 1200, height: 630, viewBox: "0 0 1200 630", style: {position: "absolute", left: 0, top: 0},
      children: [
        {type: "path", props: {d: "M0 470 C200 430 320 520 520 470 S860 380 1200 420", fill: "none", stroke: K.poly, strokeWidth: 3, opacity: 0.13}},
        {type: "path", props: {d: "M0 510 C220 480 340 560 540 520 S880 450 1200 480", fill: "none", stroke: K.kalshi, strokeWidth: 3, opacity: 0.13}},
      ]}},
    h({alignItems: "center", justifyContent: "space-between"},
      h({alignItems: "center"},
        {type: "img", props: {src: logoUri(), width: 50, height: 50, style: {marginRight: 14, borderRadius: 12}}},
        h({fontFamily: F.display, fontWeight: 700, fontSize: 36, letterSpacing: -1}, w1, h({color: K.poly}, w2))),
      h({fontFamily: F.mono, fontWeight: 500, fontSize: 19, letterSpacing: 2.5, color: K.muted, textTransform: "uppercase"}, eyebrow)),
    h({flexDirection: "column", flex: 1}, ...body),
    h({fontSize: 19, color: K.muted, justifyContent: "space-between", borderTop: `1.5px solid ${K.line}`, paddingTop: 14},
      h({fontFamily: F.mono, fontWeight: 500}, B.domain + path), h({}, (B.x ? "@" + B.x + " · " : "") + "Polymarket vs Kalshi, live")));
}

// The two prices, big, with the gap between them
function duel(r, size = 120){
  const a = r.poly.p * 100, b = r.kalshi.p * 100, lo = Math.min(a, b), hi = Math.max(a, b), W = 1072;
  return h({flexDirection: "column"},
    h({alignItems: "flex-end", justifyContent: "space-between"},
      h({flexDirection: "column"}, h({fontSize: 24, color: K.muted, fontWeight: 500}, "Polymarket"),
        h({fontFamily: F.mono, fontWeight: 500, fontSize: size, lineHeight: 1, color: K.poly, letterSpacing: -4}, pc(r.poly.p))),
      h({flexDirection: "column", alignItems: "center", marginBottom: 14, backgroundColor: rgba(K.gap, 0.12), color: K.gap, borderRadius: 16, padding: "10px 22px"},
        h({fontSize: 16, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600}, "gap"),
        h({fontFamily: F.mono, fontWeight: 500, fontSize: 40}, gp(r.gap) + " pts")),
      h({flexDirection: "column", alignItems: "flex-end"}, h({fontSize: 24, color: K.muted, fontWeight: 500}, "Kalshi"),
        h({fontFamily: F.mono, fontWeight: 500, fontSize: size, lineHeight: 1, color: K.kalshi, letterSpacing: -4}, pc(r.kalshi.p)))),
    h({position: "relative", height: 22, width: W, backgroundColor: K.bg2, borderRadius: 11, marginTop: 26},
      h({position: "absolute", left: W * lo / 100, width: Math.max(8, W * (hi - lo) / 100), top: 0, height: 22, backgroundColor: rgba(K.gap, 0.33), borderRadius: 11}),
      h({position: "absolute", left: W * b / 100 - 5, top: -7, width: 10, height: 36, borderRadius: 5, backgroundColor: K.kalshi, border: `3px solid ${K.bg}`}),
      h({position: "absolute", left: W * a / 100 - 5, top: -7, width: 10, height: 36, borderRadius: 5, backgroundColor: K.poly, border: `3px solid ${K.bg}`})));
}

// A list of gaps: question, both prices, the gap
function gapList(rows){
  return h({flexDirection: "column", backgroundColor: K.panel, border: `1px solid ${K.line}`, borderRadius: 16, padding: "6px 26px"},
    ...rows.map((r, i) => h({alignItems: "center", padding: "13px 0", borderBottom: i < rows.length - 1 ? `1px solid ${K.line}` : "none", fontSize: 24},
      h({flex: 1, flexDirection: "column", paddingRight: 20},
        h({fontWeight: 600}, cut(r.title, 52)), r.outcome ? h({fontSize: 19, color: K.muted}, cut(r.outcome, 60)) : null),
      h({width: 120, justifyContent: "flex-end", fontFamily: F.mono, fontWeight: 500, color: K.poly}, pc(r.poly.p)),
      h({width: 120, justifyContent: "flex-end", fontFamily: F.mono, fontWeight: 500, color: K.kalshi}, pc(r.kalshi.p)),
      h({width: 150, justifyContent: "flex-end", fontFamily: F.mono, fontWeight: 500, color: K.gap}, gp(r.gap) + " pts"))));
}

const liquidGaps = (b, n) => b.pairs.filter(r => !r.thin).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, n);

const CARDS = {
  async home(){
    const b = await getBoard(), r = liquidGaps(b, 1)[0];
    return frame("Same event, different odds", "",
      h({flexDirection: "column", marginTop: 34},
        h({fontFamily: F.display, fontWeight: 700, fontSize: 68, lineHeight: 1.02, letterSpacing: -2}, "Polymarket vs Kalshi,"),
        h({fontFamily: F.display, fontWeight: 700, fontSize: 68, lineHeight: 1.02, letterSpacing: -2, color: K.poly}, "side by side."),
        h({fontSize: 26, color: K.muted, marginTop: 18}, `${b.pairs.length} questions priced on both. The biggest gap right now:`)),
      r ? h({flexDirection: "column", marginTop: 26},
        h({fontSize: 27, fontWeight: 600, marginBottom: 6}, cut(r.title + (r.outcome ? " · " + r.outcome : ""), 70)),
        h({fontFamily: F.mono, fontWeight: 500, fontSize: 34},
          h({color: K.poly}, "Poly " + pc(r.poly.p)), h({color: K.muted, margin: "0 18px"}, "vs"), h({color: K.kalshi}, "Kalshi " + pc(r.kalshi.p)),
          h({color: K.gap, marginLeft: 26}, gp(r.gap) + " pts"))) : null);
  },
  async gaps(){
    const b = await getBoard(), rows = liquidGaps(b, 5);
    if (!rows.length) return null;
    return frame("Biggest gaps right now", "/gaps",
      h({fontFamily: F.display, fontWeight: 700, fontSize: 52, letterSpacing: -1.5, marginTop: 26, marginBottom: 18}, "Where the two markets disagree"),
      gapList(rows));
  },
  async midterms(){
    const b = await getBoard();
    const find = (re, party) => b.pairs.find(r => re.test(r.title) && new RegExp(party, "i").test(r.outcome || ""));
    const rows = [["House", /\bhouse\b/i], ["Senate", /\bsenate\b/i]].map(([n, re]) => ({n, d: find(re, "democrat"), r: find(re, "republican")})).filter(x => x.d || x.r);
    if (!rows.length) return null;
    const bar = p => h({height: 44, width: 760, borderRadius: 10, backgroundColor: K.bg2, overflow: "hidden"},
      h({width: Math.round(760 * p), height: 44, backgroundColor: "#2C5BB8", alignItems: "center", paddingLeft: 14, color: "#fff", fontFamily: F.mono, fontWeight: 500, fontSize: 22}, "D " + pc(p)),
      h({flex: 1, height: 44, backgroundColor: "#B83A3A", alignItems: "center", justifyContent: "flex-end", paddingRight: 14, color: "#fff", fontFamily: F.mono, fontWeight: 500, fontSize: 22}, "R " + pc(1 - p)));
    const dem = (x, side) => x.d ? x.d[side].p : 1 - x.r[side].p;
    return frame("US midterms · Nov 3", "/midterms",
      h({fontFamily: F.display, fontWeight: 700, fontSize: 56, letterSpacing: -1.5, marginTop: 22, marginBottom: 14}, "Who wins Congress, priced twice"),
      ...rows.map(x => h({flexDirection: "column", marginTop: 14},
        h({fontSize: 26, fontWeight: 600, marginBottom: 8}, x.n),
        h({alignItems: "center", marginBottom: 8}, h({width: 190, fontSize: 22, color: K.poly, fontWeight: 600}, "Polymarket"), bar(dem(x, "poly"))),
        h({alignItems: "center"}, h({width: 190, fontSize: 22, color: K.kalshi, fontWeight: 600}, "Kalshi"), bar(dem(x, "kalshi"))))));
  },
  async topic(q){
    const b = await getBoard(), t = String(q.t || "");
    const rows = b.pairs.filter(r => r.cat === t && !r.thin).sort((x, y) => (y.poly.vol24 + y.kalshi.vol24) - (x.poly.vol24 + x.kalshi.vol24)).slice(0, 5);
    if (!rows.length) return null;
    return frame(catName(t), "/topic/" + t,
      h({fontFamily: F.display, fontWeight: 700, fontSize: 52, letterSpacing: -1.5, marginTop: 26, marginBottom: 18}, `${catName(t)}, priced twice`),
      gapList(rows));
  },
  async q(q){
    const b = await getBoard(), s = String(q.s || "").toLowerCase(), r = s && b.pairs.find(x => x.slug === s);
    if (!r) return null;
    const t = r.title.length > 60 ? 44 : 56;
    return frame(catName(r.cat), "/q/" + r.slug,
      h({flexDirection: "column", marginTop: 26},
        h({fontFamily: F.display, fontWeight: 700, fontSize: t, lineHeight: 1.05, letterSpacing: -1.5}, cut(r.title, 90)),
        r.outcome ? h({fontSize: 30, color: K.muted, marginTop: 10, fontWeight: 500}, cut(r.outcome, 60)) : null),
      h({flex: 1}),
      duel(r, r.outcome ? 104 : 120),
      h({height: 18}));
  },
};

module.exports = async function handler(req, res){
  const q = req.query || {}, p = String(q.p || "home");
  const fallback = () => { res.setHeader("Cache-Control", "public, s-maxage=600"); res.redirect(302, "/assets/og.png"); };
  if (!CARDS[p]) return fallback();
  try {
    const [c, f, {ImageResponse}] = await Promise.all([CARDS[p](q), loadFonts(), import("@vercel/og")]);
    if (!c) return fallback();
    const img = new ImageResponse(c, {width: 1200, height: 630, fonts: f.length ? f : undefined});
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    res.status(200).end(buf);
  } catch (e) {
    console.error("og", p, e);
    fallback();
  }
};

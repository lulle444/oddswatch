// Prints what the live data looks like and every pair the matcher finds. Run by .github/workflows/probe.yml,
// because the build sandbox can't reach the two APIs.
const {board} = require("../lib/odds");
(async () => {
  const raw = async u => (await fetch(u)).json();
  const pe = await raw("https://gamma-api.polymarket.com/events?limit=1&active=true&closed=false&order=volume24hr&ascending=false");
  const e = pe[0]; if (e) { const m = e.markets[0]; console.log("POLY EVENT KEYS", Object.keys(e).join(",")); console.log("POLY MARKET", JSON.stringify(m).slice(0, 1800)); }
  const ke = await raw("https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=2");
  const k = ke.events && ke.events[0]; if (k) { console.log("KALSHI EVENT KEYS", Object.keys(k).join(",")); console.log("KALSHI MARKET", JSON.stringify(k.markets[0]).slice(0, 1800)); }
  const b = await board();
  console.log("\nCOUNTS", JSON.stringify(b.counts), "ms", b.ms);
  console.log("CATS", b.cats.map(c => c.id + ":" + c.count).join(" "));
  console.log("\nPAIRS (poly vs kalshi)", b.pairs.filter(r => r.sim === 1 && r.cat === "sports").length, "game-ish");
  for (const r of b.pairs) console.log(`${r.cat.padEnd(8)} ${(r.poly.p * 100).toFixed(1).padStart(5)} ${(r.kalshi.p * 100).toFixed(1).padStart(5)} gap ${String(r.gap).padStart(5)} ${r.thin ? "thin" : "    "} sim ${r.sim} | ${r.title}${r.outcome ? " :: " + r.outcome : ""}  <=>  ${r.kalshi.title}${r.kOutcome ? " :: " + r.kOutcome : ""}  [${r.id}] vol ${Math.round(r.poly.vol24)}/${Math.round(r.kalshi.vol24)}`);
  console.log("\nTOP POLY UNMATCHED"); for (const x of b.onlyPoly) console.log(" ", x.cat, Math.round(x.vol24), x.title, x.end);
  console.log("\nTOP KALSHI UNMATCHED"); for (const x of b.onlyKalshi) console.log(" ", x.cat, Math.round(x.vol24), x.title, x.end);
})().catch(e => { console.error(e); process.exit(1); });
/* game samples (off)
(async () => {
  const raw = async u => (await fetch(u)).json();
  for (const s of ["KXNFLGAME", "KXMLBGAME", "KXNCAAFGAME", "KXEPLGAME", "KXNHLGAME", "KXNBAGAME"]){
    const j = await raw(`https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=4&series_ticker=${s}`);
    for (const e of j.events || []) console.log("KGAME", s, "|", e.title, "|", e.sub_title, "|", (e.markets || []).map(m => m.yes_sub_title + "=" + m.ticker).join(" ; "));
  }
  const pe = await raw("https://gamma-api.polymarket.com/events?limit=40&active=true&closed=false&order=volume24hr&ascending=false");
  for (const e of pe.filter(e => e.teams || e.sport).slice(0, 12)) console.log("PGAME", e.title, "|", JSON.stringify(e.teams || "").slice(0, 300), "|", JSON.stringify(e.sport || "").slice(0,100), "|", e.seriesSlug, "|", (e.tags||[]).map(t=>t.label).join(","));
})();
*/

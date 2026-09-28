// Prints the shape of the Kalshi and Polymarket API answers the rules and settlement checks read (run by shapes.yml).
const P = "https://gamma-api.polymarket.com";
const j = async u => { const r = await fetch(u, {headers: {accept: "application/json"}}); const t = await r.text(); try { return JSON.parse(t); } catch (e) { return {status: r.status, text: t.slice(0, 300)}; } };
const cut = o => JSON.stringify(o, (k, v) => typeof v === "string" && v.length > 300 ? v.slice(0, 300) + "…" : v, 1).slice(0, 5000);
(async () => {
  const pe = await j(`${P}/events?limit=40&active=true&closed=false&order=volume24hr&ascending=false`);
  for (const e of pe.slice(0, 40)){
    const m = (e.markets || []).find(x => !x.closed);
    if (!m) continue;
    console.log(e.slug.slice(0, 40), "|", (e.tags || []).map(t => t.label).join(",").slice(0, 50), "| fees", m.feesEnabled, m.feeType, JSON.stringify(m.feeSchedule), m.takerBaseFee);
  }
  const closed = await j(`${P}/markets?closed=true&limit=1&order=closedTime&ascending=false`);
  const id = closed[0].id;
  console.log("== ?id&closed=true", (await j(`${P}/markets?id=${id}&closed=true`)).length);
  const one = await j(`${P}/markets/${id}`);
  console.log("== /markets/id", cut({id: one.id, closed: one.closed, outcomePrices: one.outcomePrices, umaResolutionStatus: one.umaResolutionStatus}));
  const open = pe[0].markets.find(x => !x.closed);
  console.log("== ?id=open&id=closed&closed=…", (await j(`${P}/markets?id=${open.id}&id=${id}`)).length, (await j(`${P}/markets?id=${open.id}&id=${id}&closed=true`)).length);
})();

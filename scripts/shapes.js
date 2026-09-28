// Prints the shape of the Kalshi and Polymarket API answers the rules and settlement checks read (run by shapes.yml).
const K = "https://api.elections.kalshi.com/trade-api/v2", P = "https://gamma-api.polymarket.com";
const j = async u => { const r = await fetch(u, {headers: {accept: "application/json"}}); const t = await r.text(); try { return JSON.parse(t); } catch (e) { return {status: r.status, text: t.slice(0, 300)}; } };
const cut = o => JSON.stringify(o, (k, v) => typeof v === "string" && v.length > 400 ? v.slice(0, 400) + "…" : v, 1).slice(0, 6000);
(async () => {
  const ev = await j(`${K}/events?status=open&with_nested_markets=true&limit=3&series_ticker=KXFEDDECISION`);
  const e = (ev.events || [])[0] || {};
  console.log("== kalshi event keys", Object.keys(e));
  const m = (e.markets || [])[0] || {};
  console.log("== kalshi market (nested)", cut(m));
  console.log("== kalshi market by ticker", cut(await j(`${K}/markets/${m.ticker}`)));
  console.log("== kalshi series", cut(await j(`${K}/series/${e.series_ticker || "KXFEDDECISION"}`)));
  const settled = await j(`${K}/markets?status=settled&limit=3`);
  console.log("== kalshi settled", cut((settled.markets || []).map(x => ({ticker: x.ticker, status: x.status, result: x.result, close_time: x.close_time, settlement_value: x.settlement_value}))));
  const tk = (settled.markets || []).map(x => x.ticker).slice(0, 2).join(",");
  const multi = await j(`${K}/markets?tickers=${tk}`);
  console.log("== kalshi tickers=", tk, "->", (multi.markets || []).map(x => [x.ticker, x.status, x.result]), multi.cursor ? "cursor" : "");
  const pe = await j(`${P}/events?limit=1&active=true&closed=false&order=volume24hr&ascending=false`);
  const pm = ((pe[0] || {}).markets || [])[0] || {};
  console.log("== poly market keys", Object.keys(pm));
  console.log("== poly market", cut({id: pm.id, question: pm.question, description: pm.description, resolutionSource: pm.resolutionSource, endDate: pm.endDate, umaResolutionStatus: pm.umaResolutionStatus}));
  const two = await j(`${P}/markets?id=${pm.id}&id=${(pe[0].markets[1] || pm).id}`);
  console.log("== poly markets?id&id ->", Array.isArray(two) ? two.map(x => x.id) : cut(two));
  const closed = await j(`${P}/markets?closed=true&limit=2&order=closedTime&ascending=false`);
  console.log("== poly closed", cut((Array.isArray(closed) ? closed : []).map(x => ({id: x.id, closed: x.closed, outcomes: x.outcomes, outcomePrices: x.outcomePrices, umaResolutionStatus: x.umaResolutionStatus, closedTime: x.closedTime}))));
  if (Array.isArray(closed) && closed[0]){ const one = await j(`${P}/markets?id=${closed[0].id}`); console.log("== poly closed by id (no closed filter) ->", Array.isArray(one) ? one.length : cut(one)); }
})();

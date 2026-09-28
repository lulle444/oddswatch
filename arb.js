// The trade across both platforms: buy Yes where it is cheaper and No where it is dearer. One of the two pays $1 at the
// end, whatever happens, so when both legs together cost less than $1 after fees, the difference is locked in (as long as
// both platforms settle the question the same way). Used by the question pages (api/page.js) and in the browser (app.js).
//
// Fees are taker fees, the ones you pay when you buy at the ask:
//   Kalshi      0.07 × contracts × price × (1 − price), rounded up to the cent (its general fee schedule)
//   Polymarket  rate × shares × price × (1 − price), with the rate each market publishes (0 where fees are off); when
//               a market doesn't say, the category's usual rate (0.04 politics, 0.07 crypto, 0.05 most others)
(function (root){
  const POLY_RATE = {politics: 0.04, economy: 0.05, sports: 0.05, crypto: 0.07, culture: 0.05, other: 0.05};
  const KALSHI_RATE = 0.07;
  const pq = p => p * (1 - p);

  // Both ways round, cheapest first. Each leg: where, which side, price per contract (0..1).
  function legs(r){
    const out = [], P = r.poly, K = r.kalshi;
    if (P.ask != null && K.bid != null && P.ask > 0 && K.bid > 0)
      out.push({yes: {at: "poly", p: P.ask}, no: {at: "kalshi", p: 1 - K.bid}});
    if (K.ask != null && P.bid != null && K.ask > 0 && P.bid > 0)
      out.push({yes: {at: "kalshi", p: K.ask}, no: {at: "poly", p: 1 - P.bid}});
    for (const x of out) x.cost = x.yes.p + x.no.p;
    // a leg at 1¢ or 99¢ is a book that is all but settled or empty: no real trade there
    return out.filter(x => x.yes.p >= 0.02 && x.yes.p <= 0.98 && x.no.p >= 0.02 && x.no.p <= 0.98).sort((a, b) => a.cost - b.cost);
  }

  // What `stake` dollars buys on the cheaper way round, after fees. null when either book is empty.
  function plan(r, stake = 100, t = Date.now()){
    const best = legs(r)[0];
    if (!best) return null;
    const rate = r.poly.fee != null ? r.poly.fee : POLY_RATE[r.cat] ?? 0.05;
    const feeOne = leg => leg.at === "kalshi" ? KALSHI_RATE * pq(leg.p) : rate * pq(leg.p);
    const perPair = best.cost + feeOne(best.yes) + feeOne(best.no);
    const n = Math.max(0, Math.floor(stake / perPair));
    const fee = leg => leg.at === "kalshi" ? Math.ceil(KALSHI_RATE * n * pq(leg.p) * 100 - 1e-9) / 100 : rate * n * pq(leg.p);
    const fees = fee(best.yes) + fee(best.no), spent = n * best.cost + fees, profit = n - spent;
    const days = (Date.parse(r.end) - t) / 864e5;
    return {
      yes: best.yes, no: best.no, cost: best.cost, perPair, contracts: n, fees, spent, payout: n, profit,
      edge: 1 - perPair,                                   // per $1 payout, after fees
      ret: spent > 0 ? profit / spent : 0,
      days: isFinite(days) && days > 0 ? days : null,
      yearly: isFinite(days) && days >= 1 && spent > 0 ? profit / spent * 365 / days : null,
      polyRate: rate,
    };
  }

  const api = {legs, plan, POLY_RATE, KALSHI_RATE};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ARB = api;
})(typeof self !== "undefined" ? self : this);

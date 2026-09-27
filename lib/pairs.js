// Hand corrections for the matcher (lib/match.js).
//   force: Polymarket event slug -> Kalshi event ticker, for two events that are the same question in different words
//   block: "polymarketSlug|KALSHI-TICKER", for two events that read alike but settle differently
module.exports = {
  force: {},
  block: [],
};

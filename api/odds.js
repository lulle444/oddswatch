// The whole board: every question Polymarket and Kalshi both price, plus the busiest ones only one of them lists.
// CDN-cached for 2 minutes.
const {board} = require("../lib/odds");

module.exports = async (req, res) => {
  try {
    const b = await board();
    res.setHeader("cache-control", "public, s-maxage=120, stale-while-revalidate=900");
    res.status(200).json(b);
  } catch (e) {
    res.setHeader("cache-control", "no-store");
    res.status(502).json({error: String(e.message || e)});
  }
};

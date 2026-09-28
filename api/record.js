// Who was right: every question both platforms priced that has settled, and which market was closer. /api/record
const {scoreboard} = require("../lib/record");

module.exports = async (req, res) => {
  try {
    const s = await scoreboard();
    res.setHeader("cache-control", "public, s-maxage=300, stale-while-revalidate=1800");
    res.status(200).json(s);
  } catch (e) {
    res.setHeader("cache-control", "no-store");
    res.status(/database not connected/.test(e.message) ? 200 : 502).json({n: 0, wins: {poly: 0, kalshi: 0, tie: 0}, splits: 0, recent: [], split: [], error: String(e.message || e)});
  }
};

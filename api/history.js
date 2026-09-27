// One question's hourly prices on both platforms: /api/history?id=<Kalshi ticker>&days=7
const {series} = require("../lib/history");

module.exports = async (req, res) => {
  const id = String(req.query.id || "").slice(0, 80), days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 7));
  if (!/^[A-Za-z0-9.\-_]+$/.test(id)) return res.status(400).json({error: "bad id"});
  try {
    const points = await series(id, days);
    res.setHeader("cache-control", "public, s-maxage=900, stale-while-revalidate=3600");
    res.status(200).json({id, days, points});
  } catch (e) {
    res.setHeader("cache-control", "no-store");
    res.status(/database not connected/.test(e.message) ? 200 : 502).json({id, days, points: [], error: String(e.message || e)});
  }
};

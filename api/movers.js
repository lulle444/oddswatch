// Who moved first: questions where one platform moved and the other hasn't followed, and a week's count of who led.
// /api/movers
const {board: getBoard} = require("../lib/odds");
const {view} = require("../lib/movers");

module.exports = async (req, res) => {
  try {
    const v = await view(await getBoard());
    res.setHeader("cache-control", "public, s-maxage=300, stale-while-revalidate=1800");
    res.status(200).json(v);
  } catch (e) {
    res.setHeader("cache-control", "no-store");
    res.status(502).json({error: String(e.message || e)});
  }
};

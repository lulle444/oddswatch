// Hands a reader's starred questions to the Telegram bot. The stars live in the reader's browser; this saves them for a
// day under a short code, and the bot link carries the code: POST /api/watch {"ids": [...]} -> {"code": "..."}
const crypto = require("crypto");
const {redis} = require("../lib/store");
const {board: getBoard} = require("../lib/odds");

const MAX = 25;
module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") return res.status(405).json({error: "POST only"});
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const want = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 60);
    const b = await getBoard(), open = new Set(b.pairs.map(r => r.id));
    const ids = want.filter(id => open.has(id)).slice(0, MAX);
    if (!ids.length) return res.status(400).json({error: "None of those questions is open on both platforms now."});
    const code = crypto.createHash("sha1").update(ids.slice().sort().join(",")).digest("base64url").slice(0, 10);
    await redis("SET", `ow:wl:${code}`, JSON.stringify(ids), "EX", "86400");
    res.status(200).json({code, n: ids.length, dropped: want.length - ids.length});
  } catch (e) {
    res.status(502).json({error: String(e.message || e)});
  }
};

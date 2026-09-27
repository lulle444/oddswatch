// One-off after adding TELEGRAM_BOT_TOKEN: points the bot's webhook at this site and sets its command menu.
// Harmless to call again. It only acts for the bot named in brand.json, so a sister site's token (Tidewatch's,
// Pegwatch's or Ratewatch's) can never have its webhook taken over.
const B = require("../brand.json");
const {tg, webhookSecret} = require("../lib/telegram");
const {SITE, BOT} = require("../lib/alerts");

module.exports = async function handler(req, res){
  try {
    const me = await tg("getMe", {});
    if (!BOT || me.username.toLowerCase() !== BOT.toLowerCase())
      return res.status(409).json({ok: false, error: `TELEGRAM_BOT_TOKEN belongs to @${me.username}, but brand.json names @${BOT || "(none)"}. Nothing was changed.`});
    await tg("setWebhook", {url: SITE + "/api/telegram", secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true});
    await tg("setMyCommands", {commands: [
      {command: "gap", description: "When the two markets drift apart, e.g. /gap senate 5"},
      {command: "move", description: "When the odds move, e.g. /move fed 10"},
      {command: "odds", description: "Both prices now, e.g. /odds chiefs"},
      {command: "top", description: "The biggest gaps right now"},
      {command: "daily", description: "Every evening: the day’s biggest gaps"},
      {command: "list", description: "See or remove your alerts"},
      {command: "stop", description: "Remove all alerts and the daily note"},
      {command: "start", description: `How ${B.name} works`},
    ]});
    await tg("setMyDescription", {description: `Same event, different odds. ${B.name} watches Polymarket and Kalshi side by side and messages you when a question moves or the two markets drift apart.`}).catch(() => {});
    await tg("setMyShortDescription", {short_description: `Polymarket vs Kalshi odds alerts from ${B.name}.`}).catch(() => {});
    res.status(200).json({ok: true, bot: "@" + me.username, webhook: SITE + "/api/telegram"});
  } catch (e) {
    res.status(500).json({ok: false, error: String(e.message || e)});
  }
};

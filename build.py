"""Builds every page, brand.css, the logo, sitemap.xml and robots.txt from brand.json.

To rename or recolor the site: edit brand.json, run  python3 build.py  and commit the result.
Page text says the brand name through {{name}}, so nothing else needs to change.
Run it after every change to styles.css, app.js or bg.js too: pages link them as file?v=<hash of the file>,
and browsers keep a versioned file for a year (vercel.json), so a new hash is how they learn it changed.
"""
import hashlib, json, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
B = json.load(open(os.path.join(ROOT, "brand.json"), encoding="utf-8"))
C, F = B["colors"], B["fonts"]
SITE = "https://" + B["domain"]
W1, W2 = B["wordmark"]


def fill(s):
    for k, v in {"name": B["name"], "tagline": B["tagline"], "site": SITE, "w1": W1, "w2": W2}.items():
        s = s.replace("{{" + k + "}}", v)
    return s


# ---------- brand.css: the only place colors and fonts are set ----------
css = [":root{"] + [f"  --b-{k.replace('_', '-')}:{v};" for k, v in C.items()] + [f'  --f-{k}:"{v}";' for k, v in F.items()] + ["}"]
open(os.path.join(ROOT, "brand.css"), "w").write("/* Written by build.py from brand.json. Edit brand.json instead. */\n" + "\n".join(css) + "\n")
FONTS = ("https://fonts.googleapis.com/css2?family=" + F["display"].replace(" ", "+") + ":opsz,wght@12..96,500..800"
         + "&family=" + F["body"].replace(" ", "+") + ":wght@400;500;600&family=" + F["mono"].replace(" ", "+") + ":wght@400;500&display=swap")
BRAND_CSS = "\n".join(css)


def v(f):
    return f"/{f}?v=" + hashlib.sha1(open(os.path.join(ROOT, f), "rb").read()).hexdigest()[:10]


# ---------- logo mark: two odds lines, one per market, and the gap between them ----------
LOGO = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="15" fill="{C['ink']}"/>
  <path d="M12 40 L24 30 L34 34 L52 18" fill="none" stroke="{C['poly']}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 48 L24 40 L34 43 L52 30" fill="none" stroke="#2FD39A" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M52 21.5v5" stroke="{C['gap']}" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="52" cy="18" r="3.6" fill="#FFFFFF"/>
</svg>
"""
os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
open(os.path.join(ROOT, "assets", "logo-mark.svg"), "w").write(LOGO)

NAV = [("/", "Odds"), ("/gaps", "Gaps"), ("/midterms", "Midterms"), ("/alerts", "Alerts"), ("/learn", "Learn"), ("/about", "About")]
TOPICS = [("politics", "Politics"), ("economy", "Economy"), ("sports", "Sports"), ("crypto", "Crypto"), ("culture", "Culture")]
BOT = str(B.get("telegram") or "").lstrip("@")
XLINK = f'<a class="navx" href="https://x.com/{B["x"]}" target="_blank" rel="noopener me" aria-label="Follow {{{{name}}}} on X">X</a>' if B.get("x") else ""


def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>\n"


def page(path, title, desc, body, og="/api/og?p=home", kind=None, extra=""):
    cur = ' aria-current="page"'
    nav = "".join(f'<a href="{h}"{cur if h == path or h != "/" and path.startswith(h + "/") else ""}>{t}</a>' for h, t in NAV)
    return fill(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{{{{site}}}}{path}">
<link rel="icon" type="image/svg+xml" href="/assets/logo-mark.svg">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{{{{name}}}}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{{{{site}}}}{path}">
<meta property="og:image" content="{{{{site}}}}{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{{{{site}}}}{og}">{f'<meta name="twitter:site" content="@{B["x"]}">' if B.get("x") else ""}
<meta name="theme-color" content="{C['bg']}">
<link rel="preload" href="/api/odds" as="fetch" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="{FONTS}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="{FONTS}"></noscript>
<link rel="stylesheet" href="{v('styles.css')}">
<style>{BRAND_CSS}</style>
{extra}</head>
<body data-page="{kind or path.strip('/') or 'home'}" data-bot="{BOT}">
<canvas id="lines" aria-hidden="true"></canvas>
<div class="wrap">
  <header class="nav">
    <a class="logo" href="/" aria-label="{{{{name}}}} home"><img src="/assets/logo-mark.svg" alt="" width="34" height="34"><span class="word">{{{{w1}}}}<i>{{{{w2}}}}</i></span></a>
    <nav class="navlinks" aria-label="Main">{nav}</nav>
    <div class="navright">{XLINK}<span class="live-pill" id="livePill" title="Pairs of markets we match right now"><i class="dot"></i><b class="num" id="livePairs">–</b> <small>pairs live</small></span></div>
  </header>
{body}
  <footer class="foot">
    <div><a class="logo small" href="/"><img src="/assets/logo-mark.svg" alt="" width="24" height="24"><span class="word">{{{{w1}}}}<i>{{{{w2}}}}</i></span></a>
      <p>{{{{tagline}}}}</p></div>
    <nav aria-label="Footer">{"".join(f'<a href="{h}">{t}</a>' for h, t in NAV)}</nav>
    <nav class="topicnav" aria-label="Topics"><span>Topics</span>{"".join(f'<a href="/topic/{t}">{n}</a>' for t, n in TOPICS)}</nav>
    <p class="fine">Prices from the public data of <a href="https://polymarket.com" target="_blank" rel="noopener">Polymarket</a> and <a href="https://kalshi.com" target="_blank" rel="noopener">Kalshi</a>, refreshed every few minutes. {{{{name}}}} is independent and not affiliated with either. No paid placements. Not financial advice, and prediction markets are not legal everywhere. Sister sites: <a href="https://www.usetidewatch.org" target="_blank" rel="noopener">Tidewatch</a>, <a href="https://usepegwatch.vercel.app" target="_blank" rel="noopener">Pegwatch</a> and <a href="https://ratewatch-lemon.vercel.app" target="_blank" rel="noopener">Ratewatch</a>.</p>
  </footer>
</div>
<script src="{v('bg.js')}" defer></script>
<script src="{v('app.js')}" defer></script>
</body>
</html>
""")


def head(eyebrow, h1, lede):
    return f"""  <section class="pagehead">
    <p class="eyebrow">{eyebrow}</p>
    <h1>{h1}</h1>
    <p class="lede">{lede}</p>
  </section>"""


BOARD = """  <section class="panel board" aria-labelledby="boardH">
    <div class="sectionhead">
      <div><h2 id="boardH">__BOARD_H__</h2><p class="sub" id="boardSub">Loading both markets…</p></div>
      <div class="filters">
        <label class="search"><span class="visually-hidden">Search</span><input id="q" type="search" placeholder="Search Senate, Fed, Chiefs…" autocomplete="off"></label>
        <label class="select"><span class="visually-hidden">Sort</span><select id="sort"><option value="vol">Most traded</option><option value="gap">Biggest gap</option><option value="end">Ending soonest</option></select></label>
      </div>
    </div>
    <div class="chips" id="chips" role="group" aria-label="Topic"></div>
    <div class="tablebox">
      <table class="ot">
        <thead><tr>
          <th scope="col">Question</th>
          <th scope="col" class="r"><span class="key poly"></span>Polymarket</th>
          <th scope="col" class="r"><span class="key kalshi"></span>Kalshi</th>
          <th scope="col" class="r">Gap</th>
          <th scope="col" class="r hs">24h traded</th>
          <th scope="col" class="r hm">Ends</th>
        </tr></thead>
        <tbody id="rows"><tr><td colspan="6" class="empty">Loading both markets…</td></tr></tbody>
      </table>
    </div>
    <p class="more"><button class="btn" id="showMore" hidden>Show more</button></p>
    <p class="fine">Each price is the market’s chance for that outcome: the middle of the best bid and ask, or the last trade when the spread is wider than 10 points, the way both platforms show it. Gap is Polymarket minus Kalshi, in percentage points. <span class="thin-key">Faded</span> rows are thinly traded or have a wide spread, so their gap may not be real.</p>
  </section>
"""

HOME = """  <section class="hero">
    <div>
      <p class="eyebrow">Polymarket vs Kalshi, live</p>
      <h1>Same event. <em>Different odds.</em></h1>
      <p class="lede">The two biggest prediction markets often price the same question differently. We match every question they share and show both prices side by side, so you can see where they agree, where they don’t, and by how much.</p>
      <p class="heroctas"><a class="btn primary" href="/gaps">See the biggest gaps</a> <a class="btn" href="/alerts">Get gap alerts</a></p>
    </div>
    <aside class="spot panel" id="spot" aria-live="polite">
      <p class="eyebrow">Biggest gap right now</p>
      <div class="spotbody"><p class="empty">Loading…</p></div>
    </aside>
  </section>

  <section class="stats" id="stats" aria-label="The two markets today"></section>

  <section class="gapcards" aria-labelledby="gapsH">
    <div class="sectionhead"><div><h2 id="gapsH">Where they disagree most</h2><p class="sub">Liquid questions only: both sides trade and both spreads are tight.</p></div><a class="btn" href="/gaps">All gaps →</a></div>
    <div class="cards" id="gapCards"><p class="empty">Loading…</p></div>
  </section>

""" + BOARD.replace("__BOARD_H__", "Every question on both") + """
  <section class="twocol lonely" aria-label="Only on one platform">
    <article class="panel"><h3><span class="key poly"></span>Busy on Polymarket, not on Kalshi</h3><ol id="onlyPoly" class="lonelist"><li class="empty">Loading…</li></ol></article>
    <article class="panel"><h3><span class="key kalshi"></span>Busy on Kalshi, not on Polymarket</h3><ol id="onlyKalshi" class="lonelist"><li class="empty">Loading…</li></ol></article>
  </section>
"""

GAPS = head("Gaps", "Where the markets <em>disagree.</em>",
            "Every question both platforms trade, sorted by how far apart their prices are. A gap can mean one side has news the other hasn’t priced, different rules, or different traders. Thin markets are left out.") + """
  <section class="gapcards"><div class="cards" id="gapCards" data-n="24"><p class="empty">Loading…</p></div></section>
  <section class="twocol">
    <article class="panel note"><h3>Is a gap free money?</h3><p>Rarely. Fees on both sides, money stuck until the market settles, and small differences in how each platform words and settles the question eat most gaps. Read both rule texts before you trade either side.</p></article>
    <article class="panel note"><h3>Why do gaps happen?</h3><p>Different traders, different access (Kalshi is US-regulated, Polymarket runs a US and an international exchange), different fees and different settlement rules. Big gaps usually close when news lands. <a href="/learn">More on why prices differ</a>.</p></article>
  </section>
"""

MIDTERMS = head("US midterms · November 3, 2026", "The midterms, <em>priced twice.</em>",
                "Who wins the House, the Senate and the closest races, according to Polymarket and Kalshi, side by side and live.") + """
  <section class="control" id="control" aria-label="Control of Congress"><p class="empty">Loading…</p></section>
""" + BOARD.replace("__BOARD_H__", "Every midterm question on both") + """
  <p class="fine block">We count a question as a midterm question when it mentions the House, the Senate, a governor or a 2026 election. Races that only one platform lists are not shown.</p>
"""

TOPIC = """__HEAD__
  <span id="topic" data-t="__TOPIC__" hidden></span>
""" + BOARD.replace("__BOARD_H__", "Every __TOPIC__ question on both")

LEARN = head("Learn", "Why the same question <em>has two prices.</em>",
             "Prediction markets price the chance that something happens. When two of them price the same thing differently, there is usually a reason.") + """
  <section class="twocol">
    <article class="panel note">
      <h3>What does a price mean?</h3>
      <p>A contract pays $1 if the outcome happens and nothing if it doesn’t. So a price of 62¢ means traders put the chance at about 62%. We show it as a percentage.</p>
    </article>
    <article class="panel note">
      <h3>Why do Polymarket and Kalshi disagree?</h3>
      <p>Different people trade on each. Kalshi is regulated in the US and takes bank transfers; Polymarket settles in stablecoins and runs a US and an international exchange. Different traders read the news differently, and money can’t move instantly between the two.</p>
    </article>
    <article class="panel note">
      <h3>Are the two questions really the same?</h3>
      <p>Usually, but read the rules. One platform may settle on a different source, date or definition, for example who counts as a party’s candidate. When the wording differs, a gap can be fair. Every question page links both rule texts.</p>
    </article>
    <article class="panel note">
      <h3>What is a thin market?</h3>
      <p>One where little trades or the gap between the best bid and ask is wide. Its price can sit far from the truth for hours. We fade those rows and leave them out of the gap rankings.</p>
    </article>
    <article class="panel note">
      <h3>How do you match questions?</h3>
      <p>We compare the titles, dates and outcomes of every open market on both platforms, then check the numbers and sides agree, so “Chiefs vs Dolphins” matches “Miami at Kansas City” but a Fed cut of 25 points never matches a cut of 50. The matches are automatic, so an odd one can slip through. Tell us on X if you spot one.</p>
    </article>
    <article class="panel note">
      <h3>Can I trade the gap?</h3>
      <p>Buying Yes on the cheap side and No on the dear side can lock in the gap, but fees, withdrawal times and rule differences eat most of it. Treat a gap as information about what traders think, not as free money.</p>
    </article>
  </section>
"""

ABOUT = head("About", "{{name}}, in one line.", "{{tagline}}") + """
  <section class="twocol">
    <article class="panel note">
      <h3>What it is</h3>
      <p>{{name}} reads every open market on Polymarket and Kalshi, finds the questions they share and shows both prices side by side, with the gap between them. It saves the prices every hour, so each question has its own chart of how the two markets moved.</p>
    </article>
    <article class="panel note">
      <h3>Where the numbers come from</h3>
      <p>Both platforms publish their markets and prices on free public APIs. We read them every few minutes. We don’t trade and we don’t take orders.</p>
    </article>
    <article class="panel note">
      <h3>Independent</h3>
      <p>{{name}} is not affiliated with Polymarket or Kalshi, and nobody pays to be listed. Rows are sorted by the numbers only.</p>
    </article>
    <article class="panel note">
      <h3>Not financial advice</h3>
      <p>Prediction markets can lose you money, and they are not legal everywhere. Check the rules where you live and on each platform before you trade.</p>
    </article>
  </section>
"""

ALERTS_ON = head("Alerts", "Know when the odds <em>move.</em>",
                 "Free Telegram messages when a question moves, when Polymarket and Kalshi drift apart, and a short daily note of the biggest gaps.") + f"""
  <section class="twocol">
    <article class="panel note">
      <h3>Gap alerts</h3>
      <p>Tap 🔔 on any question, or send <code>/gap senate 5</code> to hear when Polymarket and Kalshi are 5 points or more apart on the Senate.</p>
      <p><a class="btn primary" href="https://t.me/{BOT}" target="_blank" rel="noopener">Open @{BOT}</a></p>
    </article>
    <article class="panel note">
      <h3>Move alerts</h3>
      <p>Send <code>/move fed 10</code> to hear when the odds on a question move 10 points from where they are now, on either platform.</p>
    </article>
    <article class="panel note">
      <h3>Daily gaps</h3>
      <p>Every evening: the five biggest gaps between Polymarket and Kalshi on liquid questions, and the biggest moves of the day.</p>
      <p><a class="btn" href="https://t.me/{BOT}?start=daily" target="_blank" rel="noopener">Get the daily gaps</a></p>
    </article>
    <article class="panel note">
      <h3>How it works</h3>
      <p>We check every 10 minutes. An alert fires once, then waits until the gap has closed back 2 points before it can fire again, so a question hovering at your level doesn’t flood you. Send <code>/list</code> to see or remove alerts and <code>/stop</code> to remove everything.</p>
    </article>
  </section>
"""
ALERTS_SOON = head("Alerts", "Know when the odds <em>move.</em>", "Soon: free Telegram messages when a question moves or the two markets drift apart.") + """
  <p class="block"><a class="btn primary" href="/">See every question</a></p>
"""

NOTFOUND = head("404", "That page <em>isn’t here.</em>", "The link may be old, or the question may have settled.") + """
  <p class="block"><a class="btn primary" href="/">See every open question</a></p>
"""

PAGES = [
    ("index.html", "/", "{{name}}: Polymarket vs Kalshi odds, side by side", B["description"], HOME),
    ("gaps.html", "/gaps", "Biggest gaps between Polymarket and Kalshi right now · {{name}}", "The questions where Polymarket and Kalshi disagree most, live, on liquid markets only.", GAPS, "/api/og?p=gaps"),
    ("midterms.html", "/midterms", "2026 midterm odds: Polymarket vs Kalshi · {{name}}", "Who wins the House, the Senate and the closest 2026 races, priced on Polymarket and Kalshi side by side, live.", MIDTERMS, "/api/og?p=midterms"),
    ("alerts.html", "/alerts", "Odds and gap alerts on Telegram · {{name}}", "Free Telegram alerts when a prediction market moves or Polymarket and Kalshi drift apart.", ALERTS_ON if BOT else ALERTS_SOON),
    ("learn.html", "/learn", "Why Polymarket and Kalshi disagree · {{name}}", "What a prediction market price means, why the same question has two prices, and whether a gap is worth trading.", LEARN),
    ("about.html", "/about", "About · {{name}}", "What {{name}} is and where its numbers come from.", ABOUT),
    ("404.html", "/404", "Not found · {{name}}", "That page isn’t here.", NOTFOUND),
]
ORG = {"@type": "Organization", "@id": SITE + "/#org", "name": B["name"], "url": SITE + "/", "logo": SITE + "/assets/apple-touch-icon.png"}
if B.get("x"):
    ORG["sameAs"] = ["https://x.com/" + B["x"]]
LD = {
    "/": ld({"@context": "https://schema.org", "@graph": [ORG, {"@type": "WebSite", "@id": SITE + "/#site", "name": B["name"], "url": SITE + "/",
         "description": B["description"], "publisher": {"@id": SITE + "/#org"}, "inLanguage": "en"}]}),
    "/learn": ld({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", fill(a))}}
        for q, a in re.findall(r"<h3>(.*?)</h3>\s*<p>(.*?)</p>", LEARN)]}),
}
for f, path, title, desc, body, *og in PAGES:
    open(os.path.join(ROOT, f), "w").write(page(path, fill(title), fill(desc), fill(body), og=og[0] if og else "/api/og?p=home", extra=LD.get(path, "")))

# Server-rendered pages: api/page.js fills the __KEYS__.
os.makedirs(os.path.join(ROOT, "templates"), exist_ok=True)
open(os.path.join(ROOT, "templates", "pair.html"), "w").write(page("/q/__SLUG__", "__TITLE__", "__DESC__", "__MAIN__", og="/api/og?p=q&amp;s=__SLUG__", kind="pair"))
open(os.path.join(ROOT, "templates", "topic.html"), "w").write(page("/topic/__TOPIC__", "__NAME__ odds: Polymarket vs Kalshi · {{name}}", "__DESC__",
     TOPIC.replace("__HEAD__", head("Topic", "__NAME__, <em>priced twice.</em>", "__LEDE__")).replace("__TOPIC__", "__LOWER__"), og="/api/og?p=topic&amp;t=__TOPIC__", kind="topic"))

open(os.path.join(ROOT, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f"  <url><loc>{SITE}{p if p != '/' else ''}</loc></url>\n" for _, p, *_ in PAGES if p != "/404") +
    "".join(f"  <url><loc>{SITE}/topic/{t}</loc></url>\n" for t, _ in TOPICS) + "</urlset>\n")
open(os.path.join(ROOT, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\nSitemap: {SITE}/sitemap-questions.xml\n")
print("built", ", ".join(p[0] for p in PAGES))

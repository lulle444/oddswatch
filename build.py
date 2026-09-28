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
FONTS = ("https://fonts.googleapis.com/css2?family=" + F["display"].replace(" ", "+") + ":ital@0;1"
         + "&family=" + F["body"].replace(" ", "+") + ":wght@300;400;500;600&family=" + F["mono"].replace(" ", "+") + ":wght@300;400;500&display=swap")
BRAND_CSS = "\n".join(css)


def v(f):
    return f"/{f}?v=" + hashlib.sha1(open(os.path.join(ROOT, f), "rb").read()).hexdigest()[:10]


# ---------- logo mark: two odds lines, one per market, and the gap between them ----------
LOGO = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect x="1" y="1" width="62" height="62" rx="14" fill="{C['bg2']}" stroke="{C['accent']}" stroke-opacity=".55" stroke-width="1.5"/>
  <path d="M12 40 L24 30 L34 34 L52 18" fill="none" stroke="{C['poly']}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 48 L24 40 L34 43 L52 30" fill="none" stroke="{C['kalshi']}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M52 21.5v5" stroke="{C['accent']}" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="52" cy="18" r="3.6" fill="{C['accent']}"/>
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
<div class="seam" aria-hidden="true"></div>
<canvas id="lines" aria-hidden="true"></canvas>
<span class="edge l" aria-hidden="true">Polymarket</span><span class="edge r" aria-hidden="true">Kalshi</span>
<header class="crest">
  <a class="logo" href="/" aria-label="{{{{name}}}} home"><img src="/assets/logo-mark.svg" alt="" width="40" height="40"><span class="word">{{{{w1}}}}<i>{{{{w2}}}}</i></span></a>
  <span class="live" id="livePill" title="Questions priced on both right now"><i class="dot"></i><b id="livePairs">–</b> questions on both</span>
</header>
<main class="wrap">
{body}
</main>
<footer class="foot">
  <p class="footmark"><img src="/assets/logo-mark.svg" alt="" width="28" height="28"></p>
  <p>{{{{tagline}}}}</p>
  <nav aria-label="Topics">{"".join(f'<a href="/topic/{t}">{n}</a>' for t, n in TOPICS)}{XLINK}</nav>
  <p class="fine">Prices from the public data of <a href="https://polymarket.com" target="_blank" rel="noopener">Polymarket</a> and <a href="https://kalshi.com" target="_blank" rel="noopener">Kalshi</a>, refreshed every few minutes. {{{{name}}}} is independent and not affiliated with either. No paid placements. Not financial advice, and prediction markets are not legal everywhere. Sister sites: <a href="https://www.usetidewatch.org" target="_blank" rel="noopener">Tidewatch</a>, <a href="https://usepegwatch.vercel.app" target="_blank" rel="noopener">Pegwatch</a> and <a href="https://ratewatch-lemon.vercel.app" target="_blank" rel="noopener">Ratewatch</a>.</p>
</footer>
<nav class="dock" aria-label="Main">
  <button class="find" id="openFind" type="button" aria-label="Search every question"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span>Search</span><kbd>/</kbd></button>
  {nav}
</nav>
<div class="finder" id="finder" hidden>
  <div class="finderbox" role="dialog" aria-modal="true" aria-label="Search">
    <label class="finderin"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input id="findQ" type="search" placeholder="Senate, Fed, Chiefs, bitcoin…" autocomplete="off" aria-label="Search questions and pages"><kbd>esc</kbd></label>
    <ol class="findres" id="findRes"></ol>
  </div>
</div>
<script src="{v('bg.js')}" defer></script>
<script src="{v('app.js')}" defer></script>
</body>
</html>
""")


def head(eyebrow, h1, lede):
    """A page title split across the seam: the plain words on the Polymarket side, the <em> words on the Kalshi side."""
    left, _, right = h1.partition("<em>")
    right = right.replace("</em>", "")
    return f"""  <section class="mirror pagehead">
    <p class="eyebrow center">{eyebrow}</p>
    <h1 class="split"><span class="l">{left.strip()}</span><span class="r"><em>{right.strip()}</em></span></h1>
    <p class="lede center">{lede}</p>
  </section>"""


LEDGER = """  <section class="ledgerwrap" aria-labelledby="boardH">
    <div class="ledgerhead center">
      <h2 id="boardH">__BOARD_H__</h2>
      <p class="sub" id="boardSub">Loading both markets…</p>
      <div class="controls">
        <div class="chips" id="chips" role="group" aria-label="Topic"></div>
        <div class="sorts" id="sorts" role="group" aria-label="Sort"><button data-sort="vol" aria-pressed="true">Most traded</button><button data-sort="gap">Biggest gap</button><button data-sort="end">Ending soonest</button></div>
        <label class="filter"><span class="visually-hidden">Filter these questions</span><input id="q" type="search" placeholder="Filter these questions" autocomplete="off"></label>
      </div>
    </div>
    <div class="ledgerkey" aria-hidden="true"><span class="l"><i class="key poly"></i>Polymarket</span><span class="m">gap</span><span class="r">Kalshi<i class="key kalshi"></i></span></div>
    <ol class="ledger" id="ledger"><li class="empty center">Loading both markets…</li></ol>
    <p class="more"><button class="btn" id="showMore" hidden>Show more</button></p>
    <p class="fine center narrow">Each price is the market’s chance for that outcome: the middle of the best bid and ask, or the last trade when the spread is wider than 10 points, the way both platforms show it. The bars grow out from the middle, one per market; the orange end is the gap. Gap is Polymarket minus Kalshi, in percentage points. <span class="thin-key">Faded</span> rows are thinly traded or have a wide spread, so their gap may not be real.</p>
  </section>
"""

HOME = """  <section class="mirror hero">
    <h1 class="split"><span class="l">Same event.</span><span class="r"><em>Different odds.</em></span></h1>
    <p class="lede center">The two biggest prediction markets often price the same question differently. Polymarket sits on the left, Kalshi on the right, and every question they share runs across the middle, so you can see at a glance where they agree and where they don’t.</p>
    <p class="ctas center"><a class="btn primary" href="/gaps">See the biggest gaps</a> <a class="btn" href="/alerts">Get gap alerts</a></p>
  </section>

  <section class="spotlight" id="spot" aria-live="polite"><p class="eyebrow center">The biggest gap right now</p><div class="spotbody"><p class="empty center">Loading…</p></div></section>

  <section class="mirror stats" id="stats" aria-label="The two markets today"></section>

""" + LEDGER.replace("__BOARD_H__", "Every question on both") + """
  <section class="mirror lonely" aria-label="Only on one platform">
    <div class="half l"><h3>Only on Polymarket</h3><p class="sub">Busy markets Kalshi doesn’t list.</p><ol id="onlyPoly" class="lonelist"><li class="empty">Loading…</li></ol></div>
    <div class="half r"><h3>Only on Kalshi</h3><p class="sub">Busy markets Polymarket doesn’t list.</p><ol id="onlyKalshi" class="lonelist"><li class="empty">Loading…</li></ol></div>
  </section>
"""

GAPS = head("Gaps", "Where the markets <em>disagree.</em>",
            "Every question both platforms trade, sorted by how far apart their prices are. A gap can mean one side has news the other hasn’t priced, different rules, or different traders. Thin markets and games already under way are left out.") + """
  <ol class="ledger" id="gapLedger" data-n="30"><li class="empty center">Loading…</li></ol>
  <section class="dialogue">
    <article class="qa"><h3>Is a gap free money?</h3><p>Rarely. Fees on both sides, money stuck until the market settles, and small differences in how each platform words and settles the question eat most gaps. Read both rule texts before you trade either side.</p></article>
    <article class="qa"><h3>Why do gaps happen?</h3><p>Different traders, different access (Kalshi is US-regulated, Polymarket runs a US and an international exchange), different fees and different settlement rules. Big gaps usually close when news lands. <a href="/learn">More on why prices differ</a>.</p></article>
  </section>
"""

MIDTERMS = head("US midterms · November 3, 2026", "The midterms, <em>priced twice.</em>",
                "Who wins the House, the Senate and the closest races, according to Polymarket and Kalshi, side by side and live.") + """
  <section class="control" id="control" aria-label="Control of Congress"><p class="empty center">Loading…</p></section>
""" + LEDGER.replace("__BOARD_H__", "Every midterm question on both") + """
  <p class="fine center narrow">We count a question as a midterm question when it mentions the House, the Senate, a governor or a 2026 election. Races that only one platform lists are not shown.</p>
"""

TOPIC = """__HEAD__
  <span id="topic" data-t="__TOPIC__" hidden></span>
""" + LEDGER.replace("__BOARD_H__", "Every __TOPIC__ question on both")

LEARN = head("Learn", "Why the same question <em>has two prices.</em>",
             "Prediction markets price the chance that something happens. When two of them price the same thing differently, there is usually a reason.") + """
  <section class="dialogue">
    <article class="qa">
      <h3>What does a price mean?</h3>
      <p>A contract pays $1 if the outcome happens and nothing if it doesn’t. So a price of 62¢ means traders put the chance at about 62%. We show it as a percentage.</p>
    </article>
    <article class="qa">
      <h3>Why do Polymarket and Kalshi disagree?</h3>
      <p>Different people trade on each. Kalshi is regulated in the US and takes bank transfers; Polymarket settles in stablecoins and runs a US and an international exchange. Different traders read the news differently, and money can’t move instantly between the two.</p>
    </article>
    <article class="qa">
      <h3>Are the two questions really the same?</h3>
      <p>Usually, but read the rules. One platform may settle on a different source, date or definition, for example who counts as a party’s candidate. When the wording differs, a gap can be fair. Every question page links both rule texts.</p>
    </article>
    <article class="qa">
      <h3>What is a thin market?</h3>
      <p>One where little trades or the gap between the best bid and ask is wide. Its price can sit far from the truth for hours. We fade those rows and leave them out of the gap rankings.</p>
    </article>
    <article class="qa">
      <h3>How do you match questions?</h3>
      <p>We compare the titles, dates and outcomes of every open market on both platforms, then check the numbers and sides agree, so “Chiefs vs Dolphins” matches “Miami at Kansas City” but a Fed cut of 25 points never matches a cut of 50. The matches are automatic, so an odd one can slip through. Tell us on X if you spot one.</p>
    </article>
    <article class="qa">
      <h3>Can I trade the gap?</h3>
      <p>Buying Yes on the cheap side and No on the dear side can lock in the gap, but fees, withdrawal times and rule differences eat most of it. Treat a gap as information about what traders think, not as free money.</p>
    </article>
  </section>
"""

ABOUT = head("About", "{{name}}, in one line.", "{{tagline}}") + """
  <section class="dialogue">
    <article class="qa">
      <h3>What it is</h3>
      <p>{{name}} reads every open market on Polymarket and Kalshi, finds the questions they share and shows both prices side by side, with the gap between them. It saves the prices every hour, so each question has its own chart of how the two markets moved.</p>
    </article>
    <article class="qa">
      <h3>Where the numbers come from</h3>
      <p>Both platforms publish their markets and prices on free public APIs. We read them every few minutes. We don’t trade and we don’t take orders.</p>
    </article>
    <article class="qa">
      <h3>Independent</h3>
      <p>{{name}} is not affiliated with Polymarket or Kalshi, and nobody pays to be listed. Rows are sorted by the numbers only.</p>
    </article>
    <article class="qa">
      <h3>Not financial advice</h3>
      <p>Prediction markets can lose you money, and they are not legal everywhere. Check the rules where you live and on each platform before you trade.</p>
    </article>
  </section>
"""

ALERTS_ON = head("Alerts", "Know when the odds <em>move.</em>",
                 "Free Telegram messages when a question moves, when Polymarket and Kalshi drift apart, and a short daily note of the biggest gaps.") + f"""
  <section class="dialogue">
    <article class="qa">
      <h3>Gap alerts</h3>
      <p>Tap the bell on any question, or send <code>/gap senate 5</code> to hear when Polymarket and Kalshi are 5 points or more apart on the Senate.</p>
      <p><a class="btn primary" href="https://t.me/{BOT}" target="_blank" rel="noopener">Open @{BOT}</a></p>
    </article>
    <article class="qa">
      <h3>Move alerts</h3>
      <p>Send <code>/move fed 10</code> to hear when the odds on a question move 10 points from where they are now, on either platform.</p>
    </article>
    <article class="qa">
      <h3>Daily gaps</h3>
      <p>Every evening: the five biggest gaps between Polymarket and Kalshi on liquid questions, and the biggest moves of the day.</p>
      <p><a class="btn" href="https://t.me/{BOT}?start=daily" target="_blank" rel="noopener">Get the daily gaps</a></p>
    </article>
    <article class="qa">
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

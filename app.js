// Oddswatch pages: reads /api/odds (every pair of markets Polymarket and Kalshi share) and draws whatever the page has
// room for. Question pages (/q/…) are rendered by the server and only get live prices and the chart from here.
(() => {
  const $ = s => document.querySelector(s);
  const PAGE = document.body.dataset.page, BOT = document.body.dataset.bot;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const pc = p => p == null ? "–" : (p * 100 < 9.95 && p * 100 > 0.05 ? (p * 100).toFixed(1) : Math.round(p * 100)) + "%";
  const gp = g => g == null ? "–" : (g > 0 ? "+" : g < 0 ? "−" : "±") + Math.abs(g).toFixed(1);
  const big = v => v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v || 0));
  const usd = v => "$" + big(v);
  const startParam = id => String(id).replace(/\./g, "_");
  const bell = r => BOT ? `<a class="bell" href="https://t.me/${BOT}?start=g_${encodeURIComponent(startParam(r.id))}" target="_blank" rel="noopener" title="Telegram alert when the gap or odds move" aria-label="Alert me about ${esc(r.title)}"><svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg></a>` : "";
  // Starred questions: the reader's own list, kept in this browser only
  let STARS = new Set();
  try { STARS = new Set(JSON.parse(localStorage.getItem("ow:stars") || "[]")); } catch (e) {}
  const saveStars = () => { try { localStorage.setItem("ow:stars", JSON.stringify([...STARS])); } catch (e) {} };
  const starSvg = `<svg class="ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.5l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z" fill="currentColor" fill-opacity="var(--sf,0)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const star = r => `<button class="star" type="button" data-star="${esc(r.id)}" aria-pressed="${STARS.has(r.id)}" aria-label="Star ${esc(r.title)}" title="Keep on your list">${starSvg}</button>`;
  function ends(iso){
    const t = Date.parse(iso);
    if (!isFinite(t)) return "–";
    const d = (t - Date.now()) / 864e5;
    if (d < 0) return "live";
    if (d < 1) return "today";
    if (d < 2) return "tomorrow";
    if (d < 30) return Math.round(d) + "d";
    return new Date(t).toLocaleDateString("en-US", {month: "short", year: d > 300 ? "2-digit" : undefined, day: d > 300 ? undefined : "numeric"});
  }
  const name = r => r.outcome ? `${esc(r.title)}` : esc(r.title);
  const sub = r => r.outcome ? `<span class="qo">${esc(r.outcome)}</span>` : "";

  // One question across the seam: Polymarket's price and bar on the left, Kalshi's on the right, the gap on the seam.
  // Each bar grows out from the middle; the part of the longer bar past the shorter one is the gap, in orange.
  function bars(r){
    const a = r.poly.p * 100, b = r.kalshi.p * 100, hi = Math.max(a, b, .001);
    const fill = (me, other, col, dir) => me > other && me - other >= .5
      ? `background:linear-gradient(to ${dir},var(--b-${col}) 0 ${(other / me * 100).toFixed(1)}%,var(--b-gap) 0)` : `background:var(--b-${col})`;
    return `<span class="lb l"><i style="width:${Math.max(a, .4)}%;${fill(a, b, "poly", "left")}"></i></span><span class="lbm"></span><span class="lb r"><i style="width:${Math.max(b, .4)}%;${fill(b, a, "kalshi", "right")}"></i></span>`;
  }
  const lrow = (r, meta = true) => `<li><a class="lrow${r.thin ? " thin" : ""}" href="/q/${r.slug}">
      <span class="lq"><b>${esc(r.title)}</b>${r.outcome ? `<small>${esc(r.outcome)}</small>` : ""}${r.rules ? `<small class="flag">Dates differ</small>` : ""}</span>
      <span class="ls l"><small class="dt">${esc(r.title)}</small>${meta ? `<small class="lm">${esc(r.cat)} · ${usd(r.poly.vol24)}</small>` : "<small></small>"}<b>${pc(r.poly.p)}</b></span>
      <span class="lg${Math.abs(r.gap) >= 5 && !r.thin ? " big" : ""}">${gp(r.gap)}</span>
      <span class="ls r"><b>${pc(r.kalshi.p)}</b>${meta ? `<small class="lm">${big(r.kalshi.vol24)} ct · ${ends(r.end)}</small>` : "<small></small>"}<small class="do">${esc(r.outcome || ends(r.end))}</small></span>
      ${bars(r)}</a>${bell(r)}${star(r)}</li>`;

  function duel(r){
    return `<div class="duel">
        <div class="side l"><small><i class="key poly"></i>Polymarket</small><b>${pc(r.poly.p)}</b></div>
        <div class="gapb"><small>gap</small>${gp(r.gap)}</div>
        <div class="side r"><small>Kalshi<i class="key kalshi"></i></small><b>${pc(r.kalshi.p)}</b></div>
        ${bars(r)}
      </div>`;
  }

  const liquid = b => b.pairs.filter(r => !r.thin && !r.live && !r.wx);
  const byGap = rows => rows.slice().sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));

  /* ---------- the ledger ---------- */
  const MIDTERMS = /midterm|\bhouse\b|\bsenate\b|governor|gubernatorial|congress|balance of power/i;
  const midterm = r => r.cat === "politics" && MIDTERMS.test(r.title + " " + (r.kalshi.title || "")) && !/white house|president/i.test(r.title) &&
    (!r.end || Date.parse(r.end) < Date.parse("2027-03-01"));
  const state = {cat: "all", q: "", sort: "vol", n: 30};

  function board(b, filter){
    const box = $("#ledger");
    if (!box) return;
    const base = b.pairs.filter(filter || (() => true));
    const chips = $("#chips");
    if (chips && !filter){
      const nStar = base.filter(r => STARS.has(r.id)).length;
      const cats = [{id: "all", name: "All", count: base.length}].concat(nStar ? [{id: "starred", name: "★ Starred", count: nStar}] : [], b.cats.filter(c => c.count));
      chips.innerHTML = cats.map(c => `<button class="chip" data-cat="${c.id}" aria-pressed="${state.cat === c.id}">${esc(c.name)}<small>${c.count}</small></button>`).join("");
      chips.onclick = e => { const x = e.target.closest(".chip"); if (!x) return; state.cat = x.dataset.cat; state.n = 30; board(b, filter); };
    } else if (chips) chips.hidden = true;
    if (state.cat === "starred" && !base.some(r => STARS.has(r.id))) state.cat = "all";
    let rows = base.filter(r => state.cat === "all" || (state.cat === "starred" ? STARS.has(r.id) : r.cat === state.cat));
    const wb = $("#watchBar");
    if (wb) wb.hidden = !(state.cat === "starred" && BOT);
    if (state.q){
      const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter(r => { const h = `${r.title} ${r.outcome || ""} ${r.kalshi.title} ${r.kOutcome || ""} ${r.cat}`.toLowerCase(); return words.every(w => h.includes(w)); });
    }
    const vol = r => r.poly.vol24 + r.kalshi.vol24;
    rows.sort(state.sort === "gap" ? (x, y) => (x.thin - y.thin) || Math.abs(y.gap) - Math.abs(x.gap)
      : state.sort === "end" ? (x, y) => (Date.parse(x.end) || 9e15) - (Date.parse(y.end) || 9e15) : (x, y) => vol(y) - vol(x));
    $("#boardSub").textContent = `${rows.length} ${rows.length === 1 ? "question" : "questions"} priced on both, updated ${new Date(b.t).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}.`;
    box.innerHTML = rows.slice(0, state.n).map(r => lrow(r)).join("") || `<li class="empty center">Nothing matches that.</li>`;
    const more = $("#showMore");
    if (more){ more.hidden = rows.length <= state.n; more.onclick = () => { state.n += 40; board(b, filter); }; }
  }
  // Wide rows or tight rows; the choice is remembered on this device only
  function density(){
    const d = $("#density"), boxes = document.querySelectorAll(".ledger:not(.compact)");
    if (!d) return;
    let tight = false;
    try { tight = localStorage.getItem("ow:tight") === "1"; } catch (e) {}
    const set = t => { tight = t; boxes.forEach(x => x.classList.toggle("dense", t)); d.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String((x.dataset.d === "tight") === t))); try { localStorage.setItem("ow:tight", t ? "1" : "0"); } catch (e) {} };
    d.onclick = e => { const x = e.target.closest("button"); if (x) set(x.dataset.d === "tight"); };
    set(tight);
  }
  density();
  let redraw = () => {};
  document.addEventListener("click", e => {
    const x = e.target.closest("[data-star]");
    if (!x) return;
    e.preventDefault();
    const id = x.dataset.star, on = !STARS.has(id);
    on ? STARS.add(id) : STARS.delete(id);
    saveStars();
    document.querySelectorAll(`[data-star="${CSS.escape(id)}"]`).forEach(y => y.setAttribute("aria-pressed", String(on)));
    redraw();
  });
  document.querySelectorAll("[data-star]").forEach(y => y.setAttribute("aria-pressed", String(STARS.has(y.dataset.star))));
  // hands the starred questions to the bot, which sets a gap alert on each
  const wa = $("#watchAlert");
  if (wa) wa.onclick = async () => {
    wa.disabled = true; const was = wa.textContent; wa.textContent = "Opening Telegram…";
    try {
      const r = await fetch("/api/watch", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({ids: [...STARS]})});
      const j = await r.json();
      if (!r.ok || !j.code) throw new Error(j.error || r.status);
      location.href = `https://t.me/${BOT}?start=w_${j.code}`;
    } catch (e) { wa.textContent = "That didn’t work. Try again in a minute."; setTimeout(() => { wa.textContent = was; wa.disabled = false; }, 3000); return; }
    setTimeout(() => { wa.textContent = was; wa.disabled = false; }, 4000);
  };
  function wireBoard(b, filter){
    const q = $("#q"), s = $("#sorts");
    if (q) q.oninput = () => { state.q = q.value.trim(); state.n = 30; board(b, filter); };
    if (s) s.onclick = e => { const x = e.target.closest("button"); if (!x) return; state.sort = x.dataset.sort; s.querySelectorAll("button").forEach(y => y.setAttribute("aria-pressed", y === x)); board(b, filter); };
    redraw = () => board(b, filter);
    board(b, filter);
  }

  /* ---------- page parts ---------- */
  function spot(b){
    const box = $("#spot .spotbody");
    if (!box) return;
    const r = byGap(liquid(b)).find(x => x.poly.vol24 + x.kalshi.vol24 > 20000) || byGap(liquid(b))[0];
    if (!r){ box.innerHTML = `<p class="empty center">No liquid gap right now.</p>`; return; }
    box.innerHTML = `<a class="q center" href="/q/${r.slug}">${esc(r.title)}</a><p class="o center">${r.outcome ? esc(r.outcome) + " · " : ""}ends ${ends(r.end)}</p>${duel(r)}
      <p class="spotfoot"><span class="l">${usd(r.poly.vol24)} traded today</span><span class="m">${bell(r) ? `${bell(r)}` : ""}</span><span class="r">${big(r.kalshi.vol24)} contracts today</span></p>`;
  }
  function stats(b){
    const box = $("#stats");
    if (!box) return;
    const liq = liquid(b), avg = liq.length ? liq.reduce((s, r) => s + Math.abs(r.gap), 0) / liq.length : null;
    box.innerHTML = `<div class="half l stat"><small>Polymarket, 24h</small><b class="poly">${usd(b.counts.polyVol24)}</b></div>
      <div class="mid stat"><small>On both</small><b>${b.pairs.length}</b><small>typical gap ${avg == null ? "–" : avg.toFixed(1) + " pts"}</small></div>
      <div class="half r stat"><small>Kalshi contracts, 24h</small><b class="kalshi">${big(b.counts.kalshiVol24)}</b></div>`;
  }
  function gapLedger(b){
    const box = $("#gapLedger");
    if (!box) return;
    const rows = byGap(liquid(b)).slice(0, +(box.dataset.n || 30));
    box.innerHTML = rows.map(r => lrow(r)).join("") || `<li class="empty center">No liquid question has a gap right now.</li>`;
  }
  // Gaps page: where Yes on one side plus No on the other costs less than $1 with fees
  const cents = v => Math.round(v * 100) + "¢";
  function arbRows(b){
    const box = $("#arbRows");
    if (!box || !window.ARB) return;
    const rows = b.pairs.filter(r => !r.live && !r.wx && !r.thin).map(r => ({r, a: ARB.plan(r, 100)})).filter(x => x.a && x.a.edge > 0.002 && x.a.edge < 0.2)
      .sort((x, y) => y.a.edge - x.a.edge)
      // a head-to-head game is one market with two outcomes: both rows are the same trade, so keep one
      .filter((x, i, all) => all.findIndex(y => y.r.poly.market === x.r.poly.market && Math.abs(y.a.edge - x.a.edge) < 0.001) === i).slice(0, 12);
    box.innerHTML = rows.map(({r, a}) => {
      const pl = a.yes.at === "poly" ? ["Yes", a.yes.p] : ["No", a.no.p], kl = a.yes.at === "kalshi" ? ["Yes", a.yes.p] : ["No", a.no.p];
      return `<li><a class="arbrow${r.thin ? " thin" : ""}" href="/q/${r.slug}#arb">
        <span class="lq"><b>${esc(r.title)}</b>${r.outcome ? `<small>${esc(r.outcome)}</small>` : ""}${r.rules ? `<small class="flag">Dates differ</small>` : ""}</span>
        <span class="al"><small>${pl[0]} on Polymarket</small><b class="poly">${cents(pl[1])}</b></span>
        <span class="am"><b>+${(a.edge * 100).toFixed(1)}¢</b><small>per $1</small></span>
        <span class="ar"><b class="kalshi">${cents(kl[1])}</b><small>${kl[0]} on Kalshi</small></span></a></li>`;
    }).join("") || `<li class="empty center">No question costs less than $1 on both sides after fees right now. That is the usual state: the gaps above are mostly eaten by fees and spreads.</li>`;
  }
  function arbCalc(r){
    const box = $("#arb"), inp = $("#stake");
    if (!box || !inp || !window.ARB || !r) return;
    const usd2 = v => (v < 0 ? "−$" : "$") + Math.abs(v).toFixed(2);
    const draw = () => {
      const a = ARB.plan(r, Math.max(1, +inp.value || 100));
      if (!a) return;
      const leg = (l, side) => `Buy <b>${side}</b> at ${cents(l.p)}`;
      $("#arbP").innerHTML = a.yes.at === "poly" ? leg(a.yes, "Yes") : leg(a.no, "No");
      $("#arbK").innerHTML = a.yes.at === "kalshi" ? leg(a.yes, "Yes") : leg(a.no, "No");
      $("#arbCost").textContent = cents(a.cost);
      const row = (h, v) => `<span class="v l">${h}</span><span class="h"></span><span class="v r">${v}</span>`;
      $("#arbFacts").innerHTML = row("Contracts on each side", String(a.contracts)) + row("Cost with fees", usd2(a.spent)) + row("of which fees", usd2(a.fees)) +
        row("Pays at the end", usd2(a.payout)) + row("Profit", `<b class="${a.profit > 0 ? "up" : "down"}">${usd2(a.profit)}</b>`) +
        row("Return", `${(a.ret * 100).toFixed(1)}%${a.yearly != null && a.days >= 7 ? ` · ${(a.yearly * 100).toFixed(0)}% a year` : ""}`);
      $("#arbVerdict").innerHTML = r.live ? `The game is under way, so these prices move by the second and may be gone before you trade.`
        : r.thin && a.edge > 0 ? `One side trades thinly, so this price may not be real. <b>${(a.edge * 100).toFixed(1)}¢</b> on every $1 on paper.`
        : a.edge > 0.2 ? `<b>${(a.edge * 100).toFixed(1)}¢</b> on every $1 is too good to be true: the two questions probably differ. Read the rules below.`
        : a.edge > 0 ? `Locked in: <b class="up">${(a.edge * 100).toFixed(1)}¢</b> on every $1, if both settle the same way.`
        : `No locked-in profit now: both sides cost ${(a.perPair * 100).toFixed(1)}¢ with fees for a $1 payout.`;
    };
    inp.oninput = draw;
    draw();
  }

  /* ---------- the record: who was right ---------- */
  async function record(){
    const box = $("#score");
    if (!box) return;
    let d;
    try { d = await (await fetch("/api/record")).json(); } catch (e) { box.innerHTML = `<p class="empty center">The record couldn’t load. Refresh in a minute.</p>`; return; }
    const w = d.wins || {poly: 0, kalshi: 0, tie: 0};
    box.innerHTML = `<div class="half l stat"><small>Polymarket closer</small><b class="poly">${w.poly}</b>${d.miss ? `<small>misses by ${d.miss.poly} pts on average</small>` : ""}</div>
      <div class="mid stat"><small>Settled</small><b>${d.n}</b><small>${w.tie} tie${w.tie === 1 ? "" : "s"}</small></div>
      <div class="half r stat"><small>Kalshi closer</small><b class="kalshi">${w.kalshi}</b>${d.miss ? `<small>misses by ${d.miss.kalshi} pts on average</small>` : ""}</div>`;
    const res = v => v === 1 ? "Yes" : v === 0 ? "No" : "50-50";
    const row = x => {
      const r = {poly: {p: x.p[0]}, kalshi: {p: x.p[1]}};
      const tag = side => x.win === side ? `<i class="won" title="Closer">✓</i>` : "";
      const inner = `<span class="lq"><b>${esc(x.t)}</b>${x.o ? `<small>${esc(x.o)}</small>` : ""}</span>
        <span class="ls l"><small class="lm">${new Date(x.at).toLocaleDateString("en-US", {month: "short", day: "numeric"})}</small><b>${tag("poly")}${pc(x.p[0])}</b></span>
        <span class="lg res${x.res ? " yes" : ""}">${x.win === "split" ? `P ${res(x.pres)} · K ${res(x.res)}` : res(x.res)}</span>
        <span class="ls r"><b>${pc(x.p[1])}${tag("kalshi")}</b><small class="lm">${x.win === "tie" ? "tie" : ""}</small></span>${bars(r)}`;
      return `<li>${x.s ? `<a class="lrow" href="/q/${x.s}">${inner}</a>` : `<div class="lrow">${inner}</div>`}</li>`;
    };
    const fair = (d.recent || []).filter(x => x.win !== "split");
    $("#recSub").textContent = d.n ? `The ${Math.min(fair.length, 60)} most recent, newest first. Prices are from a day before the end, or just before kick-off.` : "Nothing has settled since we started keeping score. Questions land here as they settle.";
    $("#recRows").innerHTML = fair.map(row).join("") || `<li class="empty center">The first results arrive as questions settle, usually within a day.</li>`;
    if ((d.split || []).length){ $("#splitWrap").hidden = false; $("#splitRows").innerHTML = d.split.map(row).join(""); }
  }
  record();

  function lonely(b){
    const li = (x, cls) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a><small>${cls === "poly" ? usd(x.vol24) : big(x.vol24)}</small></li>`;
    if ($("#onlyPoly")) $("#onlyPoly").innerHTML = b.onlyPoly.slice(0, 8).map(x => li(x, "poly")).join("");
    if ($("#onlyKalshi")) $("#onlyKalshi").innerHTML = b.onlyKalshi.slice(0, 8).map(x => li(x, "kalshi")).join("");
  }
  function control(b){
    const box = $("#control");
    if (!box) return;
    const find = (re, party) => b.pairs.find(r => re.test(r.title) && new RegExp(party, "i").test(r.outcome || ""));
    const chamber = (label, re) => {
      const d = find(re, "democrat"), r = find(re, "republican");
      if (!d && !r) return "";
      const bar = (pd, pr) => `<div class="split"><span class="d" style="width:${pd * 100}%">D ${pc(pd)}</span><span class="rr" style="width:${pr * 100}%">R ${pc(pr)}</span></div>`;
      const pd = side => d ? d[side].p : r ? 1 - r[side].p : null, pr = side => r ? r[side].p : d ? 1 - d[side].p : null;
      return `<a class="chamber" href="/q/${(d || r).slug}"><h3 class="center">${label}</h3>
        <span class="half l"><small><i class="key poly"></i>Polymarket</small>${bar(pd("poly"), pr("poly"))}</span>
        <span class="half r"><small>Kalshi<i class="key kalshi"></i></small>${bar(pd("kalshi"), pr("kalshi"))}</span></a>`;
    };
    box.innerHTML = chamber("Who wins the House", /\bhouse\b/i) + chamber("Who wins the Senate", /\bsenate\b/i) || `<p class="empty center">The House and Senate markets aren’t matched right now.</p>`;
  }

  /* ---------- the finder: search every question and page from anywhere ---------- */
  const PAGES = [["/", "Every question on both"], ["/gaps", "Biggest gaps"], ["/record", "Who was right"], ["/midterms", "US midterms"], ["/alerts", "Telegram alerts"], ["/learn", "Why prices differ"], ["/about", "About"],
    ["/topic/politics", "Politics"], ["/topic/economy", "Economy"], ["/topic/sports", "Sports"], ["/topic/crypto", "Crypto"], ["/topic/culture", "Culture"]];
  let BOARD = null;
  function finder(){
    const box = $("#finder"), q = $("#findQ"), res = $("#findRes"), btn = $("#openFind");
    if (!box) return;
    let items = [], sel = 0;
    const draw = () => {
      const s = q.value.trim().toLowerCase(), words = s.split(/\s+/).filter(Boolean);
      const pages = PAGES.filter(([, n]) => !s || n.toLowerCase().includes(s)).slice(0, s ? 3 : 6).map(([h, n]) => ({h, html: `<span class="fp">${esc(n)}</span><small>Page</small>`}));
      const qs = BOARD && words.length ? BOARD.pairs.filter(r => { const h = `${r.title} ${r.outcome || ""} ${r.kalshi.title} ${r.cat}`.toLowerCase(); return words.every(w => h.includes(w)); })
        .sort((x, y) => (x.thin - y.thin) || (y.poly.vol24 + y.kalshi.vol24) - (x.poly.vol24 + x.kalshi.vol24)).slice(0, 8)
        .map(r => ({h: "/q/" + r.slug, html: `<span class="fq"><b>${esc(r.title)}</b>${r.outcome ? `<small>${esc(r.outcome)}</small>` : ""}</span><span class="fn"><i class="poly">${pc(r.poly.p)}</i><i class="kalshi">${pc(r.kalshi.p)}</i></span>`})) : [];
      items = qs.concat(pages); sel = Math.min(sel, items.length - 1);
      res.innerHTML = items.map((it, i) => `<li><a href="${it.h}"${i === sel ? ' aria-selected="true"' : ""}>${it.html}</a></li>`).join("") || `<li class="empty">Nothing on both platforms matches that.</li>`;
    };
    const open = () => { box.hidden = false; document.body.classList.add("finding"); q.value = ""; sel = 0; draw(); setTimeout(() => q.focus(), 10); };
    const close = () => { box.hidden = true; document.body.classList.remove("finding"); };
    btn.onclick = open;
    box.onclick = e => { if (e.target === box) close(); };
    q.oninput = () => { sel = 0; draw(); };
    q.onkeydown = e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(items.length, 1); draw(); }
      else if (e.key === "Enter" && items[sel]){ location.href = items[sel].h; }
    };
    addEventListener("keydown", e => {
      if (e.key === "Escape" && !box.hidden) close();
      else if (box.hidden && (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !/input|textarea|select/i.test(document.activeElement.tagName)){ e.preventDefault(); open(); }
    });
  }
  finder();

  /* ---------- a question page: live prices and the chart ---------- */
  function chart(box, pts){
    if (!pts.length){ box.innerHTML = `<p class="empty">The chart fills in as we save prices every hour.</p>`; return; }
    const W = box.clientWidth || 640, H = box.clientHeight || 280, L = 38, R = 12, T = 12, Bm = 26;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
    const vals = pts.flatMap(p => [p[1], p[2]]).filter(v => v != null);
    let lo = Math.max(0, Math.floor((Math.min(...vals) - 3) / 5) * 5), hi = Math.min(100, Math.ceil((Math.max(...vals) + 3) / 5) * 5);
    if (hi - lo < 10){ lo = Math.max(0, lo - 5); hi = Math.min(100, hi + 5); }
    const x = t => L + (W - L - R) * (t1 === t0 ? .5 : (t - t0) / (t1 - t0)), y = v => T + (H - T - Bm) * (1 - (v - lo) / (hi - lo));
    const line = i => pts.filter(p => p[i] != null).map((p, j) => `${j ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[i]).toFixed(1)}`).join("");
    const ticks = []; for (let v = lo; v <= hi; v += (hi - lo > 40 ? 20 : hi - lo > 20 ? 10 : 5)) ticks.push(v);
    const days = (t1 - t0) / 864e5, fmt = t => new Date(t).toLocaleDateString([], days > 2 ? {month: "short", day: "numeric"} : {hour: "2-digit", minute: "2-digit"});
    const band = pts.filter(p => p[1] != null && p[2] != null);
    const area = band.length > 1 ? `M${band.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("L")}L${band.slice().reverse().map(p => `${x(p[0]).toFixed(1)},${y(p[2]).toFixed(1)}`).join("L")}Z` : "";
    box.innerHTML = `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance on Polymarket and Kalshi over time">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--b-line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--b-muted)" font-family="var(--f-mono)">${v}%</text>`).join("")}
      <text x="${L}" y="${H - 6}" font-size="11" fill="var(--b-muted)">${fmt(t0)}</text><text x="${W - R}" y="${H - 6}" font-size="11" fill="var(--b-muted)" text-anchor="end">${fmt(t1)}</text>
      ${area ? `<path d="${area}" fill="var(--b-gap)" opacity=".12"/>` : ""}
      <path d="${line(2)}" fill="none" stroke="var(--b-kalshi)" stroke-width="2" stroke-linejoin="round"/>
      <path d="${line(1)}" fill="none" stroke="var(--b-poly)" stroke-width="2" stroke-linejoin="round"/>
      <line id="cx" y1="${T}" y2="${H - Bm}" stroke="var(--b-muted)" stroke-dasharray="3 3" visibility="hidden"/>
      <circle id="cp" r="4.5" fill="var(--b-poly)" stroke="var(--b-panel)" stroke-width="2" visibility="hidden"/><circle id="ck" r="4.5" fill="var(--b-kalshi)" stroke="var(--b-panel)" stroke-width="2" visibility="hidden"/>
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - Bm}" fill="transparent" id="hit"/></svg><div class="tip" hidden></div></div>`;
    const svg = box.querySelector("svg"), tip = box.querySelector(".tip"), cx = svg.querySelector("#cx"), cp = svg.querySelector("#cp"), ck = svg.querySelector("#ck");
    const show = e => {
      const r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) * W / r.width;
      let best = pts[0]; for (const p of pts) if (Math.abs(x(p[0]) - mx) < Math.abs(x(best[0]) - mx)) best = p;
      const X = x(best[0]);
      cx.setAttribute("x1", X); cx.setAttribute("x2", X); cx.setAttribute("visibility", "visible");
      for (const [c, i] of [[cp, 1], [ck, 2]]){ if (best[i] == null) c.setAttribute("visibility", "hidden"); else { c.setAttribute("cx", X); c.setAttribute("cy", y(best[i])); c.setAttribute("visibility", "visible"); } }
      tip.hidden = false;
      tip.style.left = (X * r.width / W) + "px"; tip.style.top = (y(Math.max(best[1] ?? 0, best[2] ?? 0)) * r.height / H) + "px";
      tip.innerHTML = `${new Date(best[0]).toLocaleString([], {month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"})}<br><span class="key poly"></span>Polymarket <b>${best[1] == null ? "–" : best[1].toFixed(1) + "%"}</b><br><span class="key kalshi"></span>Kalshi <b>${best[2] == null ? "–" : best[2].toFixed(1) + "%"}</b>` +
        (best[1] != null && best[2] != null ? `<br>Gap <b>${gp(best[1] - best[2])} pts</b>` : "");
    };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerleave", () => { tip.hidden = true; [cx, cp, ck].forEach(c => c.setAttribute("visibility", "hidden")); });
  }
  async function pairPage(b){
    const root = $("#pair");
    if (!root) return;
    const id = root.dataset.id, r = b && b.pairs.find(x => x.id === id);
    if (r){
      const d = $("#duelBox"); if (d) d.innerHTML = duel(r);
    }
    arbCalc(r || null);
    const box = $("#pairChart"), seg = $("#range");
    let days = 7, cache = {};
    const load = async () => {
      try {
        const h = cache[days] || (cache[days] = await (await fetch(`/api/history?id=${encodeURIComponent(id)}&days=${days}`)).json());
        const pts = (h.points || []).slice();
        if (r) pts.push([b.t, +(r.poly.p * 100).toFixed(1), +(r.kalshi.p * 100).toFixed(1)]);
        chart(box, pts);
      } catch (e) { box.innerHTML = `<p class="empty">The chart couldn’t load. Try again in a minute.</p>`; }
    };
    if (seg) seg.onclick = e => { const x = e.target.closest("button"); if (!x) return; days = +x.dataset.days; seg.querySelectorAll("button").forEach(y => y.setAttribute("aria-pressed", y === x)); load(); };
    load();
  }

  /* ---------- go ---------- */
  async function go(){
    let b = null;
    try {
      const r = await fetch("/api/odds");
      b = await r.json();
      if (!r.ok || b.error) throw new Error(b.error || r.status);
    } catch (e) {
      document.querySelectorAll("#ledger,#gapLedger,#control,#spot .spotbody").forEach(el => el.innerHTML = `<p class="empty center">The markets couldn’t load just now. Refresh in a minute.</p>`);
      if (PAGE === "pair") pairPage(null);
      return;
    }
    BOARD = b;
    if ($("#livePairs")) $("#livePairs").textContent = b.pairs.length;
    window.dispatchEvent(new CustomEvent("ow:data", {detail: b}));
    if (PAGE === "home"){ spot(b); stats(b); wireBoard(b); lonely(b); }
    else if (PAGE === "gaps"){ gapLedger(b); arbRows(b); }
    else if (PAGE === "midterms"){ control(b); wireBoard(b, midterm); }
    else if (PAGE === "topic"){ const t = ($("#topic") || {}).dataset?.t; wireBoard(b, r => r.cat === t); }
    else if (PAGE === "pair") pairPage(b);
  }
  go();
  setInterval(() => { if (!document.hidden && PAGE !== "pair") go(); }, 180000);
})();

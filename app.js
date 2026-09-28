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

  // Two pins on one 0–100 track, the gap between them shaded
  function track(r, scale = true){
    const a = r.poly.p * 100, b = r.kalshi.p * 100, lo = Math.min(a, b), hi = Math.max(a, b);
    return `<div class="track" role="img" aria-label="Polymarket ${pc(r.poly.p)}, Kalshi ${pc(r.kalshi.p)}">
      <span class="band" style="left:${lo}%;width:${Math.max(hi - lo, .6)}%"></span>
      <span class="pin kalshi" style="left:${b}%"></span><span class="pin poly" style="left:${a}%"></span></div>` +
      (scale ? `<div class="trackscale"><span>0%</span><span>50%</span><span>100%</span></div>` : "");
  }
  const card = r => `<a class="card" href="/q/${r.slug}">
      <p class="t">${esc(r.title)}</p>${r.outcome ? `<p class="o">${esc(r.outcome)}</p>` : ""}
      <div class="row"><span class="p"><small>Poly</small>${pc(r.poly.p)}</span><span class="k"><small>Kalshi</small>${pc(r.kalshi.p)}</span></div>
      ${track(r, false)}
      <div class="meta"><span class="tag">${esc(r.cat)}</span><span class="g">${gp(r.gap)} pts</span><span>ends ${ends(r.end)}</span></div></a>`;

  function duel(r){
    return `<div class="duel">
        <div class="side poly"><small><span class="key poly"></span>Polymarket</small><b>${pc(r.poly.p)}</b></div>
        <div class="gapb"><small>gap</small>${gp(r.gap)}</div>
        <div class="side kalshi"><small><span class="key kalshi"></span>Kalshi</small><b>${pc(r.kalshi.p)}</b></div>
      </div>${track(r)}`;
  }

  const liquid = b => b.pairs.filter(r => !r.thin && !r.live);
  const byGap = rows => rows.slice().sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));

  /* ---------- the board ---------- */
  const MIDTERMS = /midterm|\bhouse\b|\bsenate\b|governor|gubernatorial|congress|balance of power/i;
  const midterm = r => r.cat === "politics" && MIDTERMS.test(r.title + " " + (r.kalshi.title || "")) && !/white house|president/i.test(r.title) &&
    (!r.end || Date.parse(r.end) < Date.parse("2027-03-01"));
  const state = {cat: "all", q: "", sort: "vol", n: 40};

  function board(b, filter){
    const rowsBox = $("#rows");
    if (!rowsBox) return;
    const base = b.pairs.filter(filter || (() => true));
    const chips = $("#chips");
    if (chips && !filter){
      const cats = [{id: "all", name: "All", count: base.length}].concat(b.cats.filter(c => c.count));
      chips.innerHTML = cats.map(c => `<button class="chip" data-cat="${c.id}" aria-pressed="${state.cat === c.id}">${esc(c.name)}<small>${c.count}</small></button>`).join("");
      chips.onclick = e => { const x = e.target.closest(".chip"); if (!x) return; state.cat = x.dataset.cat; state.n = 40; board(b, filter); };
    } else if (chips) chips.hidden = true;
    let rows = base.filter(r => state.cat === "all" || r.cat === state.cat);
    if (state.q){
      const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter(r => { const h = `${r.title} ${r.outcome || ""} ${r.kalshi.title} ${r.kOutcome || ""} ${r.cat}`.toLowerCase(); return words.every(w => h.includes(w)); });
    }
    const vol = r => r.poly.vol24 + r.kalshi.vol24;
    rows.sort(state.sort === "gap" ? (x, y) => (x.thin - y.thin) || Math.abs(y.gap) - Math.abs(x.gap)
      : state.sort === "end" ? (x, y) => (Date.parse(x.end) || 9e15) - (Date.parse(y.end) || 9e15) : (x, y) => vol(y) - vol(x));
    $("#boardSub").textContent = `${rows.length} ${rows.length === 1 ? "question" : "questions"} priced on both, updated ${new Date(b.t).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}.`;
    rowsBox.innerHTML = rows.slice(0, state.n).map(r => `<tr class="${r.thin ? "thin" : ""}">
        <td><a class="qn" href="/q/${r.slug}">${name(r)}</a>${sub(r)}</td>
        <td class="r pp">${pc(r.poly.p)}</td><td class="r kp">${pc(r.kalshi.p)}</td>
        <td class="r"><span class="gapv${Math.abs(r.gap) >= 5 && !r.thin ? " big" : ""}">${gp(r.gap)}</span> ${bell(r)}</td>
        <td class="r hs" title="Polymarket in dollars / Kalshi in contracts">${usd(r.poly.vol24)} / ${big(r.kalshi.vol24)}</td>
        <td class="r hm">${ends(r.end)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nothing matches that.</td></tr>`;
    const more = $("#showMore");
    if (more){ more.hidden = rows.length <= state.n; more.onclick = () => { state.n += 60; board(b, filter); }; }
  }
  function wireBoard(b, filter){
    const q = $("#q"), s = $("#sort");
    if (q) q.oninput = () => { state.q = q.value.trim(); state.n = 40; board(b, filter); };
    if (s) s.onchange = () => { state.sort = s.value; board(b, filter); };
    board(b, filter);
  }

  /* ---------- page parts ---------- */
  function spot(b){
    const box = $("#spot .spotbody");
    if (!box) return;
    const r = byGap(liquid(b)).find(x => x.poly.vol24 + x.kalshi.vol24 > 20000) || byGap(liquid(b))[0];
    if (!r){ box.innerHTML = `<p class="empty">No liquid gap right now.</p>`; return; }
    box.innerHTML = `<a class="q" href="/q/${r.slug}">${esc(r.title)}</a><p class="o">${r.outcome ? esc(r.outcome) + " · " : ""}ends ${ends(r.end)}</p>${duel(r)}
      <div class="foot2"><span>${usd(r.poly.vol24)} traded on Polymarket, ${big(r.kalshi.vol24)} contracts on Kalshi today</span>${bell(r) ? `<span>${bell(r)} alert me</span>` : ""}</div>`;
  }
  function stats(b){
    const box = $("#stats");
    if (!box) return;
    const liq = liquid(b), avg = liq.length ? liq.reduce((s, r) => s + Math.abs(r.gap), 0) / liq.length : null;
    box.innerHTML = `<div class="stat"><small>Questions on both</small><b>${b.pairs.length}</b></div>
      <div class="stat poly"><small>Traded on Polymarket, 24h</small><b>${usd(b.counts.polyVol24)}</b></div>
      <div class="stat kalshi"><small>Contracts on Kalshi, 24h</small><b>${big(b.counts.kalshiVol24)}</b></div>
      <div class="stat gap"><small>Typical gap, liquid questions</small><b>${avg == null ? "–" : avg.toFixed(1) + " pts"}</b></div>`;
  }
  function gapCards(b){
    const box = $("#gapCards");
    if (!box) return;
    const n = +(box.dataset.n || 6);
    const rows = byGap(liquid(b)).slice(0, n);
    box.innerHTML = rows.map(card).join("") || `<p class="empty">No liquid question has a gap right now.</p>`;
  }
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
      return `<article class="panel"><h3>${label}</h3>
        <div class="ctlrow"><span><span class="key poly"></span>Polymarket</span>${bar(pd("poly"), pr("poly"))}</div>
        <div class="ctlrow"><span><span class="key kalshi"></span>Kalshi</span>${bar(pd("kalshi"), pr("kalshi"))}</div>
        <p class="fine"><a href="/q/${(d || r).slug}">Both prices and the chart →</a></p></article>`;
    };
    box.innerHTML = chamber("Who wins the House", /\bhouse\b/i) + chamber("Who wins the Senate", /\bsenate\b/i) || `<p class="empty">The House and Senate markets aren’t matched right now.</p>`;
  }

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
      document.querySelectorAll("#rows,.cards,#control").forEach(el => el.innerHTML = `<p class="empty">The markets couldn’t load just now. Refresh in a minute.</p>`);
      if (PAGE === "pair") pairPage(null);
      return;
    }
    if ($("#livePairs")) $("#livePairs").textContent = b.pairs.length;
    window.dispatchEvent(new CustomEvent("ow:data", {detail: b}));
    if (PAGE === "home"){ spot(b); stats(b); gapCards(b); wireBoard(b); lonely(b); }
    else if (PAGE === "gaps") gapCards(b);
    else if (PAGE === "midterms"){ control(b); wireBoard(b, midterm); }
    else if (PAGE === "topic"){ const t = ($("#topic") || {}).dataset?.t; wireBoard(b, r => r.cat === t); }
    else if (PAGE === "pair") pairPage(b);
  }
  go();
  setInterval(() => { if (!document.hidden && PAGE !== "pair") go(); }, 180000);
})();

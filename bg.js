// The live background: two faint odds lines, one per market, drifting across the page and never quite agreeing.
// The space between them is tinted like the gap on the board. Calm, slow, and still when the reader asks for less motion.
(() => {
  const cv = document.getElementById("lines");
  if (!cv) return;
  const cx = cv.getContext("2d"), css = getComputedStyle(document.documentElement);
  const col = k => css.getPropertyValue("--b-" + k).trim() || "#888";
  const POLY = col("poly"), KAL = col("kalshi"), GAP = col("gap");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W, H, dpr, t = 0, mx = .5, raf;
  const lanes = [
    {y: .22, amp: .07, sp: .00021, ph: 0, a: .2},
    {y: .64, amp: .09, sp: .00016, ph: 2.1, a: .13},
  ];
  function size(){
    dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
  }
  // a smooth wandering line made of a few sine waves
  const wave = (x, s, ph) => Math.sin(x * 2.1 + s + ph) * .55 + Math.sin(x * 5.3 - s * 1.7 + ph * 2) * .3 + Math.sin(x * 11.7 + s * 2.3) * .15;
  function draw(){
    cx.clearRect(0, 0, W, H);
    for (const L of lanes){
      const s = t * L.sp * 60, N = 90, a = [], b = [];
      for (let i = 0; i <= N; i++){
        const x = i / N, base = L.y + (mx - .5) * .03;
        const p = base + wave(x, s, L.ph) * L.amp, k = base + wave(x, s * .93 + .6, L.ph + .4) * L.amp + Math.sin(x * 3 + s) * .018;
        a.push([x * W, p * H]); b.push([x * W, k * H]);
      }
      cx.beginPath();
      a.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y));
      for (let i = b.length - 1; i >= 0; i--) cx.lineTo(b[i][0], b[i][1]);
      cx.closePath(); cx.globalAlpha = L.a * .35; cx.fillStyle = GAP; cx.fill();
      for (const [pts, c] of [[b, KAL], [a, POLY]]){
        cx.beginPath(); pts.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y));
        cx.globalAlpha = L.a; cx.strokeStyle = c; cx.lineWidth = 1.3 * dpr; cx.stroke();
      }
      // the newest point on each line
      const [ax, ay] = a[a.length - 1], [bx, by] = b[b.length - 1];
      cx.globalAlpha = L.a * 1.6;
      cx.fillStyle = POLY; cx.beginPath(); cx.arc(ax - 6 * dpr, ay, 2.6 * dpr, 0, 7); cx.fill();
      cx.fillStyle = KAL; cx.beginPath(); cx.arc(bx - 6 * dpr, by, 2.6 * dpr, 0, 7); cx.fill();
    }
    cx.globalAlpha = 1;
  }
  function loop(){ t++; draw(); raf = requestAnimationFrame(loop); }
  size(); draw();
  addEventListener("resize", () => { size(); draw(); });
  if (!still){
    addEventListener("pointermove", e => { mx = e.clientX / innerWidth; }, {passive: true});
    document.addEventListener("visibilitychange", () => { cancelAnimationFrame(raf); if (!document.hidden) loop(); });
    loop();
  }
})();

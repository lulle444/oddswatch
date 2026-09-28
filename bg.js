// The live background: a slow light runs down the seam between the two markets, and every so often a price
// ticks out from it, blue to the Polymarket side and green to the Kalshi side. Still when the reader asks for less motion.
(() => {
  const cv = document.getElementById("lines");
  if (!cv) return;
  const cx = cv.getContext("2d"), css = getComputedStyle(document.documentElement);
  const col = k => css.getPropertyValue("--b-" + k).trim() || "#888";
  const POLY = col("poly"), KAL = col("kalshi"), GOLD = col("accent");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W, H, dpr, raf, y = 0, last = 0;
  const ticks = [];
  function size(){
    dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
  }
  function draw(t){
    const dt = Math.min(64, t - (last || t)); last = t;
    cx.clearRect(0, 0, W, H);
    const mid = W / 2;
    // the light on the seam
    y = (y + dt * .045 * dpr) % (H + 300 * dpr);
    const g = cx.createLinearGradient(0, y - 260 * dpr, 0, y);
    g.addColorStop(0, "transparent"); g.addColorStop(1, GOLD);
    cx.globalAlpha = .55; cx.fillStyle = g; cx.fillRect(mid - dpr, y - 260 * dpr, 2 * dpr, 260 * dpr);
    cx.globalAlpha = .9; cx.beginPath(); cx.arc(mid, y, 2.2 * dpr, 0, 7); cx.fillStyle = GOLD; cx.fill();
    // prices ticking out to each side
    if (Math.random() < dt / 900) ticks.push({y: Math.random() * H, side: Math.random() < .5 ? -1 : 1, len: (.08 + Math.random() * .3) * W / 2, a: 0});
    for (let i = ticks.length - 1; i >= 0; i--){
      const k = ticks[i]; k.a += dt / 2600;
      if (k.a >= 1){ ticks.splice(i, 1); continue; }
      const grow = Math.min(1, k.a * 3), fade = k.a < .3 ? 1 : 1 - (k.a - .3) / .7;
      const x2 = mid + k.side * k.len * grow;
      const lg = cx.createLinearGradient(mid, 0, x2, 0);
      lg.addColorStop(0, "transparent"); lg.addColorStop(1, k.side < 0 ? POLY : KAL);
      cx.globalAlpha = .35 * fade; cx.strokeStyle = lg; cx.lineWidth = dpr;
      cx.beginPath(); cx.moveTo(mid, k.y); cx.lineTo(x2, k.y); cx.stroke();
      cx.globalAlpha = .6 * fade; cx.fillStyle = k.side < 0 ? POLY : KAL; cx.beginPath(); cx.arc(x2, k.y, 1.8 * dpr, 0, 7); cx.fill();
    }
    cx.globalAlpha = 1;
  }
  function loop(t){ draw(t); raf = requestAnimationFrame(loop); }
  size();
  addEventListener("resize", size);
  if (!still){
    document.addEventListener("visibilitychange", () => { cancelAnimationFrame(raf); last = 0; if (!document.hidden) raf = requestAnimationFrame(loop); });
    raf = requestAnimationFrame(loop);
  }
})();

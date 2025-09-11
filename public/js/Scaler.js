// Scaler.js — deterministic top-left translate + scale
(function () {
  var BASE_W = 1280;
  var BASE_H = 530; // score 50 + canvas 480
  var root, rafId = null;

  function vv() { return window.visualViewport; }

  function vpBox() {
    // visualViewport accounts for URL bars on mobile
    var v = vv();
    if (v && v.width && v.height) {
      return {
        w: v.width,
        h: v.height,
        ox: v.offsetLeft || 0,
        oy: v.offsetTop  || 0
      };
    }
    return { w: window.innerWidth, h: window.innerHeight, ox: 0, oy: 0 };
  }

  function fit() {
    if (!root) root = document.getElementById('scale-root');
    if (!root) return;

    var vp = vpBox();
    var scale = Math.min(vp.w / BASE_W, vp.h / BASE_H);
    if (!isFinite(scale) || scale <= 0) scale = 1;

    // Pixel-snapped to avoid subpixel blur
    scale = Math.round(scale * 10000) / 10000;

    // Center manually from the top-left origin
    var tx = Math.max(0, (vp.w - BASE_W * scale) / 2) + vp.ox;
    var ty = Math.max(0, (vp.h - BASE_H * scale) / 2) + vp.oy;

    // Apply both translate and scale in one transform
    root.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
  }

  function schedule() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(fit);
  }

  // React to anything that changes the usable viewport
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule, { passive: true });

  if (vv()) {
    vv().addEventListener('resize', schedule, { passive: true });
    vv().addEventListener('scroll', schedule, { passive: true }); // URL bar slide
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { passive: true });
  } else {
    schedule();
  }

  // Debug hook if you want to force a recompute from console
  window.__MM_fitToScreen = schedule;
})();

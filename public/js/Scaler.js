// Scaler.js — mobile-safe scaling using visualViewport when available
(function () {
    var BASE_W = 1280;
    var BASE_H = 530;
    var root, shell, rafId = null;
  
    function nowViewport() {
      // Prefer visualViewport (correct when URL bars show/hide)
      var vv = window.visualViewport;
      if (vv && vv.width && vv.height) {
        return { w: vv.width, h: vv.height };
      }
      return { w: window.innerWidth, h: window.innerHeight };
    }
  
    function fit() {
      if (!root) root = document.getElementById('scale-root');
      if (!shell) shell = document.getElementById('stage-center');
      if (!root || !shell) return;
  
      var vp = nowViewport();
      var scale = Math.min(vp.w / BASE_W, vp.h / BASE_H);
      if (!isFinite(scale) || scale <= 0) scale = 1;
  
      // tame subpixel jitter
      scale = Math.round(scale * 10000) / 10000;
  
      root.style.setProperty('--mm-scale', String(scale));
    }
  
    function schedule() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fit);
    }
  
    // Listen to all the things that can change the usable viewport on mobile
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
    document.addEventListener('visibilitychange', schedule, { passive: true });
  
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedule, { passive: true });
      window.visualViewport.addEventListener('scroll', schedule, { passive: true });
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', schedule, { passive: true });
    } else {
      schedule();
    }
  
    // optional: expose manual trigger
    window.__MM_fitToScreen = schedule;
  })();
  
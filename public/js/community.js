(function(){
  const rankEl = document.getElementById('rank');
  const rankInlineEl = document.getElementById('rank2');
  const waAnchor = document.getElementById('waCta');

  /* ---------------- Rank helpers ---------------- */
  function ordinal(n){
    const s = ["th","st","nd","rd"], v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
  }
  function setRank(n){
    const text = n ? ordinal(n) : '—';
    rankEl.textContent = text;
    if (rankInlineEl) rankInlineEl.textContent = n ? ordinal(n) : '[Xth]';
  }

  /* Try to resolve rank in multiple ways */
  async function resolveRank(){
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('rank');
    if (fromQuery && /^\d+$/.test(fromQuery)) return Number(fromQuery);

    try {
      const sid = localStorage.getItem('QF_SESSION_ID');
      if (sid) {
        const r = await fetch('/api/player/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid })
        });
        if (r.ok) {
          const j = await r.json();
          if (j && typeof j.joinOrder === 'number') return j.joinOrder;
        }
      }
    } catch (e) {}

    try {
      const r2 = await fetch('/api/community/count');
      if (r2.ok) {
        const j2 = await r2.json();
        if (j2 && typeof j2.total === 'number') return j2.total;
      }
    } catch (e) {}

    return null;
  }

  /* ---------------- Simple confetti ---------------- */
  function confetti(){
    const canvas = document.getElementById('confetti');
    const ctx = canvas.getContext('2d');
    const DPR = Math.max(1, window.devicePixelRatio || 1);
    function resize(){
      canvas.width = Math.floor(canvas.clientWidth * DPR);
      canvas.height = Math.floor(canvas.clientHeight * DPR);
    }
    resize(); window.addEventListener('resize', resize);

    const pieces = Array.from({length: 220}, () => {
      const w = 6 + Math.random()*8;
      return {
        x: Math.random()*canvas.width,
        y: -Math.random()*canvas.height,
        w, h: w*0.6,
        rot: Math.random()*Math.PI*2,
        speed: 1 + Math.random()*2,
        drift: -0.6 + Math.random()*1.2,
        hue: Math.floor(Math.random()*360)
      };
    });

    (function tick(){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for (const p of pieces){
        p.y += p.speed; p.x += p.drift; p.rot += 0.05;
        if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random()*canvas.width; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `hsl(${p.hue} 90% 60%)`;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      }
      requestAnimationFrame(tick);
    })();
  }


 /* ---------------- Role-based routing ---------------- */
async function resolveRoleAndRoute(joinOrder){
  let role = null;
  try {
    const sid = localStorage.getItem('QF_SESSION_ID');
    if (sid) {
      const r = await fetch('/api/player/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid })
      });
      if (r.ok) {
        const j = await r.json();
        if (j && j.playerId) {
          const g = await fetch('/api/journey/' + encodeURIComponent(j.playerId));
          if (g.ok) {
            const doc = await g.json();
            if (doc && typeof doc.role === 'string') role = doc.role.toLowerCase();
            // If artist -> redirect to EPK after 10 seconds
            if (role === 'artist') {
              const qs = (typeof joinOrder === 'number') ? ('?rank=' + encodeURIComponent(joinOrder)) : '';
              setTimeout(() => {
                window.location.replace('/epk-demo.html' + qs);
              }, 10000); // 10 seconds
              return; // stop here
            }
          }
          // Not artist or no role: set up WhatsApp auto-open
          scheduleWhatsAppAutoOpen();
          return;
        }
      }
    }
  } catch (e) {
    // If anything fails, fallback to WhatsApp auto-open
  }
  scheduleWhatsAppAutoOpen();
}


  /* ---------------- WhatsApp auto-open (only for non-artists) ---------------- */
  function scheduleWhatsAppAutoOpen(){
    if (!waAnchor) return;
    const timer = setTimeout(function(){
      const popup = window.open(waAnchor.href, '_blank', 'noopener,noreferrer');
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = waAnchor.href; // fallback same-tab
      }
    }, 8000);
    waAnchor.addEventListener('click', () => clearTimeout(timer), { once: true });
  }

  /* ---------------- Init ---------------- */
  (async function init(){
    confetti();
    const rank = await resolveRank();
    setRank(rank);
    await resolveRoleAndRoute(rank);
  })();
})();

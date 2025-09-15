
(function () {
  const rankEl = document.getElementById('rank');
  const rankInlineEl = document.getElementById('rank2');
  const waAnchor = document.getElementById('waCta');

  /* ---------- WA button show/hide ---------- */
  function showWhatsAppButton() {
    if (!waAnchor) return;
    waAnchor.style.display = 'inline-flex';
    waAnchor.setAttribute('aria-hidden', 'false');
  }
  function hideWhatsAppButton() {
    if (!waAnchor) return;
    waAnchor.style.display = 'none';
    waAnchor.setAttribute('aria-hidden', 'true');
  }
  hideWhatsAppButton();

  /* ---------------- Rank helpers ---------------- */
  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function setRank(n) {
    const text = n ? ordinal(n) : '—';
    if (rankEl) rankEl.textContent = text;
    if (rankInlineEl) rankInlineEl.textContent = n ? ordinal(n) : '[Xth]';
  }

  async function resolveRank() {
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
    } catch {}

    try {
      const r2 = await fetch('/api/community/count');
      if (r2.ok) {
        const j2 = await r2.json();
        if (j2 && typeof j2.total === 'number') return j2.total;
      }
    } catch {}

    return null;
  }

  /* ---------------- Simple confetti ---------------- */
  function confetti() {
    const canvas = document.getElementById('confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const DPR = Math.max(1, window.devicePixelRatio || 1);
    function resize() {
      canvas.width = Math.floor(canvas.clientWidth * DPR);
      canvas.height = Math.floor(canvas.clientHeight * DPR);
    }
    resize();
    window.addEventListener('resize', resize);

    const pieces = Array.from({ length: 220 }, () => {
      const w = 6 + Math.random() * 8;
      return {
        x: Math.random() * canvas.width,
        y: -Math.random() * canvas.height,
        w, h: w * 0.6,
        rot: Math.random() * Math.PI * 2,
        speed: 1 + Math.random() * 2,
        drift: -0.6 + Math.random() * 1.2,
        hue: Math.floor(Math.random() * 360)
      };
    });

    (function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.y += p.speed; p.x += p.drift; p.rot += 0.05;
        if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = `hsl(${p.hue} 90% 60%)`;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      requestAnimationFrame(tick);
    })();
  }

  /* ---------- Invite Gate UI (non-destructive verify & store) ---------- */
  function createInviteStylesOnce() {
    if (document.getElementById('invite-gate-styles')) return;
    const st = document.createElement('style');
    st.id = 'invite-gate-styles';
    st.textContent = `
      .invite-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:none}
      .invite-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
      .invite-box{width:min(420px,94vw);background:#fff;border:2px solid #000;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
      .invite-box header,.invite-box footer{padding:14px 16px}
      .invite-box header{display:flex;align-items:center;justify-content:space-between;font-weight:900;border-bottom:2px solid #000}
      .invite-box main{padding:14px 16px;display:grid;gap:10px}
      .invite-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center}
      .invite-row input{padding:12px;border:1px solid #e5e7eb;border-radius:10px;font:inherit;text-transform:uppercase}
      .invite-err{display:none;margin-top:4px;padding:10px;border:2px solid #fecaca;border-radius:10px;background:#fef2f2;color:#7f1d1d;font-size:16px}
      .invite-actions{display:flex;gap:10px;justify-content:flex-end}
      .invite-btn{background:#0b1220;border:2px solid #0b1220;color:#fff;padding:10px 16px;border-radius:10px;cursor:pointer;font-weight:900}
      .invite-btn.secondary{background:#fff;color:#0b1220}
      .invite-show{display:flex !important}
    `;
    document.head.appendChild(st);
  }

  function showInviteModal({ onSubmit, prefill }) {
    createInviteStylesOnce();
    let backdrop = document.getElementById('inviteBackdrop');
    let modal    = document.getElementById('inviteModal');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'inviteBackdrop';
      backdrop.className = 'invite-backdrop';
      document.body.appendChild(backdrop);
    }
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'inviteModal';
      modal.className = 'invite-modal';
      modal.innerHTML = `
        <div class="invite-box" role="dialog" aria-modal="true" aria-labelledby="inviteTitle">
          <header>
            <div id="inviteTitle">Enter your invite code</div>
            <button class="invite-btn secondary" id="inviteClose" type="button" aria-label="Close">✕</button>
          </header>
          <main>
            <div class="invite-row">
              <label for="inviteCode" style="font-weight:800">Invite code</label>
              <input id="inviteCode" type="text" maxlength="4" inputmode="latin-prose" placeholder="e.g., A3F9" />
            </div>
            <div id="inviteErr" class="invite-err"></div>
          </main>
          <footer class="invite-actions">
            <button class="invite-btn secondary" id="inviteCancel" type="button">Cancel</button>
            <button class="invite-btn" id="inviteSubmit" type="button">Continue</button>
          </footer>
        </div>`;
      document.body.appendChild(modal);
    }
    const codeInp = modal.querySelector('#inviteCode');
    const errBox  = modal.querySelector('#inviteErr');
    const close   = modal.querySelector('#inviteClose');
    const cancel  = modal.querySelector('#inviteCancel');
    const submit  = modal.querySelector('#inviteSubmit');

    function hide() {
      backdrop.classList.remove('invite-show');
      modal.classList.remove('invite-show');
    }
    function showError(msg) {
      errBox.textContent = msg || 'Invalid code.';
      errBox.style.display = 'block';
    }
    function clearError() { errBox.style.display = 'none'; errBox.textContent = ''; }

    codeInp.value = (prefill || '').slice(0,4).toUpperCase();
    clearError();

    backdrop.classList.add('invite-show');
    modal.classList.add('invite-show');
    setTimeout(() => codeInp.focus(), 0);

    function normalize(raw) {
      return String(raw || '').trim().toUpperCase().replace(/O/g, '0');
    }

    function submitCode() {
      clearError();
      const raw = normalize(codeInp.value);
      if (!/^[A-Z0-9]{4}$/.test(raw)) { showError('Please enter a valid 4-character code.'); return; }
      submit.disabled = true; submit.textContent = 'Checking…';
      Promise.resolve(onSubmit(raw))
        .then(ok => {
          if (ok) { hide(); }
          else { showError('This is an invite only platform and you were not invited.'); }
        })
        .catch(() => showError('Something went wrong. Please try again.'))
        .finally(() => { submit.disabled = false; submit.textContent = 'Continue'; });
    }

    close.onclick = hide;
    cancel.onclick = hide;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) hide(); }, { passive: true });
    submit.onclick = submitCode;
    codeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCode(); });
  }


 /** Non-destructive server check. Returns true if code exists & unused. */
async function checkInviteCode(code) {
  const payload = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) };

  // Preferred: explicit /check
  try {
    const r = await fetch('/api/invites/check', payload);
    if (r.ok) return true;             // 200 -> valid & unused
    if (r.status === 409) return false; // used
    if (r.status !== 404) return false; // any other error -> treat as invalid
  } catch {}

  // Fallback: legacy servers that only have /claim, use dryRun=1 (must return {ok:true, dryRun:true})
  try {
    const r2 = await fetch('/api/invites/claim?dryRun=1', payload);
    if (!r2.ok) return false;
    const j2 = await r2.json().catch(() => ({}));
    return !!j2.ok && !!j2.dryRun;
  } catch {}

  return false;
}


  /* ---------------- Role-based routing (with invite gate for artists) ---------------- */
  async function resolveRoleAndRoute(joinOrder) {
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

              if (role === 'artist') {
                hideWhatsAppButton();

                // If we already have a stored (pending) invite code, skip asking again
                const existing = localStorage.getItem('INVITE_CODE');
                if (existing && /^[A-Z0-9]{4}$/.test(existing)) {
                  setTimeout(() => {
                    const qs = (typeof joinOrder === 'number') ? ('?rank=' + encodeURIComponent(joinOrder)) : '';
                    window.location.replace('/epk-pay.html' + qs);
                  }, 200);
                  return;
                }

                // Otherwise prompt once; store (but don't consume) on success
                const codeFromLink = (new URLSearchParams(location.search).get('code') || '').toUpperCase().slice(0,4);
                showInviteModal({
                  prefill: codeFromLink,
                  onSubmit: async (code) => {
                    const ok = await checkInviteCode(code);
                    if (ok) {
                      localStorage.setItem('INVITE_CODE', code);
                      localStorage.setItem('INVITE_CLAIMED', '0'); // pending
                      const qs = (typeof joinOrder === 'number') ? ('?rank=' + encodeURIComponent(joinOrder)) : '';
                      setTimeout(() => window.location.replace('/epk-pay.html' + qs), 200);
                      return true;
                    }
                    return false;
                  }
                });
                return;
              }
            }
            // Non-artist or no role: show WA button + auto-open
            scheduleWhatsAppAutoOpen();
            return;
          }
        }
      }
    } catch {}
    scheduleWhatsAppAutoOpen();
  }

  /* ---------------- WhatsApp auto-open (only for non-artists) ---------------- */
  function scheduleWhatsAppAutoOpen() {
    if (!waAnchor) return;
    showWhatsAppButton();
    const timer = setTimeout(function () {
      const popup = window.open(waAnchor.href, '_blank', 'noopener,noreferrer');
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = waAnchor.href;
      }
    }, 8000);
    waAnchor.addEventListener('click', () => clearTimeout(timer), { once: true });
  }

  /* ---------------- Init ---------------- */
  (async function init() {
    confetti();
    const rank = await resolveRank();
    setRank(rank);
    await resolveRoleAndRoute(rank);
  })();
})();


// ./js/spin.js
(function () {
  // ---------- DOM ----------
  const wheel = document.getElementById('wheel');
  const spinBtn = document.getElementById('spinBtn');
  const skipBtn = document.getElementById('skipBtn');
  const alreadyMsg = document.getElementById('alreadyMsg');
  const spinHint = document.getElementById('spinHint');

  // Prize modal
  const prizeBackdrop = document.getElementById('prizeBackdrop');
  const prizeModal = document.getElementById('prizeModal');
  const prizeTitle = document.getElementById('prizeTitle');
  const prizeMsg = document.getElementById('prizeMsg');
  const codeBlock = document.getElementById('codeBlock');
  const prizeCode = document.getElementById('prizeCode');
  const prizeLimit = document.getElementById('prizeLimit');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const toAppBtn = document.getElementById('toAppBtn');
  const prizeClose = document.getElementById('prizeClose');

  const ctx = wheel?.getContext('2d');
  if (!wheel || !ctx) return;

  // ---------- State ----------
  const playerId = localStorage.getItem('QF_PLAYER_ID') || '';
  const SPIN_KEY = 'DS_SPIN_RESULT_V1';

  // ---------- Segments (7 equal slices — refund is 0% chance) ----------
  // Clockwise from top (pointer is at top).
  const segments = [
    { label: '100% Refund', type: 'refund', limit: 0, color: '#ef4444', weight: 0 }, // visible, not winnable
    { label: 'Invite × 1',  type: 'ref',    limit: 1, color: '#3b82f6', weight: 1 },
    { label: 'No Gift',     type: 'none',   limit: 0, color: '#14b8a6', weight: 1 },
    { label: 'Invite × 2',  type: 'ref',    limit: 2, color: '#f59e0b', weight: 1 },
    { label: 'Invite × 3',  type: 'ref',    limit: 3, color: '#22c55e', weight: 1 },
    { label: 'Invite × 2',  type: 'ref',    limit: 2, color: '#a78bfa', weight: 1 },
    { label: 'Invite × 3',  type: 'ref',    limit: 3, color: '#10b981', weight: 1 }
  ];
  const N = segments.length;
  const POSITIVE = segments.map((s,i)=> s.weight>0 ? i : null).filter(i=>i!==null);

  // ---------- Helpers ----------
  function jsonFetch(url, options) {
    return fetch(url, options).then(async (res) => {
      const txt = await res.text();
      let data;
      try { data = JSON.parse(txt); }
      catch {
        const short = txt.trim().slice(0, 180).replace(/\s+/g,' ');
        const u = (() => { try { return new URL(url, location.href).pathname; } catch { return String(url); }})();
        const err = new Error(`${res.status} ${res.statusText} at ${u} — server did not return JSON. ${short}`);
        err.status = res.status; err.raw = txt; throw err;
      }
      if (!res.ok) { const err = new Error(data?.error || data?.message || `${res.status} ${res.statusText}`); err.status = res.status; throw err; }
      return data;
    });
  }

  function saveSpin(obj){ try{ localStorage.setItem(SPIN_KEY, JSON.stringify(obj)); }catch{} }
  function readSpin(){ try{ return JSON.parse(localStorage.getItem(SPIN_KEY)||'null'); }catch{ return null; } }

  // ---------- Canvas DPR fit ----------
  function fitCanvasDPR() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = wheel.getBoundingClientRect();
    wheel.width = Math.max(1, Math.round(rect.width * dpr));
    wheel.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // ---------- Draw (labels horizontal) ----------
  let rotation = 0; // radians
  function drawWheel(rot = 0) {
    fitCanvasDPR();

    const w = wheel.getBoundingClientRect().width;
    const h = wheel.getBoundingClientRect().height;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(cx, cy) - 10;
    const arc = (Math.PI * 2) / N;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < N; i++) {
      const start = (i * arc) - Math.PI / 2 + rot;
      const end   = start + arc;
      const mid   = start + arc / 2;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = segments[i].color;
      ctx.fill();

      const lx = cx + Math.cos(mid) * (r * 0.58);
      const ly = cy + Math.sin(mid) * (r * 0.58);

      const text = segments[i].label;
      ctx.font = '700 13px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width;
      const th = 20, padX = 8, padY = 4;

      roundRect(ctx, lx - tw/2 - padX, ly - th/2 - padY, tw + padX*2, th + padY*2, 10);
      ctx.fillStyle = 'rgba(255,255,255,.96)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#111';
      ctx.fillText(text, lx, ly);
    }

    // hub
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,.2)';
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // pointer
    // ctx.beginPath();
    // ctx.fillStyle = '#111';
    // ctx.moveTo(cx, cy - r - 2);
    // ctx.lineTo(cx - 12, cy - r + 24);
    // ctx.lineTo(cx + 12, cy - r + 24);
    // ctx.closePath();
    // ctx.fill();
  }

  drawWheel(0);
  window.addEventListener('resize', () => drawWheel(rotation));

  // ---------- Modal ----------
  function openModal(){ prizeBackdrop.classList.add('show'); prizeModal.classList.add('show'); prizeBackdrop.setAttribute('aria-hidden','false'); }
  function closeModal(){ prizeBackdrop.classList.remove('show'); prizeModal.classList.remove('show'); prizeBackdrop.setAttribute('aria-hidden','true'); }
  prizeBackdrop.addEventListener('click', (e)=>{ if(e.target===prizeBackdrop) closeModal(); });
  prizeClose.addEventListener('click', closeModal);
  toAppBtn.addEventListener('click', ()=>{ location.href='https://app.dreamstage.tech'; });
  skipBtn?.addEventListener('click', ()=>{ location.href='https://app.dreamstage.tech'; });

  copyCodeBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(prizeCode.textContent.trim()); copyCodeBtn.textContent='Copied'; setTimeout(()=>copyCodeBtn.textContent='Copy', 1200); } catch {}
  });

  // ---------- Server helpers ----------
  async function getSpinStatusFromServer() {
    if (!playerId) return null;
    try { return await jsonFetch(`/api/spin/status?playerId=${encodeURIComponent(playerId)}`); }
    catch { return null; }
  }

  async function claimOnServer(limit) {
    if (!playerId) return { ok:false, error:'Missing player' };
    try {
      return await jsonFetch('/api/spin/claim', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ playerId, prize:'referrals', limit })
      });
    } catch (e) { return { ok:false, error: e.message }; }
  }

  async function createInviteCodeFallback(limit) {
    try {
      const j = await jsonFetch('/api/invites/referrals', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ playerId, count: 1, limit })
      });
      const code = Array.isArray(j.codes) ? j.codes[0] : j.code;
      return code ? { ok:true, code, limit: j.limit ?? limit } : { ok:false, error:'No code returned' };
    } catch (e) { return { ok:false, error: e.message }; }
  }

  // ---------- Prize UI ----------
  async function showPrize(seg) {
    // Safety: never award refund, even if selected accidentally
    if (seg.type === 'refund') {
      seg = segments[POSITIVE[0]]; // force to first valid prize
    }

    codeBlock.style.display = 'none';
    prizeCode.textContent = '—';
    prizeLimit.textContent = '—';

    if (seg.type === 'none') {
      prizeTitle.textContent = 'No Gift This Time';
      prizeMsg.textContent = 'Thanks for playing! More chances soon.';
      openModal();
      saveSpin({ type: seg.type, label: seg.label, limit: 0, code: '' });
      return;
    }

    const limit = seg.limit || 1;
    prizeTitle.textContent = 'Invite Power Unlocked!';
    prizeMsg.textContent = `Share this code. It can be used by up to ${limit} friend${limit>1?'s':''}.`;

    let claim = await claimOnServer(limit);
    if (!claim?.ok) claim = await createInviteCodeFallback(limit);

    if (claim?.ok && (claim.code || (claim.codes && claim.codes[0]))) {
      const code = claim.code || claim.codes[0];
      prizeCode.textContent = code;
      prizeLimit.textContent = String(claim.limit || limit);
      codeBlock.style.display = 'block';
      openModal();
      saveSpin({ type: seg.type, label: seg.label, limit: claim.limit || limit, code });
    } else {
      prizeMsg.textContent = claim?.error || 'Could not generate invite code. Please try again.';
      openModal();
    }
  }

  // ---------- Spin mechanics ----------
  function pickIndex() {
    // Choose only from positive-weight slices (refund excluded)
    const idx = POSITIVE[Math.floor(Math.random() * POSITIVE.length)];
    return (typeof idx === 'number') ? idx : 1; // fallback to a valid prize
    }

  let spinning = false;
  function spinOnce() {
    if (spinning) return;
    spinning = true;
    spinBtn.disabled = true;

    let idx = pickIndex();
    // Final guard
    if (segments[idx].weight <= 0) idx = POSITIVE[0];

    const arc = (Math.PI * 2) / N;
    const mid = idx * arc + arc / 2;
    const base = (Math.PI * 1.5) - mid;         // align chosen slice under pointer
    const extraTurns = Math.PI * 2 * 8;
    const end = base + extraTurns;

    const start = rotation;
    const delta = end - (start % (Math.PI * 2));

    const startTime = performance.now();
    const dur = 4200 + Math.random() * 600;
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    function tick(now){
      const k = Math.min(1, (now - startTime)/dur);
      rotation = start + easeOutCubic(k) * delta;
      drawWheel(rotation);
      if (k < 1) requestAnimationFrame(tick);
      else showPrize(segments[idx]);
    }
    requestAnimationFrame(tick);
  }

  // ---------- One spin only ----------
  (async function initGate(){
    let locked = false;
    try {
      const r = await getSpinStatusFromServer();
      if (r?.spun) {
        locked = true;
        spinBtn.disabled = true;
        spinBtn.textContent = 'Already Played';
        spinHint.style.display = 'none';
        alreadyMsg.style.display = 'block';
        if (r.result === 'referrals' && r.inviteCode) {
          alreadyMsg.innerHTML = `You already won <strong>${r.limit}</strong> invite${r.limit>1?'s':''}. Your code is <strong>${r.inviteCode}</strong>.`;
        } else if (r.result === 'refund') {
          alreadyMsg.textContent = 'You already hit the 100% refund! 🎉';
        } else {
          alreadyMsg.textContent = 'You have already spun the wheel.';
        }
        saveSpin({ type: r.result, limit: r.limit, code: r.inviteCode || '' });
      }
    } catch {}

    if (!locked && localStorage.getItem(SPIN_KEY)) {
      const res = readSpin();
      spinBtn.disabled = true;
      spinBtn.textContent = 'Already Played';
      spinHint.style.display = 'none';
      alreadyMsg.style.display = 'block';
      if (res?.type === 'ref' && res?.code) {
        alreadyMsg.innerHTML = `You already won <strong>${res.limit}</strong> invite${res.limit>1?'s':''}. Your code is <strong>${res.code}</strong>.`;
      } else if (res?.type === 'refund') {
        alreadyMsg.textContent = 'You already hit the 100% refund! 🎉';
      } else {
        alreadyMsg.textContent = 'You have already spun the wheel.';
      }
    }
  })();

  // ---------- Wire up ----------
  spinBtn.addEventListener('click', () => {
    if (localStorage.getItem(SPIN_KEY)) return; // local guard
    spinOnce();
  });
})();

(function(){
  const STATE = {
    sessionId: null,
    playerId: null,
    steps: {},
    name: '',
    phone: '',
    _currentPrice: 199,
    inviteCode: null,
    inviteClaimed: false
  };

  const TOTAL_STEPS = 7;
  const TOTAL_USERS = 10000; // scale cap for creator codes

  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => document.getElementById(id);
  const digits = (s) => String(s||'').replace(/\D+/g,'');
  const encodePhone = (p) => { try { return btoa(digits(p)); } catch { return digits(p); } };
  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

  function setAttr(el, name, val){ if(el) el.setAttribute(name, val); }
  function setDisabled(el, on){ if(!el) return; setAttr(el, 'aria-disabled', on ? 'true' : 'false'); el.disabled = !!on; }
  function isDisabled(el){ return !el || el.getAttribute('aria-disabled') === 'true' || el.disabled; }

  /* -------------------- Robust JSON helpers (avoid “Unexpected token <”) -------------------- */
  async function readJSONorThrow(res) {
    const urlPath = (() => { try { return new URL(res.url, location.href).pathname; } catch { return res.url || ''; } })();
    const text = await res.text();

    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_) {
      if (!res.ok || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        const summary = (text || '').replace(/\s+/g,' ').slice(0, 180);
        throw new Error(`${res.status} ${res.statusText} at ${urlPath} - server did not return JSON. ${summary}`);
      }
      throw new Error(`${res.status} ${res.statusText} at ${urlPath} - unexpected non-JSON response.`);
    }

    if (!res.ok) {
      const errMsg = data?.error || data?.message || `${res.status} ${res.statusText}`;
      throw new Error(errMsg);
    }
    return data;
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return readJSONorThrow(res);
  }

  /* ---------- Bring forward local game/session + pending invite (do NOT consume until after payment) ---------- */
  (function hydrateFromLocalStorage(){
    try{
      const raw = localStorage.getItem('QF_STATE');
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === 'object') {
          if (j.name && !STATE.name) STATE.name = String(j.name);
          if ((j.phoneE164 || j.phone) && !STATE.phone) STATE.phone = String(j.phoneE164 || j.phone);
        }
      }
    }catch{}
    const pid = localStorage.getItem('QF_PLAYER_ID');
    if (pid) STATE.playerId = pid;
    const sid = localStorage.getItem('QF_SESSION_ID');
    if (sid) STATE.sessionId = sid;

    const code = (localStorage.getItem('INVITE_CODE') || '').toUpperCase();
    STATE.inviteCode = /^[A-Z0-9]{4}$/.test(code) ? code : null;
    STATE.inviteClaimed = localStorage.getItem('INVITE_CLAIMED') === '1';
  })();

  /* ---------- Progress tube (page steps) ---------- */
  (function(){
    const nav = byId('stepNav'); if(!nav) return;
    const links = Array.from(nav.querySelectorAll('a'));
    const map = {s1:1,s2:2,s3:3,s4:4,s5:5,s6:6,s7:7};

    function setActive(step){
      links.forEach(a => a.classList.toggle('active', Number(a.dataset.step)===step));
      document.documentElement.style.setProperty('--tube', step/ TOTAL_STEPS);
    }
    const obs = new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          const step = map[e.target.id]||1;
          setActive(step);
        }
      });
    }, { root:null, rootMargin:"-30% 0px -40% 0px", threshold:0.01 });

    Object.keys(map).forEach(id=>{
      const el=document.getElementById(id);
      if(el) obs.observe(el);
    });

    links.forEach(a=>{
      a.addEventListener('click', ()=> setActive(Number(a.dataset.step)));
    });
  })();

  /* ---------- Unified Tooltip Toggle for Hover and Tap ---------- */
  (function () {
    const tooltipTriggers = document.querySelectorAll([
      '.why-wrap .btn', // Why buttons (S1, S2)
      '#perksBtn', // Perks button (S5, specific ID for reliability)
      '#s3 .preview-anchor .preview-link', // Preview link (S3)
      '#s4 .details .btn', // Timeline details (S4)
      '#s6 .why .why-btn' // Plan details (S6)
    ].join(','));

    tooltipTriggers.forEach(btn => {
      const wrap = btn.closest('.why-wrap, .perks-wrap, .preview-anchor, .details, .why');
      if (!wrap) return;

      function toggleTooltip(e) {
        e.preventDefault();
        e.stopPropagation(); // Prevent parent events
        const isOpen = wrap.classList.contains('open');
        // Close all other tooltips
        document.querySelectorAll('.why-wrap.open, .perks-wrap.open, .preview-anchor.open, .details.open, .why.open')
          .forEach(w => {
            if (w !== wrap) {
              w.classList.remove('open');
              const trigger = w.querySelector('.btn, .preview-link, .why-btn, #perksBtn');
              if (trigger) trigger.setAttribute('aria-expanded', 'false');
            }
          });
        // Toggle current tooltip
        wrap.classList.toggle('open', !isOpen);
        btn.setAttribute('aria-expanded', !isOpen);
      }

      // Remove existing listeners to prevent duplicates
      btn.removeEventListener('click', toggleTooltip);
      btn.removeEventListener('touchend', toggleTooltip);
      // Add listeners for both click and touchend
      btn.addEventListener('click', toggleTooltip, { passive: false });
      btn.addEventListener('touchend', toggleTooltip, { passive: false });

      // Close tooltip when tapping/clicking outside
      document.addEventListener('click', e => {
        if (!wrap.contains(e.target)) {
          wrap.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        }
      }, { passive: true });

      // Prevent unintended hover or parent event triggers on touch
      btn.addEventListener('touchstart', e => {
        e.stopPropagation();
      }, { passive: true });
    });
  })();

  /* ---------- Pledge ---------- */
  (function(){
    const row  = byId('pledgeRow');
    const chk  = byId('pledgeChk');
    const pill = byId('pledgeState');
    const next = byId('pledgeNext');
    const goConfirm = byId('goConfirm');

    async function persist(val){
      if(!STATE.playerId) return;
      try{
        await fetch(`/api/journey/${encodeURIComponent(STATE.playerId)}`, {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ commitmentAgreed: !!val, consentAgreed: !!val })
        });
      }catch{}
    }

    function updateUI(){
      const on = !!(chk && chk.checked);
      if(pill){
        pill.textContent = on ? "You're in ✓" : "Pending";
        pill.classList.toggle('ok', on);
      }
      if(next){
        setDisabled(next, !on);
        next.classList.toggle('ghost', !on);
      }
      if(goConfirm){ setDisabled(goConfirm, !on); }
      STATE.steps.commitmentAgreed = on;
      try{ localStorage.setItem('STEPS', JSON.stringify(STATE.steps)); }catch{}
    }

    function toggleChecked(){
      chk.checked = !chk.checked;
      updateUI();
      persist(chk.checked);
    }

    row.addEventListener('click', function(e){
      if(e.target.tagName==='INPUT'||e.target.tagName==='LABEL') return;
      toggleChecked();
    });
    row.addEventListener('keydown', function(e){
      if(e.key==='Enter'||e.key===' ') { e.preventDefault(); toggleChecked(); }
    });
    chk.addEventListener('change', function(){
      updateUI();
      persist(chk.checked);
    });

    STATE._pledgeUpdateUI = updateUI;
  })();

  /* ---------- Helpers for code preview + counts ---------- */
  const ccBig = byId('ccBig');
  const ccTier = byId('ccTier');
  const ccPctLabel = document.querySelector('#s5 .prog .label');
  const ccBar = byId('ccBar');
  const ccTiny = document.querySelector('#s5 .tiny');

  function padCode(n){ return '#'+String(Math.max(0,Math.floor(n||0))).padStart(4,'0'); }
  function codeToLabel(v){
    if (v == null) return '';
    const s = String(v);
    if (s.startsWith('#')) return s;
    const n = Number(s);
    if (Number.isFinite(n)) return '#'+String(n).padStart(4, '0');
    return s;
  }

  function setTierByCode(n){
    let label = '';
    if (n >= 1 && n <= 100) label = 'OG Member';
    else if (n <= 500)      label = 'Opener Member';
    else if (n <= 3000)     label = 'Spotlight Member';
    else if (n <= TOTAL_USERS) label = 'Encore Member';
    ccTier.textContent = label;
    ccTier.style.display = label ? 'inline-block' : 'none';
  }

  function updateDealPriceByCode(n){
    let price = 199;
    if (n > 0 && n <= 100) price = 49;
    else if (n > 100 && n <= 3000) price = 99;
    const dealYearEl = byId('dealYear');
    const dealMonthlyEl = byId('dealMonthly');
    if (dealYearEl) dealYearEl.textContent = String(price);
    if (dealMonthlyEl) dealMonthlyEl.textContent = (price / 12).toFixed(2);
    STATE._currentPrice = price;
  }

  function animateCount(el, to, duration=900){
    if(!el) return;
    const from = Number(String(el.textContent||'').replace(/[^\d]/g,'')) || 0;
    const start = performance.now();
    function step(t){
      const k = Math.min(1, (t - start)/duration);
      const val = Math.floor(from + (to - from) * k);
      el.textContent = String(val);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function setScaleNow(predictedRank){
    if (!ccPctLabel) return;
    const rank = Math.max(1, Math.min(predictedRank || 1, TOTAL_USERS));
    const topPercent = Math.max(1, Math.ceil((rank / TOTAL_USERS) * 100));
    const fillPct = Math.max(0, 100 - topPercent);
    ccPctLabel.innerHTML = `You're in the top <span id="ccTop">0</span>%`;
    animateCount(byId('ccTop'), topPercent, 700);
    ccBar.style.width = fillPct + '%';
  }

  async function fetchCreatorPaidCount(){
    const candidates = [
      ['/api/pay/total', ['totalPaid','paid','count','total']],
      ['/api/pay/stats', ['paid','totalPaid','count','total']],
      ['/api/players/creator-codes/count', ['count','total']],
      ['/api/membership/total', ['total','count']],
    ];
    for (const [url, keys] of candidates){
      try{
        const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!r.ok) continue;
        const j = await readJSONorThrow(r);
        for (const k of keys){
          const n = Number(j?.[k]);
          if (Number.isFinite(n)) return Math.max(0, n);
        }
      }catch{}
    }
    return Number(localStorage.getItem('CREATOR_COUNT_HINT') || 0);
  }

  async function initS5PreviewAndCounts(){
    const ccLabel = document.querySelector('#s5 .cc-label');
    if (ccLabel) ccLabel.textContent = 'This is what your creator code would look like';

    const paidCount = await fetchCreatorPaidCount();
    localStorage.setItem('CREATOR_COUNT_HINT', String(paidCount));

    const predicted = Math.max(1, Math.min(paidCount + 1, TOTAL_USERS));
    if (ccBig) ccBig.textContent = padCode(predicted);
    setTierByCode(predicted);
    updateDealPriceByCode(predicted);
    setScaleNow(predicted);

    if (ccTiny) {
      ccTiny.innerHTML = `Already <strong><span id="boughtCount">0</span></strong> creators have joined.`;
      animateCount(byId('boughtCount'), paidCount, 900);
    }
  }

  (function(){
    const el = byId('s5');
    if (!el) return;
    let done = false;
    const io = new IntersectionObserver(async entries=>{
      if (!done && entries.some(e=>e.isIntersecting)){
        done = true;
        await initS5PreviewAndCounts();
      }
    }, { threshold: 0.25 });
    io.observe(el);
  })();

  /* ---------- Session & Journey helpers ---------- */
  function ensureSessionId(){
    let sid = new URLSearchParams(location.search).get('sessionId') ||
              localStorage.getItem('QF_SESSION_ID') ||
              localStorage.getItem('SESSION_ID') ||
              localStorage.getItem('MM_SESSION_ID');
    if(!sid){ sid = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
    localStorage.setItem('QF_SESSION_ID', sid);
    STATE.sessionId = sid;
    return sid;
  }

  async function resolvePlayerFromSession(){
    const sessionId = STATE.sessionId || ensureSessionId();
    try{
      const r = await fetch('/api/player/session', {
        method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify({ sessionId })
      });
      if (r.ok){
        const j = await readJSONorThrow(r);
        if (j?.playerId) STATE.playerId = j.playerId;
      }
    }catch{}
  }

  async function loadJourney(){
    if(!STATE.playerId) return;
    try{
      const r = await fetch(`/api/journey/${STATE.playerId}`, { headers: { 'Accept': 'application/json' } });
      if(!r.ok) return;
      const doc = await readJSONorThrow(r);
      STATE.steps = doc.steps || STATE.steps || {};
      if (doc.name && !STATE.name) STATE.name = doc.name;
      if (doc.phone?.number && !STATE.phone) STATE.phone = doc.phone.number;
      try{ localStorage.setItem('STEPS', JSON.stringify(STATE.steps)); }catch{}
      if (typeof STATE._pledgeUpdateUI === 'function') {
        const chk = byId('pledgeChk'); if (chk) chk.checked = !!STATE.steps.commitmentAgreed;
        STATE._pledgeUpdateUI();
      }
      updateDetailsUI();
    }catch{}
  }

  /* ---------- Auto-redirect if already paid ---------- */
  function membershipIsActive(m){
    if (!m || m.status !== 'active') return false;
    if (!m.validTill) return true;
    const vt = new Date(m.validTill);
    return isFinite(vt.getTime()) ? vt.getTime() > Date.now() : true;
  }

  async function tryAutoRedirectIfActive(){
    const phone = STATE.phone;
    if (!phone) return false;
    try{
      const res = await fetch(`/api/player/by-phone?phone=${encodeURIComponent(phone)}`, { headers: { 'Accept':'application/json' } });
      if (!res.ok) return false;
      const p = await readJSONorThrow(res);
      if (membershipIsActive(p.membership)) {
        sessionStorage.setItem('MEMBERSHIP_ACTIVE', '1');
        location.replace('complete.html');
        return true;
      }
    }catch{}
    return false;
  }

  /* ---------- Recovery ---------- */
  const rBackdrop = byId('recoverBackdrop');
  const rModal    = byId('recoverModal');
  const rClose    = byId('recoverClose');
  const rCancel   = byId('recoverCancel');
  const rSubmit   = byId('recoverSubmit');
  const rCountry  = byId('recoverCountry');
  const rPhone    = byId('recoverPhone');
  const rErr      = byId('recoverErr');

  const COUNTRY_CODES = [
    { dial:'91',  name:'India (+91)',                pattern:/^[6-9]\d{9}$/ },
    { dial:'1',   name:'United States (+1)',         pattern:/^\d{10}$/ },
    { dial:'44',  name:'United Kingdom (+44)',       pattern:/^\d{10}$/ },
    { dial:'971', name:'United Arab Emirates (+971)',pattern:/^\d{7,9}$/ },
    { dial:'65',  name:'Singapore (+65)',            pattern:/^\d{8}$/ },
    { dial:'61',  name:'Australia (+61)',            pattern:/^\d{9}$/ }
  ];
  function fillCountrySelect(sel){
    sel.innerHTML = '';
    COUNTRY_CODES.forEach(c=>{ const o=document.createElement('option'); o.value=c.dial; o.textContent=c.name; sel.appendChild(o); });
    sel.value='91';
  }
  fillCountrySelect(rCountry);

  function toE164(dial, national){
    const cc=digits(dial), nn=digits(national);
    const total=cc+nn; if (total.length<5 || total.length>15) return null; return '+'+total;
  }
  function validNational(dial, national){
    const c=COUNTRY_CODES.find(x=>x.dial===String(dial));
    if (!c||!c.pattern) return digits(national).length>=6;
    return c.pattern.test(digits(national));
  }
  function openRecover(){
    if (!rBackdrop || !rModal) return;
    rErr.style.display='none'; rErr.textContent='';
    rBackdrop.classList.add('recover-show'); rModal.classList.add('recover-show');
    setTimeout(()=> rPhone && rPhone.focus(), 0);
  }
  function closeRecover(){ if (!rBackdrop || !rModal) return; rBackdrop.classList.remove('recover-show'); rModal.classList.remove('recover-show'); }
  rClose && rClose.addEventListener('click', closeRecover);
  rCancel && rCancel.addEventListener('click', closeRecover);
  rBackdrop && rBackdrop.addEventListener('click', (e)=>{ if(e.target===rBackdrop) closeRecover(); });

  async function tryRecover(){
    rErr.style.display='none'; rErr.textContent='';
    const dial = rCountry.value; const national = rPhone.value.trim();
    if(!validNational(dial, national)){
      rErr.textContent='That number looks invalid for the selected country.'; rErr.style.display='block'; return;
    }
    const e164 = toE164(dial, national);
    try{
      const res = await fetch(`/api/player/by-phone?phone=${encodeURIComponent(e164)}`, { headers: { 'Accept': 'application/json' } });
      if(!res.ok){ rErr.textContent='We couldn’t find an account with that number.'; rErr.style.display='block'; return; }
      const p = await readJSONorThrow(res);

      const playerId = p._id || p.playerId || '';
      if (playerId) {
        STATE.playerId = playerId;
        localStorage.setItem('QF_PLAYER_ID', playerId);
      }
      STATE.phone = p.phone?.number || e164;

      if (!p.name && playerId){
        try{
          const jr = await fetch(`/api/journey/${playerId}`, { headers: { 'Accept': 'application/json' } });
          if (jr.ok){
            const jd = await readJSONorThrow(jr);
            if (jd?.name) STATE.name = jd.name;
          }
        }catch{}
      } else if (p.name) {
        STATE.name = p.name;
      }

      try{
        const gs = JSON.parse(localStorage.getItem('QF_STATE') || '{}');
        if (STATE.name) gs.name = STATE.name;
        gs.phoneE164 = STATE.phone;
        localStorage.setItem('QF_STATE', JSON.stringify(gs));
      }catch{}

      const sessionId = STATE.sessionId || ensureSessionId();
      try{
        await fetch(`/api/player/${encodeURIComponent(sessionId)}`, {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ phone: STATE.phone })
        }).catch(()=>{});
      }catch{}

      updateDetailsUI();
      closeRecover();

      await tryAutoRedirectIfActive();
      await loadJourney();
    }catch{
      rErr.textContent='Something went wrong. Please try again.'; rErr.style.display='block';
    }
  }
  rSubmit && rSubmit.addEventListener('click', tryRecover);
  rPhone && rPhone.addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryRecover(); });

  /* ---------- Details UI ---------- */
  function updateDetailsUI(){
    const dn = byId('detName'); if(dn) dn.textContent = STATE.name || '—';
    const dp = byId('detPhone'); if(dp) dp.textContent = STATE.phone || '—';
    syncPayButtonState();
  }
  STATE._updateDetailsUI = updateDetailsUI;

  /* ---------- Init flow ---------- */
  (async function init(){
    ensureSessionId();
    await resolvePlayerFromSession();
    await loadJourney();

    if (await tryAutoRedirectIfActive()) return;

    if (!STATE.playerId || !STATE.phone || !STATE.name) {
      openRecover();
    }
    const confirmCb = byId('confirmSub');
    if (confirmCb) {
      confirmCb.checked = !!(STATE.steps && STATE.steps.subscriptionConfirmed);
      syncPayButtonState();
    }
  })();

  /* ---------- S6: Confirm button -> jump to S7 ---------- */
  (function(){
    const goConfirm = byId('goConfirm');
    if(!goConfirm) return;
    goConfirm.addEventListener('click', ()=>{
      if (isDisabled(goConfirm)) return;
      location.hash = '#s7';
    });
  })();

  /* ---------- S7: Confirmation, Edit ---------- */
  function syncPayButtonState(){
    const cb = byId('confirmSub');
    const btn = byId('payBtn');
    const on = !!(cb && cb.checked) && !!STATE.phone;
    setDisabled(btn, !on);
  }

  (function(){
    const cb = byId('confirmSub'); if(!cb) return;
    cb.addEventListener('change', async ()=>{
      const on = !!cb.checked;
      STATE.steps.subscriptionConfirmed = on;
      try{ localStorage.setItem('STEPS', JSON.stringify(STATE.steps)); }catch{}
      syncPayButtonState();
      if(STATE.playerId){
        try{
          await fetch(`/api/journey/${encodeURIComponent(STATE.playerId)}`, {
            method:'PATCH', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ subscriptionConfirmed: on })
          });
        }catch{}
      }
    });
  })();

  /* ---------- Edit Details (country select + national number) ---------- */
  (function(){
    const openBtn  = byId('editDetailsBtn');
    const backdrop = byId('editBackdrop');
    const modal    = byId('editModal');
    const closeBtn = byId('editClose');
    const cancelBtn= byId('editCancel');
    const saveBtn  = byId('editSave');
    const nameInp  = byId('editName');
    const phoneInp = byId('editPhone');
    const ccSel    = byId('editCountry');
    const errBox   = byId('editErr');

    if(!openBtn) return;

    if (ccSel) fillCountrySelect(ccSel);

    function splitE164(e164){
      const d = digits(e164);
      if (!d) return { cc: (ccSel && ccSel.value) || '91', nn: '' };
      const codes = [...COUNTRY_CODES].sort((a,b)=> b.dial.length - a.dial.length);
      for (const c of codes){
        if (d.startsWith(c.dial)) return { cc: c.dial, nn: d.slice(c.dial.length) };
      }
      return { cc: (ccSel && ccSel.value) || '91', nn: d };
    }

    function open(){
      errBox.style.display='none'; errBox.textContent='';
      nameInp.value = STATE.name || '';
      const { cc, nn } = splitE164(STATE.phone || '');
      if (ccSel) ccSel.value = cc;
      phoneInp.value = nn;
      backdrop.classList.add('recover-show');
      modal.classList.add('recover-show');
      setTimeout(()=> (nameInp.value ? phoneInp.focus() : nameInp.focus()), 0);
    }

    function close(){
      backdrop.classList.remove('recover-show');
      modal.classList.remove('recover-show');
    }

    async function save(){
      errBox.style.display='none'; errBox.textContent='';
      const name = (nameInp.value||'').trim();
      const dial = ccSel ? ccSel.value : '91';
      const nat  = (phoneInp.value||'').trim();
      if(!name){ errBox.textContent='Please enter your name.'; errBox.style.display='block'; return; }
      if(!validNational(dial, nat)){ errBox.textContent='That number looks invalid for the selected country.'; errBox.style.display='block'; return; }
      if(!STATE.playerId){ errBox.textContent='We couldn’t find your session. Please refresh.'; errBox.style.display='block'; return; }

      const e164 = toE164(dial, nat);

      setDisabled(saveBtn, true); saveBtn.textContent='Saving...';
      try{
        const r = await fetch(`/api/journey/${encodeURIComponent(STATE.playerId)}`, {
          method:'PATCH',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name, phoneNumber: e164 })
        });
        if(!r.ok){
          const j = await r.json().catch(()=>({}));
          if (j && j.error === 'PHONE_EXISTS'){
            errBox.textContent = 'This phone number is already linked to another account.';
            errBox.style.display='block';
            return;
          }
          errBox.textContent = 'Could not save right now. Try again.';
          errBox.style.display='block';
          return;
        }
        STATE.name = name;
        STATE.phone = e164;
        try{
          const gs = JSON.parse(localStorage.getItem('QF_STATE') || '{}');
          gs.name = STATE.name; gs.phoneE164 = STATE.phone;
          localStorage.setItem('QF_STATE', JSON.stringify(gs));
        }catch{}
        if(typeof STATE._updateDetailsUI === 'function') STATE._updateDetailsUI();

        await tryAutoRedirectIfActive();

        close();
      }catch{
        errBox.textContent='Something went wrong. Please try again.'; errBox.style.display='block';
      }finally{
        setDisabled(saveBtn, false); saveBtn.textContent='Save';
      }
    }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) close(); });
    saveBtn.addEventListener('click', save);
    phoneInp.addEventListener('keydown', (e)=>{ if(e.key==='Enter') save(); });
  })();

  /* ---------- Payment popup + invoice + creator code assignment (UPDATED) ---------- */
  (function () {
    const payBtn      = byId('payBtn');
    const msg         = byId('payMsg');
    const payBackdrop = byId('payBackdrop');
    const payModal    = byId('payModal');
    const payClose    = byId('payClose');

    const payStart    = byId('payStart');
    const payRetry    = byId('payRetry');
    const payInvoice  = byId('payInvoice');
    const payContinue = byId('payContinue');

    const payStatus   = byId('payStatus');
    const payErr      = byId('payErr');
    const stayWarn    = byId('payStay');

    const laneProcessing = byId('laneProcessing');
    const laneSuccess    = byId('laneSuccess');
    const laneFailed     = byId('laneFailed');

    const payPlan     = byId('payPlan');
    const payPlanName = byId('payPlanName');
    const payPlanAmt  = byId('payPlanAmt');

    const receiptCard = byId('receiptCard');
    const invAmount   = byId('invAmount');
    const invOrder    = byId('invOrder');
    const invPayment  = byId('invPayment');
    const invCode     = byId('invCode');
    const invPlan     = byId('invPlan');
    const invInvoice  = byId('invInvoice');
    const invDate     = byId('invDate');

    const digits = (s) => String(s || '').replace(/\D+/g, '');
    const encodePhone = (p) => { try { return btoa(digits(p)); } catch { return digits(p); } };

    function codeToLabel(val) {
      if (val == null) return '';
      const s = String(val).replace(/^#/, '');
      const n = Number(s);
      if (Number.isFinite(n) && n > 0) return '#' + String(n).padStart(4, '0');
      return String(val).startsWith('#') ? String(val) : '#' + String(val);
    }

    function setStatus(text) { if (payStatus) payStatus.textContent = text; }

    function setLane(state) {
      [laneProcessing, laneSuccess, laneFailed].forEach(el => el && el.classList.remove('active'));
      if (state === 'processing') laneProcessing?.classList.add('active');
      if (state === 'success')    laneSuccess?.classList.add('active');
      if (state === 'failed')     laneFailed?.classList.add('active');
    }

    function getS6PlanFromDOM() {
      const yEl = document.getElementById('dealYear');
      const mEl = document.getElementById('dealMonthly');
      const yearVal = Number(String(yEl?.textContent || '').replace(/[^\d]/g, ''));
      const monthlyVal = Number(String(mEl?.textContent || '').replace(/[^\d.]/g, ''));
      if (Number.isFinite(yearVal) && yearVal > 0) {
        const name = yearVal < 199 ? 'Yearly - Early Access' : 'Yearly';
        const monthly = Number.isFinite(monthlyVal) ? monthlyVal : +(yearVal / 12).toFixed(2);
        return { year: yearVal, monthly, name };
      }
      return null;
    }

    function showPlanChipInitial() {
      if (!payPlan) return;
      const s6 = getS6PlanFromDOM();
      const rupees = Number.isFinite(s6?.year) ? s6.year : (STATE._currentPrice || 199);
      const planName = s6?.name || (rupees < 199 ? 'Yearly - Early Access' : 'Yearly');

      if (payPlanName) payPlanName.textContent = planName;
      if (payPlanAmt)  payPlanAmt.textContent  = '₹' + rupees + ' / year for the next 2 years';

      payPlan.style.display = 'inline-flex';
    }

    function refinePlanChipWithOrder(order) {
      if (!payPlan) return;
      const currency = order?.currency || 'INR';
      const rupeesFromOrder = Number.isFinite(order?.amount) ? Math.round(order.amount / 100) : NaN;

      if (Number.isFinite(rupeesFromOrder)) {
        const label = (currency === 'INR' ? '₹' : currency + ' ') + rupeesFromOrder + ' / year';
        if (payPlanAmt) payPlanAmt.textContent = label;
      }
      payPlan.style.display = 'inline-flex';
    }

    async function tryAutoRedirectIfActive() {
      try {
        if (!STATE.phone) return false;
        const res = await fetch(`/api/player/by-phone?phone=${encodeURIComponent(STATE.phone)}`, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return false;
        const j = await res.json();
        if (j?.membership?.status === 'active') {
          if (j._id) { STATE.playerId = j._id; localStorage.setItem('QF_PLAYER_ID', j._id); }
          const k = encodePhone(STATE.phone);
          location.href = `complete.html?k=${encodeURIComponent(k)}`;
          return true;
        }
      } catch {}
      return false;
    }

    if (!payBtn) return;

    function openPopup() {
      if (!payModal || !payBackdrop) { doPayLegacy(); return; }
      setLane('processing'); setStatus('Ready');
      if (payErr) { payErr.style.display = 'none'; payErr.textContent = ''; }
      if (receiptCard) receiptCard.style.display = 'none';
      if (payInvoice)  payInvoice.style.display  = 'none';
      if (payContinue) payContinue.style.display = 'none';
      if (payRetry)    payRetry.style.display    = 'none';
      if (payStart)  { payStart.style.display    = 'inline-block'; }
      if (stayWarn)    stayWarn.style.display    = 'flex';

      if (payPlan) payPlan.style.display = 'none';
      showPlanChipInitial();

      payBackdrop.classList.add('recover-show');
      payModal.classList.add('recover-show');
    }

    function closePopup() {
      if (!payModal || !payBackdrop) return;
      payBackdrop.classList.remove('recover-show');
      payModal.classList.remove('recover-show');
    }
    payClose?.addEventListener('click', closePopup);
    payBackdrop?.addEventListener('click', (e) => { if (e.target === payBackdrop) closePopup(); });

    payBtn.addEventListener('click', async () => {
      if (payBtn.getAttribute('aria-disabled') === 'true') return;
      if (!STATE.phone) {
        if (msg) msg.textContent = 'Please add your phone number under "Your Details" before paying.';
        payBtn.classList.add('shake'); setTimeout(() => payBtn.classList.remove('shake'), 400);
        return;
      }
      if (await tryAutoRedirectIfActive()) return;
      openPopup();
    });

    async function createOrder() {
      return postJSON('/api/pay/order', { phone: STATE.phone });
    }

    function openCheckout(order) {
      return new Promise((resolve, reject) => {
        const options = {
          key: order.keyId,
          amount: String(order.amount),
          currency: order.currency,
          name: 'Dream Stage',
          description: 'Membership',
          order_id: order.orderId,
          prefill: {
            name: STATE.name || order.name || 'Dream Stage Member',
            contact: order.contact || digits(STATE.phone)
          },
          theme: { color: '#d946ef' },
          modal: { ondismiss: () => reject(new Error('Payment window closed')) },
          handler: (resp) => resolve(resp)
        };
        const rz = new Razorpay(options);
        rz.on('payment.failed', (resp) => reject(new Error(resp?.error?.description || 'Payment failed')));
        rz.open();
      });
    }

    async function verifyPayment(payload) {
      return postJSON('/api/pay/verify', {
        phone: STATE.phone,
        razorpay_payment_id: payload.razorpay_payment_id,
        razorpay_order_id: payload.razorpay_order_id,
        razorpay_signature: payload.razorpay_signature
      });
    }

    async function assignCreatorCode() {
      if (!STATE.playerId) throw new Error('Missing player');
      return postJSON(`/api/players/${encodeURIComponent(STATE.playerId)}/assign-creator-code`, {});
    }

    async function claimInviteAfterPayment() {
      if (!STATE.inviteCode || STATE.inviteClaimed) return true;
      try {
        const j = await postJSON('/api/invites/claim', { code: STATE.inviteCode, playerId: STATE.playerId });
        if (j?.ok) { STATE.inviteClaimed = true; localStorage.setItem('INVITE_CLAIMED', '1'); return true; }
      } catch {}
      return false;
    }

    /* ---------- Code Congrats popup (new) ---------- */
    const codeBackdrop = byId('codeBackdrop');
    const codeModal = byId('codeModal');
    const codeClose = byId('codeClose');
    const codeOk = byId('codeOk');
    const codeValue = byId('codeValue');
    const codeConfetti = byId('codeConfetti');
    const codeCopy = byId('codeCopy');
    const codeShare = byId('codeShare');

    function closeCodePopup(){
      if (!codeBackdrop || !codeModal) return;
      codeBackdrop.classList.remove('recover-show');
      codeModal.classList.remove('recover-show');
    }

    function burstConfetti(canvas, duration=20000){
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      function resize(){
        const r = canvas.getBoundingClientRect();
        canvas.width = Math.max(320, Math.floor(r.width));
        canvas.height = Math.max(140, Math.floor(r.height));
      }
      resize();
      window.addEventListener('resize', resize);

      const colors = [
        '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
        '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#6366f1',
        '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
      ];

      const W = () => canvas.width;
      const H = () => canvas.height;
      const N = 180;
      const g = 0.015;
      const pieces = Array.from({length:N}, () => ({
        x: Math.random()*W(),
        y: -Math.random()*H()*0.6,
        r: 2 + Math.random()*4,
        vx: -1 + Math.random()*2,
        vy: 1.2 + Math.random()*2.4,
        rot: Math.random()*Math.PI*2,
        vr: -0.25 + Math.random()*0.5,
        c: colors[(Math.random()*colors.length)|0],
        shape: (Math.random()<0.3) ? 'circle' : 'rect'
      }));

      const t0 = performance.now();
      function step(t){
        const k = Math.min(1, (t - t0)/duration);
        ctx.clearRect(0,0,W(),H());
        for (const p of pieces){
          p.vx += Math.sin((t + p.x)*0.001)*0.002;
          p.vy += g;
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vr;

          if (p.y > H()+12) {
            p.y = -12;
            p.x = Math.random()*W();
            p.vy = 1 + Math.random()*2.2;
          }

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          if (p.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, p.r, 0, Math.PI*2);
            ctx.fill();
          } else {
            ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);
          }
          ctx.restore();
        }
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function openCodePopup(codeLabel){
      if (!codeBackdrop || !codeModal) return;
      if (codeValue) codeValue.textContent = codeLabel || '#0000';
      codeBackdrop.classList.add('recover-show');
      codeModal.classList.add('recover-show');
      setTimeout(()=> burstConfetti(codeConfetti, 3200), 0);
    }

    async function copyText(text, btn){
      try {
        await navigator.clipboard.writeText(text);
        if (btn) {
          const old = btn.textContent;
          btn.textContent = 'Copied';
          btn.disabled = true;
          setTimeout(()=>{ btn.textContent = old; btn.disabled = false; }, 900);
        }
      } catch {
        // silent
      }
    }

    async function shareTextWithFallback(text, url){
      const payload = { title: 'Dream Stage', text, url };
      try{
        if (navigator.share) {
          await navigator.share(payload);
          return;
        }
      }catch{}
      const shareUrl = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + (url || ''));
      window.open(shareUrl, '_blank', 'noopener');
    }

    codeClose?.addEventListener('click', closeCodePopup);
    codeOk?.addEventListener('click', closeCodePopup);
    codeBackdrop?.addEventListener('click', (e)=>{ if(e.target===codeBackdrop) closeCodePopup(); });

    codeCopy?.addEventListener('click', ()=> {
      const codeLabel = (codeValue?.textContent || '').trim();
      copyText(codeLabel, codeCopy);
    });

    codeShare?.addEventListener('click', ()=> {
      const codeLabel = (codeValue?.textContent || '').trim();
      const txt = `I just claimed my Creator Code ${codeLabel} on Dream Stage.`;
      const url = 'https://dreamstage.tech';
      shareTextWithFallback(txt, url);
    });

    async function runPayment() {
      if (payStart) payStart.style.display = 'none';
      if (payErr) { payErr.style.display = 'none'; payErr.textContent = ''; }
      setLane('processing'); setStatus('Creating order…'); if (stayWarn) stayWarn.style.display = 'flex';

      try {
        const order = await createOrder();
        refinePlanChipWithOrder(order);

        setStatus('Awaiting payment…');
        const resp = await openCheckout(order);

        setStatus('Verifying payment…');
        const v = await verifyPayment(resp);

        setStatus('Assigning your creator code…');
        let a = null; try { a = await assignCreatorCode(); } catch {}

        if (STATE.inviteCode && !STATE.inviteClaimed) {
          setStatus('Finalizing your invite…');
          await claimInviteAfterPayment();
        }

        const amount    = v.amount ?? order.amount;
        const currency  = v.currency ?? order.currency ?? 'INR';
        const orderId   = order.orderId;
        const paymentId = resp.razorpay_payment_id;

        const serverCode = v.code || v.creatorCode || v.creatorCodeNumber || (a && (a.creatorCode || a.creatorCodeNumber));
        const labelCode  = codeToLabel(serverCode);

        if (invAmount)  invAmount.textContent  = (currency === 'INR' ? '₹' : currency + ' ') + (Number(amount) / 100).toFixed(2);
        if (invOrder)   invOrder.textContent   = orderId || '—';
        if (invPayment) invPayment.textContent = paymentId || '—';
        if (invCode)    invCode.textContent    = labelCode || '—';
        if (invPlan)    invPlan.textContent    = (payPlanName?.textContent || 'Yearly');
        if (invInvoice) invInvoice.textContent = `DS-${new Date().getFullYear()}-${(orderId || '').slice(-6).toUpperCase() || 'XXXXXX'}`;
        if (invDate)    invDate.textContent    = new Date().toLocaleString();

        try {
          sessionStorage.setItem('INVOICE_DATA', JSON.stringify({
            name: STATE.name,
            phone: STATE.phone,
            amount, currency, orderId, paymentId,
            creatorCode: labelCode,
            plan: invPlan ? invPlan.textContent : 'Yearly',
            ts: Date.now()
          }));
        } catch {}

        if (payInvoice) {
          const k = encodePhone(STATE.phone);
          const query = `?name=${encodeURIComponent(STATE.name || 'Dream Stage Member')}&k=${encodeURIComponent(k)}&amt=${encodeURIComponent(amount)}&cur=${encodeURIComponent(currency)}&oid=${encodeURIComponent(orderId)}&pid=${encodeURIComponent(paymentId)}&code=${encodeURIComponent(labelCode)}&plan=${encodeURIComponent(invPlan ? invPlan.textContent : 'Yearly')}&ts=${Date.now()}`;
          payInvoice.href = `invoice.html${query}`;
          payInvoice.style.display = 'inline-block';
        }

        setLane('success');
        if (receiptCard) receiptCard.style.display = 'block';
        if (payInvoice)  payInvoice.style.display  = 'inline-block';
        if (payContinue) payContinue.style.display = 'inline-block';
        setStatus('Payment successful ✓');
        if (stayWarn) stayWarn.style.display = 'none';
        if (msg) msg.textContent = 'Payment successful!';

        const finalCodeLabel = labelCode || codeToLabel(v.code);
        if (invCode && finalCodeLabel) invCode.textContent = finalCodeLabel;

        try {
          const tmp = JSON.parse(sessionStorage.getItem('INVOICE_DATA') || '{}');
          if (finalCodeLabel) tmp.creatorCode = finalCodeLabel;
          sessionStorage.setItem('INVOICE_DATA', JSON.stringify(tmp));
        } catch {}

        openCodePopup(finalCodeLabel);

      } catch (err) {
        setLane('failed');
        setStatus('Payment failed');
        if (payErr) {
          payErr.textContent = String(err?.message || 'Something went wrong.');
          payErr.style.display = 'block';
        }
        if (stayWarn) stayWarn.style.display = 'none';
        if (payRetry) { payRetry.style.display = 'inline-block'; }
        if (msg) msg.textContent = `Payment failed: ${err?.message || 'Something went wrong.'} You can retry.`;
      }
    }

    payStart?.addEventListener('click', runPayment);
    payRetry?.addEventListener('click', runPayment);

    payContinue?.addEventListener('click', () => {
      const k = encodePhone(STATE.phone);
      location.href = `complete.html?k=${encodeURIComponent(k)}`;
    });

    async function doPayLegacy() {
      if (payBtn.getAttribute('aria-disabled') === 'true') return;
      if (!STATE.phone) { if (msg) msg.textContent = 'Please add your phone number…'; return; }
      if (await tryAutoRedirectIfActive()) return;

      payBtn.textContent = 'Processing…';
      try {
        const order = await postJSON('/api/pay/order', { phone: STATE.phone });
        const resp  = await openCheckout(order);
        await verifyPayment(resp);
        try { await assignCreatorCode(); } catch {}
        if (STATE.inviteCode && !STATE.inviteClaimed) await claimInviteAfterPayment();
        const k = encodePhone(STATE.phone);
        await new Promise(r => setTimeout(r, 250));
        location.href = `congrats.html?k=${encodeURIComponent(k)}`;
      } catch (err) {
        if (msg) msg.textContent = `Payment failed: ${err?.message || 'Something went wrong.'} You can retry.`;
        payBtn.textContent = 'Retry Payment';
      }
    }
  })();
})();
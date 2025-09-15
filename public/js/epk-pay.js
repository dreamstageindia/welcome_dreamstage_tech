/* ---------- public/js/epk-pay.js (creator code based on PAID count, not joinOrder) ---------- */
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
  function setDisabled(el, on){ if(!el) return; setAttr(el, 'aria-disabled', on ? 'true' : 'false'); }
  function isDisabled(el){ return !el || el.getAttribute('aria-disabled') === 'true'; }

  /* ---------- Bring forward local game/session + pending invite ---------- */
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

  /* ---------- S1 pop ---------- */
  (function(){ var btn = byId('why1'); if(!btn) return;
    var wrap = btn.parentElement;
    function toggle(e){ e && e.preventDefault(); var open=!wrap.classList.contains('open'); wrap.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', toggle, {passive:false});
    btn.addEventListener('touchend', toggle, {passive:false});
    document.addEventListener('click', function(e){ if(!wrap.contains(e.target)){ wrap.classList.remove('open'); btn.setAttribute('aria-expanded','false'); } }, { passive:true });
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
      if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleChecked(); }
    });
    chk.addEventListener('change', function(){
      updateUI();
      persist(chk.checked);
    });

    STATE._pledgeUpdateUI = updateUI;
  })();

  /* ---------- S2 pop ---------- */
  (function(){
    var btn = byId('why2'); if(!btn) return;
    var wrap = btn.parentElement;
    function toggle(e){ e && e.preventDefault(); var open=!wrap.classList.contains('open'); wrap.classList.toggle('open',open); btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', toggle, {passive:false});
    btn.addEventListener('touchend', toggle, {passive:false});
    document.addEventListener('click', function(e){
      if(!wrap.contains(e.target)){ wrap.classList.remove('open'); btn.setAttribute('aria-expanded','false'); }
    }, { passive:true });
  })();

  /* ---------- S4 pop cards ---------- */
  (function(){
    document.querySelectorAll('#s4 .details .btn').forEach(function(btn){
      var wrap = btn.parentElement;
      btn.addEventListener('click', function(e){
        e.preventDefault();
        var open = !wrap.classList.contains('open');
        document.querySelectorAll('#s4 .details.open').forEach(function(w){ if(w!==wrap) w.classList.remove('open'); });
        wrap.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
    });
    document.addEventListener('click', function(e){
      var opened = document.querySelector('#s4 .details.open');
      if(opened && !opened.contains(e.target)) opened.classList.remove('open');
    }, { passive:true });
  })();

  /* ---------- Helpers for code preview + counts ---------- */
  const ccBig = byId('ccBig');
  const ccTier = byId('ccTier');
  const ccPctLabel = document.querySelector('#s5 .prog .label');
  const ccBar = byId('ccBar');
  const ccTiny = document.querySelector('#s5 .tiny');

  function padCode(n){ return '#'+String(Math.max(0,Math.floor(n||0))).padStart(4,'0'); }

  // NEW: 4-bucket membership titles
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

  // NEW: Top-percent label + 100−X% fill
  function setScaleNow(predictedRank){
    if (!ccPctLabel) return;
    const rank = Math.max(1, Math.min(predictedRank || 1, TOTAL_USERS));
    const topPercent = Math.max(1, Math.ceil((rank / TOTAL_USERS) * 100));  // 7/10000 → 1%
    const fillPct = Math.max(0, 100 - topPercent);                           // bar fill → 99%

    // Replace the label text to “You’re in the top X%”
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
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        for (const k of keys){
          const n = Number(j?.[k]);
          if (Number.isFinite(n)) return Math.max(0, n);
        }
      }catch{}
    }
    return Number(localStorage.getItem('CREATOR_COUNT_HINT') || 0);
  }

  /* ---------- S5: PREVIEW creator code strictly from PAID count ---------- */
  async function initS5PreviewAndCounts(){
    // change caption: preview, not assigned yet
    const ccLabel = document.querySelector('#s5 .cc-label');
    if (ccLabel) ccLabel.textContent = 'This is what your creator code would look like';

    const paidCount = await fetchCreatorPaidCount();
    localStorage.setItem('CREATOR_COUNT_HINT', String(paidCount));

    // predicted code = paidCount + 1
    const predicted = Math.max(1, Math.min(paidCount + 1, TOTAL_USERS));

    // show predicted code & dependent UI
    if (ccBig) ccBig.textContent = padCode(predicted);
    setTierByCode(predicted);
    updateDealPriceByCode(predicted);

    // Top-percent bar
    setScaleNow(predicted);

    // “already joined” ticker remains
    if (ccTiny) {
      ccTiny.innerHTML = `Already <strong><span id="boughtCount">0</span></strong> creators have joined.`;
      animateCount(byId('boughtCount'), paidCount, 900);
    }
  }

  // Trigger S5 animations on view
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

  /* ---------- Session & Journey helpers (no joinOrder used here) ---------- */
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
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ sessionId })
      });
      if (r.ok){
        const j = await r.json();
        if (j?.playerId) STATE.playerId = j.playerId;
      }
    }catch{}
  }

  async function loadJourney(){
    if(!STATE.playerId) return;
    try{
      const r = await fetch(`/api/journey/${STATE.playerId}`);
      if(!r.ok) return;
      const doc = await r.json();
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

  /* ---------- Recovery (find my account by phone) ---------- */
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
      const res = await fetch(`/api/player/by-phone?phone=${encodeURIComponent(e164)}`);
      if(!res.ok){ rErr.textContent='We couldn’t find an account with that number.'; rErr.style.display='block'; return; }
      const p = await res.json();

      const playerId = p._id || p.playerId || '';
      if (playerId) {
        STATE.playerId = playerId;
        localStorage.setItem('QF_PLAYER_ID', playerId);
      }
      STATE.phone = p.phone?.number || e164;

      if (!p.name && playerId){
        try{
          const jr = await fetch(`/api/journey/${playerId}`);
          if (jr.ok){
            const jd = await jr.json();
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

  /* ---------- S7: Confirmation, Edit, Payment ---------- */
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

 /* ---------- Edit Details (now with country select + national number) ---------- */
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

  // fill country dropdown (same list as recovery)
  if (ccSel) fillCountrySelect(ccSel);

  // split a +E164 into { cc, nn } best-effort by matching known country codes
  function splitE164(e164){
    const d = digits(e164);
    if (!d) return { cc: (ccSel && ccSel.value) || '91', nn: '' };
    // longest prefix wins
    const codes = [...COUNTRY_CODES].sort((a,b)=> b.dial.length - a.dial.length);
    for (const c of codes){
      if (d.startsWith(c.dial)) return { cc: c.dial, nn: d.slice(c.dial.length) };
    }
    return { cc: (ccSel && ccSel.value) || '91', nn: d };
  }

  function open(){
    errBox.style.display='none'; errBox.textContent='';
    nameInp.value = STATE.name || '';

    // prefill country + national number from stored E164
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

    if(!name){
      errBox.textContent='Please enter your name.'; errBox.style.display='block'; return;
    }
    if(!validNational(dial, nat)){
      errBox.textContent='That number looks invalid for the selected country.'; errBox.style.display='block'; return;
    }
    if(!STATE.playerId){
      errBox.textContent='We couldn’t find your session. Please refresh.'; errBox.style.display='block'; return;
    }

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

      // mirror to state + local
      STATE.name = name;
      STATE.phone = e164;
      try{
        const gs = JSON.parse(localStorage.getItem('QF_STATE') || '{}');
        gs.name = STATE.name; gs.phoneE164 = STATE.phone;
        localStorage.setItem('QF_STATE', JSON.stringify(gs));
      }catch{}

      if(typeof STATE._updateDetailsUI === 'function') STATE._updateDetailsUI();
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


  (function(){
    const payBtn = byId('payBtn');
    const msg    = byId('payMsg');
    if(!payBtn) return;

    async function createOrder(){
      const r = await fetch('/api/pay/order', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ phone: STATE.phone })
      });
      if(!r.ok){
        const j = await r.json().catch(()=>({}));
        throw new Error(j && j.error ? j.error : 'Failed to create order');
      }
      return await r.json();
    }

    function openCheckout(order){
      return new Promise((resolve,reject)=>{
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
          modal: { ondismiss: function(){ reject(new Error('Payment window closed')); } },
          handler: function (resp) { resolve(resp); }
        };
        const rz = new Razorpay(options);
        rz.on('payment.failed', function(resp){
          reject(new Error(resp?.error?.description || 'Payment failed'));
        });
        rz.open();
      });
    }

    async function verifyPayment(payload){
      const r = await fetch('/api/pay/verify', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          phone: STATE.phone,
          razorpay_payment_id: payload.razorpay_payment_id,
          razorpay_order_id: payload.razorpay_order_id,
          razorpay_signature: payload.razorpay_signature
        })
      });
      if(!r.ok){
        const j = await r.json().catch(()=>({}));
        throw new Error(j && j.error ? j.error : 'Verification failed');
      }
      return await r.json();
    }

    async function claimInviteAfterPayment(){
      if (!STATE.inviteCode || STATE.inviteClaimed) return true;
      try{
        const r = await fetch('/api/invites/claim', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ code: STATE.inviteCode, playerId: STATE.playerId })
        });
        if (!r.ok) return false;
        const j = await r.json().catch(()=>({}));
        if (j && j.ok) {
          STATE.inviteClaimed = true;
          localStorage.setItem('INVITE_CLAIMED','1');
          return true;
        }
      }catch{}
      return false;
    }

    async function doPay(){
      if(isDisabled(payBtn)) return;

      if(!STATE.phone){
        msg.textContent = 'Please add your phone number under "Your Details" before paying.';
        payBtn.classList.add('shake'); setTimeout(()=>payBtn.classList.remove('shake'), 400);
        return;
      }

      setDisabled(payBtn, true);
      const original = payBtn.textContent;
      payBtn.textContent = 'Processing...';
      msg.textContent = 'Opening secure checkout…';

      try{
        const order = await createOrder();
        const resp  = await openCheckout(order);
        msg.textContent = 'Verifying payment…';
        await verifyPayment(resp);

        if (STATE.inviteCode && !STATE.inviteClaimed) {
          msg.textContent = 'Finalizing your invite…';
          await claimInviteAfterPayment();
        }

        const k = encodePhone(STATE.phone);
        await sleep(250);
        location.href = `congrats.html?k=${encodeURIComponent(k)}`;
      }catch(err){
        msg.textContent = `Payment failed: ${err?.message || 'Something went wrong.'} You can retry.`;
        payBtn.textContent = 'Retry Payment';
        setDisabled(payBtn, false);
      }
    }

    payBtn.addEventListener('click', doPay);
  })();

  /* ---------- Perks pop ---------- */
  (function () {
    var btn = byId('perksBtn'); if (!btn) return;
    var wrap = btn.parentElement;
    function toggle(e) { e && e.preventDefault(); var open = !wrap.classList.contains('open'); wrap.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', toggle, { passive: false });
    btn.addEventListener('touchend', toggle, { passive: false });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } }, { passive: true });
  })();
})();

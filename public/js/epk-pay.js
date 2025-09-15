
    /* ---------- Shared helpers + state ---------- */
    (function(){
      const STATE = {
        sessionId: null,
        playerId: null,
        joinOrder: 0,
        steps: {},
        name: '',
        phone: '',
        _currentPrice: 199
      };
    
      const TOTAL_STEPS = 7; // include confirmation step
    
      const $ = (sel) => document.querySelector(sel);
      const byId = (id) => document.getElementById(id);
      const digits = (s) => String(s||'').replace(/\D+/g,'');
      const encodePhone = (p) => { try { return btoa(digits(p)); } catch { return digits(p); } };
      const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
    
      function setAttr(el, name, val){ if(el) el.setAttribute(name, val); }
      function setDisabled(el, on){ if(!el) return; setAttr(el, 'aria-disabled', on ? 'true' : 'false'); }
      function isDisabled(el){ return !el || el.getAttribute('aria-disabled') === 'true'; }
    
      /* ---------- Progress tube (1–7) ---------- */
      (function(){
        const nav = byId('stepNav');
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
    
      /* ---------- S1 “Why Dream Stage?” pop ---------- */
      (function(){ var btn = byId('why1'); if(!btn) return;
        var wrap = btn.parentElement;
        function toggle(e){ e && e.preventDefault(); var open=!wrap.classList.contains('open'); wrap.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); }
        btn.addEventListener('click', toggle, {passive:false});
        btn.addEventListener('touchend', toggle, {passive:false});
        document.addEventListener('click', function(e){ if(!wrap.contains(e.target)){ wrap.classList.remove('open'); btn.setAttribute('aria-expanded','false'); } }, { passive:true });
      })();
    
      /* ---------- Pledge (persist + gate) ---------- */
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
    
        // expose for init
        STATE._pledgeUpdateUI = updateUI;
      })();
    
      /* ---------- S2 “Why this?” pop – touch friendly ---------- */
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
    
      /* ---------- S4 details toggles ---------- */
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
    
      /* ---------- S5 Creator Code + Recovery & Pricing + doc load ---------- */
      (function(){
        const TOTAL_USERS = 10000;
        const ccBig = byId('ccBig');
        const tier  = byId('ccTier');
        const pctEl = byId('ccPct');
        const bar   = byId('ccBar');
        const canvas= byId('confetti');
        const ctx   = canvas.getContext('2d');
    
        /* Deal price elements */
        const dealYearEl = byId('dealYear');
        const dealMonthlyEl = byId('dealMonthly');
    
        function resizeCanvas(){
          const box = canvas.parentElement.getBoundingClientRect();
          canvas.width = Math.max(1, Math.floor(box.width));
          canvas.height = Math.max(1, Math.floor(box.height));
        }
        resizeCanvas(); addEventListener('resize', resizeCanvas, {passive:true});
    
        function fireConfetti(ms=1000, count=160){
          const parts = Array.from({length:count}).map(()=>({
            x: Math.random()*canvas.width, y: -10 - Math.random()*40,
            w: 7, h: 7, vx: -1 + Math.random()*2, vy: 1 + Math.random()*2, a: Math.random()*Math.PI*2
          }));
          const colors = ['#d946ef','#f0abfc','#c026d3','#a21caf']; const t0 = performance.now();
          (function frame(t){
            const d = t - t0; ctx.clearRect(0,0,canvas.width,canvas.height);
            parts.forEach((p,i)=>{ p.x+=p.vx; p.y+=p.vy+1.35; p.a+=0.12;
              ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.a);
              ctx.fillStyle = colors[i%colors.length]; ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); ctx.restore();
            });
            if(d<ms) requestAnimationFrame(frame);
          })(t0);
        }
    
        function pad(rank){ return '#'+String(Math.max(0,Math.floor(rank||0))).padStart(4,'0'); }
        function setTier(rank){
          if(rank && rank<=100){ tier.textContent='Founding Member'; tier.style.display='inline-block'; }
          else tier.style.display='none';
        }
        function setPercentile(rank){
          let pct = 0;
          if(typeof rank==='number' && rank>0){ pct = Math.max(0, Math.min(1, (TOTAL_USERS - rank) / TOTAL_USERS)); }
          pctEl.textContent = Math.round(pct*100);
          bar.style.width = (pct*100)+'%';
        }
        function setDeal(rank){
          let price = 199;
          if (rank > 0 && rank <= 100) price = 49;
          else if (rank > 100 && rank <= 3000) price = 99;
          if (dealYearEl) dealYearEl.textContent = String(price);
          if (dealMonthlyEl) dealMonthlyEl.textContent = (price / 12).toFixed(2);
          STATE._currentPrice = price;
          updatePlanSummary();
        }
    
        function updatePlanSummary(){
          const p1 = byId('planLine1');
          const p2 = byId('planLine2');
          const pt = byId('planTotal');
          const price = STATE._currentPrice || 199;
          if(p1){ p1.textContent = price === 49 ? 'Yearly 49/- (Best Value)' : `Yearly ${price}/-`; }
          if(p2){
            if(STATE.joinOrder > 0 && STATE.joinOrder <= 100){
              p2.textContent = 'Creator Code < 100; 75% off';
            }else if(STATE.joinOrder > 100 && STATE.joinOrder <= 3000){
              p2.textContent = 'Creator Code ≤ 3000; Early pricing';
            }else{
              p2.textContent = 'Standard yearly price';
            }
          }
          if(pt){ pt.textContent = `${price}/-`; }
        }
    
        function q(k){ return new URLSearchParams(location.search).get(k) || ''; }
        const SESSION_KEY = 'QF_SESSION_ID';
        function ensureSessionId(){
          let sid = q('sessionId') ||
                    localStorage.getItem('sessionId') ||
                    localStorage.getItem('SESSION_ID') ||
                    localStorage.getItem('MM_SESSION_ID') ||
                    localStorage.getItem(SESSION_KEY);
          if(!sid){ sid = 'ds_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
          localStorage.setItem(SESSION_KEY, sid);
          STATE.sessionId = sid;
          return sid;
        }
    
        async function fetchRankFromSession(){
          const sessionId = ensureSessionId();
          const r = await fetch('/api/player/session', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ sessionId })
          }).catch(()=>null);
    
          let rank = 0, playerId = '';
          if(r && r.ok){
            const j = await r.json();
            rank = Number(j.joinOrder||0);
            playerId = j.playerId || '';
          }
          if((!rank || rank<=0) && playerId){
            try{
              const r2 = await fetch(`/api/community/me/${playerId}`);
              if(r2.ok){ const j2 = await r2.json(); rank = Number(j2.joinOrder||0); }
            }catch{}
          }
          STATE.playerId = playerId || STATE.playerId;
          return rank;
        }
    
        // Recovery modal wiring
        const rBackdrop = byId('recoverBackdrop');
        const rModal    = byId('recoverModal');
        const rClose    = byId('recoverClose');
        const rCancel   = byId('recoverCancel');
        const rSubmit   = byId('recoverSubmit');
        const rCountry  = byId('recoverCountry');
        const rPhone    = byId('recoverPhone');
        const rErr      = byId('recoverErr');
    
        const COUNTRY_CODES = [
          { code:'IN', dial:'91',  name:'India (+91)',                pattern:/^[6-9]\d{9}$/ },
          { code:'US', dial:'1',   name:'United States (+1)',         pattern:/^\d{10}$/ },
          { code:'GB', dial:'44',  name:'United Kingdom (+44)',       pattern:/^\d{10}$/ },
          { code:'AE', dial:'971', name:'United Arab Emirates (+971)',pattern:/^\d{7,9}$/ },
          { code:'SG', dial:'65',  name:'Singapore (+65)',            pattern:/^\d{8}$/ },
          { code:'AU', dial:'61',  name:'Australia (+61)',            pattern:/^\d{9}$/ }
        ];
        function fillCountrySelect(sel){
          sel.innerHTML = '';
          COUNTRY_CODES.forEach(c=>{ const o=document.createElement('option'); o.value=c.dial; o.textContent=c.name; sel.appendChild(o); });
          sel.value='91';
        }
        fillCountrySelect(rCountry);
    
        function toE164(dial, national){
          const cc=digits(dial), nn=digits(national); const total=cc+nn;
          if (total.length<5 || total.length>15) return null; return '+'+total;
        }
        function validNational(dial, national){
          const c=COUNTRY_CODES.find(x=>x.dial===String(dial)); if (!c||!c.pattern) return digits(national).length>=6;
          return c.pattern.test(digits(national));
        }
    
        function openRecover(){ rBackdrop.classList.add('recover-show'); rModal.classList.add('recover-show'); rErr.style.display='none'; rErr.textContent=''; }
        function closeRecover(){ rBackdrop.classList.remove('recover-show'); rModal.classList.remove('recover-show'); }
    
        rClose.addEventListener('click', closeRecover);
        rCancel.addEventListener('click', closeRecover);
        rBackdrop.addEventListener('click', (e)=>{ if(e.target===rBackdrop) closeRecover(); });
    
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
    
            localStorage.setItem('RECOVERED_PLAYER_ID', p._id);
            localStorage.setItem('RECOVERED_PHONE', p.phone?.number || e164);
            localStorage.setItem('CREATOR_CODE', String(p.joinOrder || 0));
    
            const sessionId = STATE.sessionId || ensureSessionId();
            try{
              await fetch(`/api/player/${encodeURIComponent(sessionId)}`, {
                method:'PATCH', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ phone: p.phone?.number || e164 })
              }).then(async r=>{
                if(!r.ok){
                  const j = await r.json().catch(()=>({}));
                  if (j && j.error === 'PHONE_EXISTS') { return; }
                }
              });
            }catch{}
    
            applyRank(p.joinOrder||0, true);
            closeRecover();
          }catch{
            rErr.textContent='Something went wrong. Please try again.'; rErr.style.display='block';
          }
        }
        rSubmit.addEventListener('click', tryRecover);
        rPhone.addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryRecover(); });
    
        function applyRank(rank, confetti=false){
          ccBig.textContent = pad(rank||0);
          STATE.joinOrder = rank||0;
          setTier(STATE.joinOrder); setPercentile(STATE.joinOrder); setDeal(STATE.joinOrder);
          document.body.classList.toggle('rank-seen', !!STATE.joinOrder);
          if(confetti && STATE.joinOrder>0 && !sessionStorage.getItem('CONFETTI_ONCE')){
            sessionStorage.setItem('CONFETTI_ONCE','1'); fireConfetti();
          }
        }
    
        function loadStepsFromCache(){
          try{
            const cached = JSON.parse(localStorage.getItem('STEPS')||'{}');
            if (cached && typeof cached === 'object'){ STATE.steps = cached; }
          }catch{}
        }
    
        async function loadFullDoc(){
          if(!STATE.playerId) return;
          try{
            const r = await fetch(`/api/journey/${STATE.playerId}`);
            if(!r.ok) return;
            const doc = await r.json();
            STATE.steps = doc.steps || STATE.steps || {};
            STATE.name = doc.name || '';
            STATE.phone = doc.phone?.number || '';
            try{ localStorage.setItem('STEPS', JSON.stringify(STATE.steps)); }catch{}
            // Reflect pledge persistence
            const chk = byId('pledgeChk');
            if(chk){
              chk.checked = !!STATE.steps.commitmentAgreed;
              if (typeof STATE._pledgeUpdateUI === 'function') STATE._pledgeUpdateUI();
            }
            // Fill confirmation details
            updateDetailsUI();
          }catch{}
        }
    
        function updateDetailsUI(){
          const dn = byId('detName'); if(dn) dn.textContent = STATE.name || '—';
          const dp = byId('detPhone'); if(dp) dp.textContent = STATE.phone || '—';
          syncPayButtonState(); // depends on phone presence
        }
        STATE._updateDetailsUI = updateDetailsUI;
    
        async function init(){
          // prefill from cache steps for instant UI
          loadStepsFromCache();
          if (STATE.steps && STATE.steps.commitmentAgreed && typeof STATE._pledgeUpdateUI === 'function') {
            const chk = byId('pledgeChk'); if(chk) chk.checked = true;
            STATE._pledgeUpdateUI();
          }
    
          const pid = new URLSearchParams(location.search).get('playerId') || localStorage.getItem('RECOVERED_PLAYER_ID') || '';
          if (pid) STATE.playerId = pid;
    
          let rank = 0;
          if (pid){
            try{ const r = await fetch(`/api/community/me/${pid}`); if(r.ok){ const j = await r.json(); rank = Number(j.joinOrder||0); } }catch{}
          }
          if(!(rank > 0)) {
            rank = await fetchRankFromSession().catch(()=>0);
          }
          if(!(rank > 0)) {
            const cached = Number(localStorage.getItem('CREATOR_CODE') || 0);
            if (cached > 0) rank = cached;
          } else {
            localStorage.setItem('CREATOR_CODE', String(rank));
          }
          applyRank(rank || 0, false);
    
          // Ensure we have a current doc & playerId
          if (!STATE.playerId) {
            const sessionId = STATE.sessionId || ensureSessionId();
            try {
              const rr = await fetch('/api/player/session', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ sessionId })
              });
              if (rr.ok) {
                const jj = await rr.json();
                STATE.playerId = jj.playerId || STATE.playerId;
              }
            } catch {}
          }
    
          await loadFullDoc();
    
          // hydrate confirmation checkbox
          const confirmCb = byId('confirmSub');
          if (confirmCb) {
            confirmCb.checked = !!(STATE.steps && STATE.steps.subscriptionConfirmed);
            syncPayButtonState();
          }
    
          // If no code visible try recover
          setTimeout(function () {
            const current = (ccBig.textContent || '').trim();
            if (!/#[0-9]{4}/.test(current) || current === '#0000') {
              const opened = document.querySelector('.recover-modal.recover-show');
              if (!opened) { /* optional: openRecover(); */ }
            }
          }, 800);
        }
        init();
      })();
    
      /* ---------- S6: Confirm & Pay button reveals S7 ---------- */
      (function(){
        const goConfirm = byId('goConfirm');
        if(!goConfirm) return;
        goConfirm.addEventListener('click', ()=>{
          if (isDisabled(goConfirm)) return;
          location.hash = '#s7';
        });
      })();
    
      /* ---------- S7: Confirmation, Edit modal & Payment ---------- */
    
      // Keep Pay button enabled only when subscription confirmed & phone present
      function syncPayButtonState(){
        const cb = byId('confirmSub');
        const btn = byId('payBtn');
        const on = !!(cb && cb.checked) && !!STATE.phone;
        setDisabled(btn, !on);
      }
    
      // Persist subscription confirmed
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
    
      // Edit Details modal
      (function(){
        const openBtn = byId('editDetailsBtn');
        const backdrop = byId('editBackdrop');
        const modal = byId('editModal');
        const closeBtn = byId('editClose');
        const cancelBtn= byId('editCancel');
        const saveBtn  = byId('editSave');
        const nameInp  = byId('editName');
        const phoneInp = byId('editPhone');
        const errBox   = byId('editErr');
    
        if(!openBtn) return;
    
        function open(){
          errBox.style.display='none'; errBox.textContent='';
          nameInp.value = STATE.name || '';
          phoneInp.value = STATE.phone ? digits(STATE.phone) : '';
          backdrop.classList.add('recover-show');
          modal.classList.add('recover-show');
        }
        function close(){
          backdrop.classList.remove('recover-show');
          modal.classList.remove('recover-show');
        }
    
        function formatE164DefaultIndia(s){
          const d = digits(s);
          if(!d) return '';
          if (d.length === 10) return '+91'+d;
          if (d.length === 12 && d.startsWith('91')) return '+'+d;
          if (STATE.phone && STATE.phone.startsWith('+')) return '+'+d;
          return '+'+d; // best-effort
        }
    
        async function save(){
          errBox.style.display='none'; errBox.textContent='';
          const name = (nameInp.value||'').trim();
          const e164 = formatE164DefaultIndia(phoneInp.value);
          if(!name){ errBox.textContent='Please enter your name.'; errBox.style.display='block'; return; }
          if(!e164){ errBox.textContent='Please enter a valid phone number.'; errBox.style.display='block'; return; }
          if(!STATE.playerId){ errBox.textContent='We couldn’t find your session. Please refresh.'; errBox.style.display='block'; return; }
    
          setDisabled(saveBtn, true); saveBtn.textContent='Saving...';
          try{
            const r = await fetch(`/api/journey/${encodeURIComponent(STATE.playerId)}`, {
              method:'PATCH', headers:{'Content-Type':'application/json'},
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
            if(typeof STATE._updateDetailsUI === 'function') STATE._updateDetailsUI();
            close();
          }catch{
            errBox.textContent='Something went wrong. Please try again.';
            errBox.style.display='block';
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
    
      // Payment flow
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
              handler: function (resp) {
                resolve(resp);
              }
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
    
            // Success — redirect with phone encoded in query
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
    
      /* ---------- Perks pop toggle ---------- */
      (function () {
        var btn = byId('perksBtn'); if (!btn) return;
        var wrap = btn.parentElement;
        function toggle(e) { e && e.preventDefault(); var open = !wrap.classList.contains('open'); wrap.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); }
        btn.addEventListener('click', toggle, { passive: false });
        btn.addEventListener('touchend', toggle, { passive: false });
        document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } }, { passive: true });
      })();
    
    })(); // end master IIFE
    
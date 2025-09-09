// public/js/QuestionFlow.js

var QuestionFlow = (function () {
  var instance;

  function QuestionFlow() {
    // -------------- DOM refs --------------
    var overlay, box, titleEl, typeEl, bodyEl, actionsEl, closeBtn, logoEl;
    var inputEl, suggestBox, devOtpHint; // reused nodes

    // -------------- Local cache keys --------------
    var stateKey   = 'QF_STATE';
    var sessionKey = 'QF_SESSION_ID';
    var playerKey  = 'QF_PLAYER_ID';
    var apiBase    = ''; // same origin

    // lazy MilestoneScreen accessor
    function getMilestone() {
      try {
        return (window.MilestoneScreen && window.MilestoneScreen.getInstance) ? window.MilestoneScreen.getInstance() : null;
      } catch (e) {
        return null;
      }
    }

    // ---- Resumable local state (UI-focused flags) ----
    function readState() {
      try { return JSON.parse(localStorage.getItem(stateKey) || '{}'); }
      catch { return {}; }
    }
    function writeState(patch) {
      var s = readState();
      Object.assign(s, patch || {});
      localStorage.setItem(stateKey, JSON.stringify(s));
      return s;
    }
    function getSessionId() {
      return localStorage.getItem(sessionKey) || null;
    }
    function setSessionId(id) {
      localStorage.setItem(sessionKey, id);
    }
    function getPlayerId() {
      return localStorage.getItem(playerKey) || null;
    }
    function setPlayerId(id) {
      localStorage.setItem(playerKey, id);
    }
    function uid() {
      return 'sess_' + Math.random().toString(36).slice(2) + Date.now();
    }

    // -------------- Backend helpers --------------
    function ensureSession() {
      return new Promise(function(resolve, reject){
        var sid = getSessionId();
        if (sid) {
          // Refresh/ensure session & hydrate playerId
          fetch(apiBase + '/api/player/session', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ sessionId: sid })
          }).then(function(r){
            if (!r.ok) throw new Error('player/session failed');
            return r.json();
          }).then(function(j){
            if (j && j.playerId) setPlayerId(j.playerId);
            resolve(sid);
          }).catch(function(){
            makeNewSession().then(resolve, reject);
          });
        } else {
          makeNewSession().then(resolve, reject);
        }
      });
    }
    function makeNewSession() {
      var newSid = uid();
      return fetch(apiBase + '/api/player/session', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ sessionId: newSid })
      }).then(function(r){
        if (!r.ok) throw new Error('start session failed');
        return r.json();
      }).then(function(j){
        setSessionId(newSid);
        if (j && j.playerId) setPlayerId(j.playerId);
        return newSid;
      });
    }

    // Generic player PATCH (compat). DO NOT use this for consent or phone.
    function savePatch(patch) {
      return ensureSession().then(function(sid) {
        return fetch(apiBase + '/api/player/' + encodeURIComponent(sid), {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(patch)
        }).then(function(res){
          if (!res.ok) throw new Error('save failed ' + res.status);
          return res.json();
        });
      });
    }

    // Dedicated consent patch (avoids cast errors by using journey API)
    function saveConsent(agree) {
      var pid = getPlayerId();
      if (!pid) {
        // if we somehow do not have playerId yet, ensure session -> fetch doc -> try again
        return ensureSession().then(fetchServerDoc).then(function(doc){
          if (doc && doc._id) setPlayerId(doc._id);
          var pid2 = getPlayerId();
          if (!pid2) throw new Error('no playerId for consent');
          return fetch(apiBase + '/api/journey/' + encodeURIComponent(pid2), {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ consentAgreed: !!agree })
          }).then(function(r){ if (!r.ok) throw new Error('consent save failed'); return r.json(); });
        });
      }
      return fetch(apiBase + '/api/journey/' + encodeURIComponent(pid), {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ consentAgreed: !!agree })
      }).then(function(r){ if (!r.ok) throw new Error('consent save failed'); return r.json(); });
    }

    function sendOtp(e164) {
      return ensureSession().then(function(sid) {
        return fetch(apiBase + '/api/otp/send', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ sessionId: sid, phone: e164 })
        }).then(async function(res){
          if (!res.ok) {
            // translate duplicate phone into a friendly error
            if (res.status === 409) {
              let j = {};
              try { j = await res.json(); } catch(e){}
              const err = new Error(j && j.message || 'Phone number already exists');
              err.code = 'PHONE_EXISTS';
              throw err;
            }
            throw new Error('otp send failed ' + res.status);
          }
          return res.json();
        });
      });
    }

    function verifyOtp(code) {
      return ensureSession().then(function(sid) {
        return fetch(apiBase + '/api/otp/verify', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ sessionId: sid, otp: code })
        }).then(function(res){
          if (!res.ok) throw new Error('otp verify failed ' + res.status);
          return res.json();
        });
      });
    }

    function fetchServerDoc() {
      var pid = getPlayerId();
      function getById(id) {
        return fetch(apiBase + '/api/journey/' + encodeURIComponent(id))
          .then(function(r){ if (!r.ok) throw new Error('journey get failed'); return r.json(); });
      }
      if (pid) return getById(pid);

      // hydrate playerId via /api/player/session then journey
      return ensureSession().then(function(){
        var pid2 = getPlayerId();
        if (!pid2) throw new Error('no playerId after session');
        return getById(pid2);
      });
    }

    // Merge server "truth" into our local UI state so we can resume precisely
    function mergeServerIntoLocal(doc) {
      if (!doc || typeof doc !== 'object') return;

      var s = readState();

      if (doc.name && !s.name) s.name = doc.name;
      if (doc.role && !s.role) s.role = doc.role;

      // map progress flags from server steps -> local boolean gates
      var steps = doc.steps || {};
      if (steps.name) s.nameDone = true;
      if (steps.role) s.roleDone = true;
      if (steps.postLevel2Q) s.q3Done = true;
      if (steps.location) s.q4Done = true; // artist path match
      if (steps.phoneVerified) s.phoneVerified = true;
      if (doc.phone && doc.phone.verified) s.phoneVerified = true;

      writeState(s);
    }

    function maybeAutoRedirect(doc) {
      if (!doc) return;
      var verified = (doc.phone && doc.phone.verified) || (doc.steps && doc.steps.phoneVerified);
      if (verified) {
        var rank = typeof doc.joinOrder === 'number' ? doc.joinOrder : null;
        var qs = rank ? ('?rank=' + encodeURIComponent(rank)) : '';
        window.location.href = '/community.html' + qs;
        return true;
      }
      return false;
    }

    // -------------- Overlay UI --------------
    function createOverlay() {
      overlay = document.createElement('div');
      overlay.className = 'qf-overlay hidden';

      box = document.createElement('div');
      box.className = 'qf-box';

      closeBtn = document.createElement('button');
      closeBtn.className = 'qf-close';
      closeBtn.textContent = '×';
      closeBtn.disabled = true;

      logoEl = document.createElement('img');
      logoEl.alt = 'Dream Stage';
      logoEl.src = 'images/logo.png';
      logoEl.style.width = '120px';
      logoEl.style.height = 'auto';
      logoEl.style.margin = '6px auto 6px';
      logoEl.style.display = 'none';

      titleEl = document.createElement('div');
      titleEl.className = 'qf-title';

      typeEl = document.createElement('div');
      typeEl.className = 'qf-type';

      bodyEl = document.createElement('div');
      bodyEl.className = 'qf-body';

      actionsEl = document.createElement('div');
      actionsEl.className = 'qf-actions';

      box.appendChild(closeBtn);
      box.appendChild(logoEl);
      box.appendChild(titleEl);
      box.appendChild(typeEl);
      box.appendChild(bodyEl);
      box.appendChild(actionsEl);

      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    function open() { overlay.classList.remove('hidden'); }
    function close() { overlay.classList.add('hidden'); }
    function clearBody() { bodyEl.innerHTML = ''; actionsEl.innerHTML = ''; typeEl.textContent=''; }

    function typeLine(str, target, speed) {
      return new Promise(function(resolve){
        target.textContent = '';
        var i = 0;
        (function step(){
          if (i < str.length) {
            target.textContent += str.charAt(i++);
            setTimeout(step, speed || 14);
          } else { resolve(); }
        })();
      });
    }

    function makeBtn(label, onClick) {
      var b = document.createElement('button');
      b.className = 'qf-btn';
      b.textContent = label;
      b.onclick = onClick;
      return b;
    }

    // -------------- Question primitives --------------
    function askText(title, question, placeholder, buttonLabel) {
      clearBody();
      titleEl.textContent = title;
      var label = document.createElement('label');
      label.className = 'qf-label';
      label.textContent = question;

      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'qf-input';
      inputEl.placeholder = placeholder || '';

      bodyEl.appendChild(label);
      bodyEl.appendChild(inputEl);

      var resolveWait;
      var next = makeBtn(buttonLabel || 'Next', function(){
        var val = (inputEl.value || '').trim();
        if (!val) { inputEl.focus(); return; }
        resolveWait(val);
      });
      actionsEl.appendChild(next);

      inputEl.focus();
      return new Promise(function(resolve){ resolveWait = resolve; });
    }

    function askOptions(title, question, options, buttonLabel) {
      clearBody();
      titleEl.textContent = title;
      typeLine(question, typeEl, 12);

      var grid = document.createElement('div');
      grid.className = 'qf-options';

      var selected = null;

      options.forEach(function(opt){
        var d = document.createElement('div');
        d.className = 'qf-option';
        d.tabIndex = 0;
        d.textContent = opt.label;
        d.setAttribute('data-value', opt.value);
        function select(){
          selected = opt.value;
          [].slice.call(grid.children).forEach(function(x){ x.classList.remove('selected'); });
          d.classList.add('selected');
        }
        d.onclick = select;
        d.onkeydown = function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } };
        grid.appendChild(d);
      });

      bodyEl.appendChild(grid);

      var resolveWait;
      var next = makeBtn(buttonLabel || 'Continue', function(){
        if (!selected) return;
        resolveWait(selected);
      });
      actionsEl.appendChild(next);

      return new Promise(function(resolve){ resolveWait = resolve; });
    }

    function askAutosuggest(title, question, placeholder) {
      clearBody();
      titleEl.textContent = title;

      var label = document.createElement('label');
      label.className = 'qf-label';
      label.textContent = question;

      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'qf-input';
      inputEl.placeholder = placeholder || 'Type your art form...';

      suggestBox = document.createElement('div');
      suggestBox.className = 'qf-suggest qf-hide';

      bodyEl.appendChild(label);
      bodyEl.appendChild(inputEl);
      bodyEl.appendChild(suggestBox);

      var entries = [];

      function renderSuggest(list) {
        suggestBox.innerHTML = '';
        if (!list.length) {
          suggestBox.classList.add('qf-hide');
          return;
        }
        suggestBox.classList.remove('qf-hide');
        list.slice(0, 12).forEach(function(item){
          var row = document.createElement('div');
          row.className = 'qf-s-item';
          var n = document.createElement('div');
          n.className = 'qf-s-name';
          n.textContent = item.name;
          var d = document.createElement('div');
          d.className = 'qf-s-desc';
          d.textContent = item.description || '';
          row.appendChild(n); row.appendChild(d);
          row.onclick = function(){
            inputEl.value = item.name;
            suggestBox.classList.add('qf-hide');
          };
          suggestBox.appendChild(row);
        });
      }

      fetch('/data/artist.json')
        .then(function(res){ return res.json(); })
        .then(function(data){ entries = Array.isArray(data) ? data : []; })
        .catch(function(){ entries = []; });

      inputEl.addEventListener('input', function(){
        var q = inputEl.value.toLowerCase().trim();
        if (!q) { renderSuggest([]); return; }
        var list = entries.filter(function(e){
          return (e.name || '').toLowerCase().includes(q) ||
                 (e.description || '').toLowerCase().includes(q);
        });
        renderSuggest(list);
      });

      var resolveWait;
      var next = makeBtn('Continue', function(){
        var val = (inputEl.value || '').trim();
        if (!val) { inputEl.focus(); return; }
        resolveWait(val);
      });
      actionsEl.appendChild(next);

      inputEl.focus();
      return new Promise(function(resolve){ resolveWait = resolve; });
    }

    function showMessage(title, message, buttonLabel) {
      clearBody();
      titleEl.textContent = title;
      typeEl.textContent = '';
      var done = false;

      typeLine(message, typeEl, 10).then(function(){ done = true; });

      var resolveWait;
      var next = makeBtn(buttonLabel || 'Continue', function(){
        if (!done) return;
        resolveWait(true);
      });
      actionsEl.appendChild(next);

      return new Promise(function(resolve){ resolveWait = resolve; });
    }

    function askConsent() {
      clearBody();
      titleEl.textContent = 'Consent';

      var msg = document.createElement('div');
      msg.className = 'qf-type';
      msg.innerHTML = 'Do you agree to be evaluated for platform onboarding? ' +
        '<br><a class="qf-link" href="/consent.html" target="_blank" rel="noopener">Read Terms & Conditions</a>';
      bodyEl.appendChild(msg);

      var resolveWait;
      var yes = makeBtn('Yes, I Agree', function(){ resolveWait(true); });
      var no  = makeBtn('No', function(){ resolveWait(false); });

      actionsEl.appendChild(no);
      actionsEl.appendChild(yes);

      return new Promise(function(resolve){ resolveWait = resolve; });
    }

    // -------------- Phone with country selector (E.164) --------------
    var COUNTRY_CODES = [
      { code: 'IN', dial: '91',  name: 'India (+91)' },
      { code: 'US', dial: '1',   name: 'United States (+1)' },
      { code: 'GB', dial: '44',  name: 'United Kingdom (+44)' },
      { code: 'AE', dial: '971', name: 'United Arab Emirates (+971)' },
      { code: 'SG', dial: '65',  name: 'Singapore (+65)' },
      { code: 'AU', dial: '61',  name: 'Australia (+61)' },
      { code: 'DE', dial: '49',  name: 'Germany (+49)' },
      { code: 'FR', dial: '33',  name: 'France (+33)' }
    ];

    function normalizeDigits(s){ return String(s || '').replace(/\D+/g, ''); }

    function toE164(dial, national) {
      var cc = normalizeDigits(dial);
      var nn = normalizeDigits(national);
      var total = (cc + nn);
      if (total.length < 5 || total.length > 15) return null; // coarse E.164 guard
      return '+' + total;
    }

    function askPhoneNumberThenOtp() {
      clearBody();
      titleEl.textContent = 'Verify your phone';

      var lab1 = document.createElement('label');
      lab1.className = 'qf-label';
      lab1.textContent = '';

      var lab2 = document.createElement('label');
      lab2.className = 'qf-label';
      lab2.textContent = 'Phone number';

      var cc = document.createElement('select');
      cc.className = 'qf-input';
      COUNTRY_CODES.forEach(function(c){
        var opt = document.createElement('option');
        opt.value = c.dial;
        opt.textContent = c.name;
        cc.appendChild(opt);
      });
      cc.value = '91';

      var phoneInput = document.createElement('input');
      phoneInput.type = 'tel';
      phoneInput.className = 'qf-input';
      phoneInput.placeholder = 'e.g., 98765 43210';

      bodyEl.appendChild(lab1);
      bodyEl.appendChild(lab2);
      bodyEl.appendChild(cc);
      bodyEl.appendChild(phoneInput);

      var resolveWait;

      var send = makeBtn('Send OTP', function(){
        var e164 = toE164(cc.value, phoneInput.value);
        if (!e164) {
          alert('Please enter a valid phone number.');
          phoneInput.focus();
          return;
        }
        send.disabled = true;
        sendOtp(e164).then(function(r){
          
          writeState({ phone: e164 });

          // Next: OTP entry
          clearBody();
          titleEl.textContent = 'Enter OTP';
          var p = document.createElement('div');
          p.className = 'qf-label';
          p.textContent = 'We sent an OTP to ' + e164;

          var code = document.createElement('input');
          code.type = 'text';
          code.className = 'qf-input';
          code.placeholder = '6-digit code';

          if (!devOtpHint) {
            devOtpHint = document.createElement('div');
            devOtpHint.className = 'qf-dev-otp';
          }
          devOtpHint.textContent = 'Dev OTP: ' + (r.devOtp || 'sent');

          bodyEl.appendChild(p);
          bodyEl.appendChild(code);
          bodyEl.appendChild(devOtpHint);

          actionsEl.innerHTML = '';
          var verify = makeBtn('Verify', function(){
            var c = (code.value || '').trim();
            if (!/^\d{4,8}$/.test(c)) { code.focus(); return; }
            verify.disabled = true;
            verifyOtp(c).then(function(resp){
              writeState({ phoneVerified: true });
              // No need to save player patch here; server already set steps.phoneVerified

              // redirect to community with rank if available
              var rank = (resp && typeof resp.joinOrder === 'number') ? resp.joinOrder : null;
              var qs = rank ? ('?rank=' + encodeURIComponent(rank)) : '';
              window.location.href = '/community.html' + qs;
              resolveWait(true);
            }).catch(function(){
              alert('Invalid OTP');
              verify.disabled = false;
            });
          });
          actionsEl.appendChild(verify);
          code.focus();
        }).catch(function(err){
          if (err && err.code === 'PHONE_EXISTS') {
            alert(err.message || 'Phone number already exists');
          } else {
            alert('Failed to send OTP');
          }
          send.disabled = false;
        });
      });

      actionsEl.appendChild(send);

      return new Promise(function(resolve){ resolveWait = resolve; });
    }

    // -------------- Flow blocks --------------
    function welcomeThenName() {
      open();
      logoEl.style.display = 'block';
      return showMessage(
        'Welcome',
        'Welcome to Dream Stage, where every dream takes center stage and every voice becomes part of the show.'
      ).then(function(){
        logoEl.style.display = 'none';
        return askText(
          "What's Your Name?",
          '',
          'Enter your name',
          'Save'
        );
      }).then(function(name){
        writeState({ name: name, nameDone: true });
        return savePatch({ name: name });
      }).then(function(){
        return showMessage(
          'Welcome to Dream Stage',
          '“Welcome to Dream Stage, a place where your name is remembered, not just recorded. You’re not just entering a platform; you’re stepping into a movement.”'
        );
      }).then(close);
    }

    function roleQuestion() {
      open();
      return askOptions(
        'What best describes your current role?',
        '',
        [
          { label: '🧑‍🎨 Artist', value: 'artist' },
          { label: '🧑‍💼 Someone who helps artists', value: 'helper' },
          { label: '🏘️ Event curator or a business', value: 'business' },
          { label: '🎭 Just an art lover', value: 'lover' }
        ],
        'Continue'
      ).then(function(role){
        writeState({ role: role, roleDone: true });
        return savePatch({ role: role });
      }).then(function(){
        // Message 2 (post Q2)
        return showMessage(
          'Every movement needs its people. It takes mass collaboration to organize and uplift this industry, and it starts with knowing who you are.',
          ''
        );
      }).then(close);
    }

    function q3RoleSpecific() {
      var st = readState();
      open();

      if (st.role === 'artist') {
        return askAutosuggest(
          'Let’s get to know your role a little more, What kind of an artist are you',
          '',
          'For example DJ/Dancer/Painter/Chef'
        ).then(function(kind){
          writeState({ artistKind: kind, q3Done: true });
          return savePatch({ artistKind: kind }); // server compat maps to artistType
        }).then(function(){
          return showMessage('Got it!', '“Your art is your voice. Dream Stage helps it reach the world, where talent meets the audience it deserves.”');
        }).then(close);

      } else if (st.role === 'helper') {
        return askOptions(
          'How do you help?',
          'In what capacity do you help artists?',
          [
            { label: 'Mentor/Coach', value: 'mentor' },
            { label: 'Artist Crew', value: 'crew' },
            { label: 'Artist Manager/Agent', value: 'manager' },
            { label: 'Promoter', value: 'promoter' }
          ],
          'Continue'
        ).then(function(cap){
          writeState({ helperCapacity: cap, q3Done: true });
          return savePatch({ helperCapacity: cap });
        }).then(function(){
          return showMessage('Thank you!', '“You are the wind beneath the wings of creativity. Dream Stage celebrates your role in turning potential into brilliance.”');
        }).then(close);

      } else if (st.role === 'business') {
        return askText(
          'What kind of a business are you or what kind of events do you curate? (e.g., Music festivals, Weekend gigs, Retreats, Brand Activations)',
          '',
          'Describe your business/events...',
          'Continue'
        ).then(function(kind){
          writeState({ businessKind: kind, q3Done: true });
          return savePatch({ businessKind: kind }); // server compat -> managerRoleText
        }).then(function(){
          return showMessage('Nice!', '“You craft moments that become memories. Dream Stage is here to help you make them legendary.”');
        }).then(close);

      } else { // lover
        return askOptions(
          'What kind of artistic experiences do you enjoy the most?',
          '',
          [
            { label: 'Live performances (music, dance, theatre)', value: 'live' },
            { label: 'Visual arts (painting, photography, sculpture)', value: 'visual' },
            { label: 'Festivals & cultural events', value: 'festivals' },
            { label: 'Digital/interactive art', value: 'digital' }
          ],
          'Continue'
        ).then(function(fav){
          writeState({ loverPreference: fav, q3Done: true });
          return savePatch({ appreciatorEngagement: fav });
        }).then(function(){
          return showMessage('Love it!', '“Your presence fuels the magic. Without you, art has no heartbeat.”');
        }).then(close);
      }
    }

    function consentOtpThenFinal() {
      return askConsent().then(function(agree){
        writeState({ consentAgreed: !!agree });
        // Save via journey route to avoid "Cast to Object" error
        return saveConsent(!!agree);
      }).then(function(){
        return askPhoneNumberThenOtp();
      });
    }

    function q4RoleSpecificThenConsentOtp() {
      var st = readState();
      open();

      if (st.role === 'artist') {
        return askText(
          'Where are you currently based?',
          '',
          'Your city...',
          'Continue'
        ).then(function(city){
          writeState({ city: city, q4Done: true });
          return savePatch({ location: city });
        }).then(function(){
          return showMessage('Noted!', 'From the hills to the coast, from big cities to quiet towns- art lives everywhere. Knowing where you create helps us bring the stage closer to you.');
        }).then(consentOtpThenFinal);

      } else if (st.role === 'helper') {
        return askOptions(
          'What stage of an artist’s journey do you usually support?',
          '',
          [
            { label: 'Early career / beginners', value: 'early' },
            { label: 'Mid-career / growing artists', value: 'mid' },
            { label: 'Established / professional artists', value: 'pro' },
            { label: 'All stages', value: 'all' }
          ],
          'Continue'
        ).then(function(stage){
          writeState({ helperStage: stage, q4Done: true });
          return savePatch({ helperStage: stage });
        }).then(function(){
          return showMessage('Appreciated!', 'At Dream Stage, we believe every supporter behind the scenes is just as vital as the ones on stage. Whether you\'re booking gigs, offering guidance, or amplifying artists through promotion- you\'re helping shape the future of culture with us.');
        }).then(consentOtpThenFinal);

      } else if (st.role === 'business') {
        return askOptions(
          'How often do you organize or host gigs/events?',
          '',
          [
            { label: 'Weekly', value: 'weekly' },
            { label: 'Monthly', value: 'monthly' },
            { label: 'Quarterly', value: 'quarterly' },
            { label: 'Occasionally / On-demand only', value: 'occasional' }
          ],
          'Continue'
        ).then(function(freq){
          writeState({ eventFrequency: freq, q4Done: true });
          return savePatch({ eventFrequency: freq });
        }).then(function(){
          return showMessage('Great!', 'Every event you host keeps the creative ecosystem alive. At Dream Stage, we’re building a community where artists and curators collaborate seamlessly- and knowing your pace helps us make that connection stronger.');
        }).then(consentOtpThenFinal);

      } else { // lover
        return askOptions(
          'How often do you attend events?',
          '',
          [
            { label: 'Rarely (once or twice a year)', value: 'rare' },
            { label: 'Occasionally (every few months)', value: 'occasional' },
            { label: 'Frequently (once or twice a month)', value: 'frequent' },
            { label: 'Very frequently (weekly or more)', value: 'very_frequent' }
          ],
          'Continue'
        ).then(function(att){
          writeState({ attendance: att, q4Done: true });
          return savePatch({ attendance: att });
        }).then(function(){
          return showMessage('Awesome!', 'You make the magic matter- every great performance begins with a passionate audience that feels, celebrates, and amplifies an artist’s work.');
        }).then(consentOtpThenFinal);
      }
    }

    // -------------- Level-complete role messages --------------
    function level2RoleMessage(role) {
      if (role === 'artist') return 'Your art deserves the spotlight, keep creating!';
      if (role === 'business') return 'You’re curating more than events- you’re curating culture.';
      if (role === 'helper') return 'Behind every artist’s journey, there’s someone like you making it possible.';
      return 'Your love for art keeps the creative spirit alive.';
    }

    function level3RoleMessage(role) {
      if (role === 'artist') return 'Each step you take builds the stage for your dreams.';
      if (role === 'business') return 'Every choice you make brings fresh talent to the world.';
      if (role === 'helper') return 'Your support turns dreams into reality for countless artists.';
      return 'Every moment you engage, you make art more meaningful.';
    }

    // -------------- Public controls --------------
    // Called once on app boot
    this.init = function () {
      if (!overlay) createOverlay();

      // Hydrate from server, possibly auto-redirect if already verified
      ensureSession()
        .then(fetchServerDoc)
        .then(function(doc){
          if (doc && doc._id) setPlayerId(doc._id);
          mergeServerIntoLocal(doc);
          if (!maybeAutoRedirect(doc)) {
            // Not verified — idle until user starts game or clicks "Onboard me directly"
          }
        })
        .catch(function(){
          // If this fails, user can still start flow; session creation will run on next calls
        });

      // Listen for milestone close to continue flow if the generic popup handled it.
      window.addEventListener('milestone:closed', function(ev){
        var detail = ev && ev.detail || {};
        if (detail.level === 2) {
          var st = readState();
          if (!st.q3Done) q3RoleSpecific();
        }
        if (detail.level === 3) {
          var st3 = readState();
          if (!st3.q4Done || !st3.phoneVerified) {
            // kick off the rest (Question 4 then consent+otp)
            q4RoleSpecificThenConsentOtp();
          }
        }
      });
    };

    // Existing game hook (kept for backwards compatibility)
    this.ensureName = function () {
      var st = readState();
      if (st.nameDone) return Promise.resolve();
      return welcomeThenName();
    };

    // Existing level hook (kept): show next step after a level finishes
    // UPDATED: Removed MilestoneScreen calls here to avoid duplicates.
    this.afterLevelComplete = function(level) {
      var st = readState();
      var ms = getMilestone();

      // Level 1 -> Question 2 (role)
      if (level === 1 && !st.roleDone) {
        close();
        return roleQuestion();
      }

      // Level 2 -> let MilestoneScreen (generic) show; then continue when it closes.
      if (level === 2) {
        // If no milestone is visible at all, proceed immediately.
        if (!(ms && ms.isActive && ms.isActive())) {
          if (!st.q3Done) return q3RoleSpecific();
          close();
          return Promise.resolve();
        }
        // If visible, do nothing; init() listener will continue on close.
        return Promise.resolve();
      }

      // Level 3 -> same pattern as Level 2
      if (level === 3) {
        if (!(ms && ms.isActive && ms.isActive())) {
          if (!st.q4Done) return q4RoleSpecificThenConsentOtp();
          if (!st.phoneVerified) {
            open();
            return consentOtpThenFinal();
          }
          close();
          return Promise.resolve();
        }
        return Promise.resolve();
      }

      // Default fallthrough for other levels
      close();
      return Promise.resolve();
    };

    // NEW: Direct onboarding (no gameplay): resume from correct step
    this.startDirectOnboarding = function() {
      ensureSession()
        .then(fetchServerDoc)
        .then(function(doc){
          if (doc && doc._id) setPlayerId(doc._id);
          mergeServerIntoLocal(doc);
          if (maybeAutoRedirect(doc)) return;
          runOrResume();
        })
        .catch(function(){
          runOrResume();
        });
    };

    // Decide next question and run it
    function runOrResume() {
      var st = readState();

      if (!st.nameDone) {
        welcomeThenName().then(function(){ runOrResume(); });
        return;
      }
      if (!st.roleDone) {
        roleQuestion().then(function(){ runOrResume(); });
        return;
      }
      if (!st.q3Done) {
        q3RoleSpecific().then(function(){ runOrResume(); });
        return;
      }
      if (!st.q4Done) {
        q4RoleSpecificThenConsentOtp().then(function(){ runOrResume(); });
        return;
      }
      // Past Q4 — ensure consent + phone if not verified yet
      if (!st.phoneVerified) {
        open();
        consentOtpThenFinal(); // will redirect on success
        return;
      }

      // Verified but didn’t auto-redirect (e.g., local-only) — confirm & go
      ensureSession().then(function(){
        var sid = getSessionId();
        fetch('/api/player/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid })
        }).then(function(r){ return r.json(); }).then(function(j){
          var rank = (j && typeof j.joinOrder === 'number') ? j.joinOrder : null;
          var qs = rank ? ('?rank=' + encodeURIComponent(rank)) : '';
          window.location.href = '/community.html' + qs;
        }).catch(function(){
          window.location.href = '/community.html';
        });
      });
    }
  }

  return {
    getInstance: function () {
      if (!instance) instance = new QuestionFlow();
      return instance;
    }
  };
})();

(function(){
    const wheel = document.getElementById('wheel');
    const ctx = wheel.getContext('2d');
    const spinBtn = document.getElementById('spinBtn');
    const resultBox = document.getElementById('resultBox');
    const resultTitle = document.getElementById('resultTitle');
    const resultMsg = document.getElementById('resultMsg');
    const codesWrap = document.getElementById('codesWrap');
    const continueBtn = document.getElementById('continueBtn');
  
    // pull playerId from localStorage (set earlier in flow)
    const playerId = localStorage.getItem('QF_PLAYER_ID');
  
    // Segments & weights (degrees proportional)
    // 0% refund (draw but weight 0)
    const segments = [
      { label:'100% Refund', type:'refund', weight:0 },
      { label:'1 Referral',  type:'ref1',   weight:10 },
      { label:'No Gift',     type:'none',   weight:10 },
      { label:'2 Referrals', type:'ref2',   weight:20 },
      { label:'3 Referrals', type:'ref3',   weight:20 },
      { label:'2 Referrals', type:'ref2',   weight:20 },
      { label:'3 Referrals', type:'ref3',   weight:20 }
    ];
    const totalWeight = segments.reduce((s,x)=>s+x.weight,0);
  
    // Draw wheel
    function drawWheel(angle=0){
      const cx = wheel.width/2, cy = wheel.height/2, r = Math.min(cx, cy)-6;
      ctx.clearRect(0,0,wheel.width,wheel.height);
      let start = angle;
      for (const seg of segments){
        const arc = (seg.weight/totalWeight) * Math.PI*2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, start+arc, false);
        ctx.closePath();
        ctx.fillStyle = pickColor(seg.type);
        ctx.fill();
        // label
        const mid = start + arc/2;
        ctx.save();
        ctx.translate(cx + Math.cos(mid)*(r*0.6), cy + Math.sin(mid)*(r*0.6));
        ctx.rotate(mid);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(seg.label, 0, 4);
        ctx.restore();
        start += arc;
      }
      // pointer
      ctx.fillStyle='#000';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r - 4);
      ctx.lineTo(cx-10, cy - r + 16);
      ctx.lineTo(cx+10, cy - r + 16);
      ctx.closePath();
      ctx.fill();
    }
    function pickColor(t){
      switch(t){
        case 'ref3': return '#ffd166';
        case 'ref2': return '#95d5b2';
        case 'ref1': return '#a5b4fc';
        case 'none': return '#e2e8f0';
        case 'refund': return '#fecaca';
        default: return '#eee';
      }
    }
    drawWheel();
  
    // Weighted pick
    function pickWeighted(){
      let r = Math.random() * totalWeight;
      for (const seg of segments){
        if (r < seg.weight) return seg;
        r -= seg.weight;
      }
      return segments.find(s=>s.weight>0) || segments[0];
    }
  
    // animate spin to land on segment
    let spun = false;
    spinBtn.addEventListener('click', async ()=>{
      if (spun) return;
      spun = true; spinBtn.textContent = 'Spinning…';
  
      const target = pickWeighted();
      // compute target mid-angle
      let start = 0, targetStart = 0, targetArc = 0;
      for (const seg of segments){
        const arc = (seg.weight/totalWeight) * Math.PI*2;
        if (seg === target){ targetStart = start; targetArc = arc; break; }
        start += arc;
      }
      const mid = targetStart + targetArc/2;
      // We want the mid to align at -90deg (top pointer)
      const finalAngle = (Math.PI*1.5) - mid; // end rotation offset
      const extraTurns = Math.PI*2 * 8; // spins
      const end = finalAngle + extraTurns;
  
      const startTime = performance.now();
      const dur = 4200 + Math.random()*600;
  
      function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
  
      (function tick(now){
        const k = Math.min(1, (now - startTime)/dur);
        const a = easeOutCubic(k) * end;
        drawWheel(a);
        if (k < 1) requestAnimationFrame(tick);
        else showResult(target);
      })(startTime);
    });
  
    async function showResult(seg){
      resultBox.style.display='block';
      let referrals = 0;
      if (seg.type === 'ref3') referrals = 3;
      else if (seg.type === 'ref2') referrals = 2;
      else if (seg.type === 'ref1') referrals = 1;
  
      if (seg.type === 'refund'){
        resultTitle.textContent = 'Whoa! 100% Refund 🎉';
        resultMsg.textContent = 'Our team will process it shortly.';
        codesWrap.innerHTML = '';
      } else if (referrals === 0){
        resultTitle.textContent = 'No Gift This Time';
        resultMsg.textContent = 'Thank you for being part of Dream Stage. More chances soon!';
        codesWrap.innerHTML = '';
      } else {
        resultTitle.textContent = `You won ${referrals} referral${referrals>1?'s':''}!`;
        resultMsg.textContent = 'Share these invite codes with your friends. First come, first served.';
  
        // create referral codes on server
        const codes = await createReferralCodes(referrals);
        codesWrap.innerHTML = codes.map(c=>`<span class="code-pill">${c}</span>`).join('');
      }
    }
  
    async function createReferralCodes(n){
      try{
        const r = await fetch('/api/invites/referrals', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ playerId, count: n })
        });
        if(!r.ok) throw new Error('Failed to create codes');
        const j = await r.json();
        return Array.isArray(j.codes) ? j.codes : [];
      }catch(e){
        console.error(e);
        return [];
      }
    }
  
    continueBtn.addEventListener('click', ()=>{
      location.href = 'https://app.dreamstage.tech';
    });
  })();
  
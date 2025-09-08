// public/js/MilestoneOverlay.js
var MilestoneOverlay = (function () {
    var instance;
  
    function MOverlay() {
      var overlay, titleEl, gifEl, nextBtn, confettiHost, bgAudio;
  
      this.init = function () {
        // build overlay only once
        overlay = document.createElement('div');
        overlay.className = 'ms-overlay hidden';
        overlay.id = 'ms-overlay';
  
        // confetti behind the box
        confettiHost = document.createElement('div');
        confettiHost.className = 'confetti';
        confettiHost.id = 'ms-confetti';
  
        // milestone box
        var box = document.createElement('div');
        box.className = 'ms-box';
  
        titleEl = document.createElement('div');
        titleEl.className = 'ms-title';
        titleEl.id = 'ms-title';
        titleEl.textContent = 'Level Complete!';
  
        gifEl = document.createElement('img');
        gifEl.className = 'ms-celebration';
        gifEl.id = 'ms-gif';
        gifEl.alt = 'Celebration';
        gifEl.src = 'images/celebration2.gif';
  
        nextBtn = document.createElement('button');
        nextBtn.className = 'ms-next-btn';
        nextBtn.id = 'ms-next';
        nextBtn.textContent = 'Continue';
  
        box.appendChild(titleEl);
        box.appendChild(gifEl);
        box.appendChild(nextBtn);
  
        overlay.appendChild(confettiHost);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
  
        // preload audio
        bgAudio = new Audio('sounds/world-clear.ogg');
        bgAudio.preload = 'auto';
        bgAudio.volume = 0.9;
      };
  
      /**
       * Show milestone for given level.
       * Returns a Promise that resolves when "Continue" is pressed.
       */
      this.show = function (levelNumber) {
        return new Promise(function (resolve) {
          // title + gif
          titleEl.textContent = 'Level ' + levelNumber + ' Complete!';
          gifEl.src = 'images/celebration2.gif'; // ensure fresh load
  
          // clear any existing confetti
          while (confettiHost.firstChild) confettiHost.removeChild(confettiHost.firstChild);
  
          // spawn new confetti
          spawnConfetti(confettiHost, 120); // count
  
          // reveal
          overlay.classList.remove('hidden');
  
          // play bg win jingle
          try { bgAudio.currentTime = 0; bgAudio.play(); } catch (e) { /* autoplay might be blocked */ }
  
          nextBtn.onclick = function () {
            try { bgAudio.pause(); } catch (e) {}
            overlay.classList.add('hidden');
            // cleanup confetti
            while (confettiHost.firstChild) confettiHost.removeChild(confettiHost.firstChild);
            resolve();
          };
        });
      };
  
      function rand(min, max) { return Math.random() * (max - min) + min; }
      function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  
      /**
       * Creates falling confetti pieces. Each piece:
       *  - outer DIV: falls (translate/rotate)
       *  - inner <i>: flips (rotateY) to avoid transform conflict
       */
      function spawnConfetti(host, count) {
        var w = host.clientWidth || window.innerWidth;
        for (var i = 0; i < count; i++) {
          var piece = document.createElement('div');
          piece.className = 'confetti-piece';
  
          // randomize CSS variables
          var left = rand(0, w) + 'px';
          var size = randInt(8, 14) + 'px';
          var hue = randInt(0, 359);
          var dur = rand(3.2, 6.2) + 's';
          var delay = rand(0, 1.0) + 's';
          var rotDur = rand(0.8, 1.6) + 's';
          var drift = rand(-80, 80) + 'px';
  
          piece.style.setProperty('--c-left', left);
          piece.style.setProperty('--c-size', size);
          piece.style.setProperty('--c-hue', hue);
          piece.style.setProperty('--c-dur', dur);
          piece.style.setProperty('--c-delay', delay);
          piece.style.setProperty('--c-rot', rotDur);
          piece.style.setProperty('--c-drift', drift);
  
          // inner for tilt (prevents transform override)
          var inner = document.createElement('i');
          piece.appendChild(inner);
  
          host.appendChild(piece);
        }
      }
    }
  
    return {
      getInstance: function () {
        if (!instance) instance = new MOverlay();
        return instance;
      }
    };
  })();
  
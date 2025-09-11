// public/js/MilestoneScreen.js
// Minimal milestone overlay: title + celebration GIF + message + Continue.
// Plays sounds/world-clear.ogg while visible.
// Uses your existing .confetti / .confetti-piece CSS to render falling confetti.
// Added de-duplication, role-aware messages for Level 2/3, and lifecycle events:
//   window.dispatchEvent(new CustomEvent('milestone:opened', { detail: { level } }));
//   window.dispatchEvent(new CustomEvent('milestone:closed', { detail: { level } }));

var MilestoneScreen = (function () {
  var instance;

  function MilestoneScreen() {
    var overlay, box, titleEl, celebrationImg, messageEl, nextBtn, music;
    var confettiHost = null;
    var confettiPieces = 90; // tweak count if needed

    // state to prevent duplicates
    var isVisible = false;
    var lastShownLevel = null;
    var lastShownAt = 0;
    var currentOnDone = null;
    var currentMessageHasContent = false;
    var currentLevel = null;

    // Default message only for Level 1, Level 2/3 are role-based
    var MESSAGES = {
      1: "Every level takes us closer to a thriving creative world."
    };

    function now() { return Date.now(); }

    function readRole() {
      try {
        var s = JSON.parse(localStorage.getItem('QF_STATE') || '{}');
        return s && s.role ? s.role : 'lover';
      } catch (e) {
        return 'lover';
      }
    }

    function roleMessage(level, role) {
      if (level === 2) {
        if (role === 'artist') return 'Your art deserves the spotlight, keep creating!';
        if (role === 'business') return 'You’re curating more than events- you’re curating culture.';
        if (role === 'helper') return 'Behind every artist’s journey, there’s someone like you making it possible.';
        return 'Your love for art keeps the creative spirit alive.';
      }
      if (level === 3) {
        if (role === 'artist') return 'Each step you take builds the stage for your dreams.';
        if (role === 'business') return 'Every choice you make brings fresh talent to the world.';
        if (role === 'helper') return 'Your support turns dreams into reality for countless artists.';
        return 'Every moment you engage, you make art more meaningful.';
      }
      return '';
    }

    function create() {
      overlay = document.createElement('div');
      overlay.className = 'ms-overlay hidden';

      // Fullscreen confetti background (behind the box)
      confettiHost = document.createElement('div');
      confettiHost.className = 'confetti';

      // Foreground modal
      box = document.createElement('div');
      box.className = 'ms-box';
      box.style.zIndex = '1'; // stay above confetti

      titleEl = document.createElement('div');
      titleEl.className = 'ms-title';
      titleEl.textContent = 'Level Complete!';

      celebrationImg = document.createElement('img');
      celebrationImg.className = 'ms-celebration';
      celebrationImg.src = 'images/celebration2.gif'; // ensure this exists
      celebrationImg.alt = 'Celebration';

      messageEl = document.createElement('div');
      messageEl.className = 'ms-message';
      messageEl.style.cssText =
        'font-family: "Lexend", sans-serif; font-size:16px;color:black; margin:6px 8px 0; line-height:1.4; text-align:center;font-weight:400;';

      nextBtn = document.createElement('button');
      nextBtn.className = 'ms-next-btn';
      nextBtn.textContent = 'GO BACK';
      nextBtn.disabled = true;

      // Order: confetti first (background), then box (foreground)
      overlay.appendChild(confettiHost);
      box.appendChild(titleEl);
      box.appendChild(celebrationImg);
      box.appendChild(messageEl);
      box.appendChild(nextBtn);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      // Prepare background music
      try {
        music = new Audio('sounds/world-clear.ogg'); // ensure this exists
        music.loop = false;
        music.volume = 1.0;
      } catch (e) {
        music = null;
      }
    }

    function open() { overlay.classList.remove('hidden'); isVisible = true; }
    function close() { overlay.classList.add('hidden'); isVisible = false; }

    function playMusic() {
      if (!music) return;
      try {
        music.currentTime = 0;
        var p = music.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) {}
    }
    function stopMusic() {
      if (!music) return;
      try {
        music.pause();
        music.currentTime = 0;
      } catch (e) {}
    }

    function spawnConfetti() {
      if (!confettiHost) return;
      confettiHost.innerHTML = ''; // clear old if any

      for (var i = 0; i < confettiPieces; i++) {
        var piece = document.createElement('div');
        piece.className = 'confetti-piece';

        // Randomize via CSS vars
        var left = Math.random() * 100; // %
        var size = 6 + Math.random() * 10; // px
        var hue = Math.floor(Math.random() * 360);
        var delay = Math.random() * 0.8; // s
        var dur = 3 + Math.random() * 2.5; // s
        var drift = (Math.random() * 80) - 40; // px
        var rotDur = 0.8 + Math.random() * 1.6; // s

        piece.style.setProperty('--c-left', left + '%');
        piece.style.setProperty('--c-size', size + 'px');
        piece.style.setProperty('--c-hue', hue);
        piece.style.setProperty('--c-delay', delay + 's');
        piece.style.setProperty('--c-dur', dur + 's');
        piece.style.setProperty('--c-drift', drift + 'px');
        piece.style.setProperty('--c-rot', rotDur + 's');

        confettiHost.appendChild(piece);
      }
    }

    function clearConfetti() {
      if (!confettiHost) return;
      confettiHost.innerHTML = '';
    }

    // opts:
    //   level: number
    //   message: string (optional; if absent, Level 2/3 use role-based defaults)
    //   title: string (optional override)
    this.show = function (opts, onDone) {
      if (!overlay) create();

      var levelNum = (opts && typeof opts.level === 'number') ? opts.level : null;
      var customTitle = opts && opts.title ? String(opts.title) : null;
      var customMsg = opts && typeof opts.message === 'string' ? String(opts.message) : null;
      var incomingHasContent = !!(customMsg && customMsg.trim().length);

      // Throttle duplicate requests for the same level within 750 ms
      var t = now();
      if (levelNum !== null && lastShownLevel === levelNum && (t - lastShownAt) < 750) {
        return;
      }

      // If already visible:
      // - If current message is empty and a richer message arrives, upgrade contents and replace onDone.
      // - Otherwise, ignore the duplicate call.
      if (isVisible) {
        if (!currentMessageHasContent && incomingHasContent) {
          if (customTitle) titleEl.textContent = customTitle;
          if (levelNum && !customTitle) titleEl.textContent = 'Level ' + levelNum + ' Complete!';
          messageEl.textContent = customMsg;
          currentMessageHasContent = true;
          if (typeof onDone === 'function') {
            currentOnDone = onDone;
            nextBtn.onclick = function () {
              stopMusic();
              clearConfetti();
              close();
              var cb = currentOnDone;
              var lv = currentLevel;
              currentOnDone = null;
              currentLevel = null;
              try { window.dispatchEvent(new CustomEvent('milestone:closed', { detail: { level: lv } })); } catch(e){}
              if (typeof cb === 'function') cb();
            };
          }
        }
        return;
      }

      // Not visible: open normally
      if (customTitle) {
        titleEl.textContent = customTitle;
      } else if (levelNum) {
        titleEl.textContent = 'Level ' + levelNum + ' Complete!';
      } else {
        titleEl.textContent = 'Level Complete!';
      }

      // Default message selection:
      if (!incomingHasContent) {
        if (levelNum === 2 || levelNum === 3) {
          var role = readRole();
          customMsg = roleMessage(levelNum, role);
          incomingHasContent = !!customMsg;
        } else if (levelNum && MESSAGES[levelNum]) {
          customMsg = MESSAGES[levelNum];
          incomingHasContent = true;
        }
      }

      if (incomingHasContent) {
        messageEl.textContent = customMsg;
        currentMessageHasContent = true;
      } else {
        messageEl.textContent = '';
        currentMessageHasContent = false;
      }

      // Reset UI
      nextBtn.disabled = true;

      open();
      playMusic();
      spawnConfetti();

      currentLevel = levelNum;
      try { window.dispatchEvent(new CustomEvent('milestone:opened', { detail: { level: levelNum } })); } catch(e){}

      setTimeout(function () {
        nextBtn.disabled = false;
      }, 350);

      lastShownLevel = levelNum;
      lastShownAt = t;
      currentOnDone = typeof onDone === 'function' ? onDone : null;

      var clicked = false;
      nextBtn.onclick = function () {
        if (clicked) return;
        clicked = true;
        stopMusic();
        clearConfetti();
        close();
        var cb = currentOnDone;
        var lv = currentLevel;
        currentOnDone = null;
        currentLevel = null;
        try { window.dispatchEvent(new CustomEvent('milestone:closed', { detail: { level: lv } })); } catch(e){}
        if (typeof cb === 'function') cb();
      };
    };

    // Helper for callers to know if a milestone is currently open
    this.isActive = function () { return isVisible; };
  }

  return {
    getInstance: function () {
      if (!instance) instance = new MilestoneScreen();
      return instance;
    }
  };
})();

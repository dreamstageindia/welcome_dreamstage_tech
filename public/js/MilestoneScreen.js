// public/js/MilestoneScreen.js
// Minimal milestone overlay: title + celebration GIF + message + Continue.
// Plays sounds/world-clear.ogg while visible.
// Uses your existing .confetti / .confetti-piece CSS to render falling confetti.

var MilestoneScreen = (function () {
  var instance;

  function MilestoneScreen() {
    var overlay, box, titleEl, celebrationImg, messageEl, nextBtn, music;
    var confettiHost = null;
    var confettiPieces = 90; // tweak count if needed

    // Per-level messages shown under the GIF
    var MESSAGES = {
      1: "We hope you’re feeling a little more alive. Let’s keep going!",
      2: "Every movement needs its people. It takes mass collaboration to organize and uplift this industry, and it starts with knowing who you are.",
      3: "The dream is within reach."
    };

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
      messageEl.style.cssText = 'font-family: Outfit, sans-serif; font-size:16px; text-shadow:1px 1px 0 #000;color:black; margin:6px 8px 0; line-height:1.4; text-align:center;';

      nextBtn = document.createElement('button');
      nextBtn.className = 'ms-next-btn';
      nextBtn.textContent = 'Continue';
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

    function open() { overlay.classList.remove('hidden'); }
    function close() { overlay.classList.add('hidden'); }

    function playMusic() {
      if (!music) return;
      try {
        music.currentTime = 0;
        var p = music.play();
        if (p && typeof p.catch === 'function') p.catch(function() {});
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

        // Randomize via CSS vars (your CSS keyframes should use these)
        var left = Math.random() * 100;         // %
        var size = 6 + Math.random() * 10;      // px
        var hue  = Math.floor(Math.random() * 360);
        var delay = Math.random() * 0.8;        // s
        var dur   = 3 + Math.random() * 2.5;    // s
        var drift = (Math.random() * 80) - 40;  // px drift to side
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

    this.show = function (opts, onDone) {
      if (!overlay) create();

      var levelNum = (opts && typeof opts.level === 'number') ? opts.level : '';
      titleEl.textContent = levelNum ? ('Level ' + levelNum + ' Complete!') : 'Level Complete!';
      messageEl.textContent = (levelNum && MESSAGES[levelNum]) ? MESSAGES[levelNum] : '';

      // Reset UI
      nextBtn.disabled = true;

      open();
      playMusic();
      spawnConfetti();

      // Enable Continue after a short beat
      setTimeout(function () {
        nextBtn.disabled = false;
      }, 350);

      var clicked = false;
      nextBtn.onclick = function () {
        if (clicked) return;
        clicked = true;
        stopMusic();
        clearConfetti();
        close();
        if (typeof onDone === 'function') onDone();
      };
    };
  }

  return {
    getInstance: function () {
      if (!instance) instance = new MilestoneScreen();
      return instance;
    }
  };
})();

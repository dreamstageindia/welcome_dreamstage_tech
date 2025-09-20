// public/js/MarioMaker.js
var MarioMaker = (function() {
  var instance;

  // Robust iOS detection (covers iPadOS desktop UA too)
  var IS_IOS = (function () {
    var ua = navigator.userAgent || "";
    var platform = navigator.platform || "";
    var iOSUA = /iPad|iPhone|iPod/i.test(ua);
    var iPadOSDesktopMode = platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iOSUA || iPadOSDesktopMode;
  })();

  function MarioMaker() {
    var view = View.getInstance();

    // UI elements
    var mainWrapper, startScreen, btnWrapper;
    var editorButton, startGameButton, createdLevelsButton, backToMenuBtn;
    var onboardDirectButton;

    // state
    var editorStarted = false;
    var levelsCache = null;

    // game/editor instances
    var marioGame, editor, createdLevels;

    var that = this;
    var currentLevel = 1;

    // Question flow
    var qflow = QuestionFlow.getInstance();

    // ----- Simple persistent state -----
    var GS_KEY = 'MM_GAME_STATE';
    function readState() {
      try { return JSON.parse(localStorage.getItem(GS_KEY) || '{}'); }
      catch { return {}; }
    }
    function writeState(patch) {
      var s = readState();
      Object.assign(s, patch || {});
      localStorage.setItem(GS_KEY, JSON.stringify(s));
      return s;
    }
    function clearState() {
      localStorage.removeItem(GS_KEY);
    }

    this.init = function() {
      // instantiate subsystems
      marioGame = new MarioGame();
      editor = new Editor();
      createdLevels = CreatedLevels.getInstance();

      // init question flow/session
      qflow.init();

      // build main menu
      mainWrapper = view.getMainWrapper();
      if (!mainWrapper) {
        console.error('Main wrapper not found');
        return;
      }

      startScreen = view.create('div');
      btnWrapper = view.create('div');
      editorButton = view.create('button');
      startGameButton = view.create('button');
      createdLevelsButton = view.create('button');
      backToMenuBtn = view.create('button');
      onboardDirectButton = view.create('button');

      if (!startScreen || !btnWrapper || !editorButton || !startGameButton || !createdLevelsButton || !backToMenuBtn || !onboardDirectButton) {
        console.error('Failed to create UI elements');
        return;
      }

      // layout containers
      view.addClass(startScreen, 'start-screen');
      view.addClass(btnWrapper, 'btn-wrapper');

      // shared look: make menu buttons match onboard button style
      view.addClass(editorButton, 'menu-btn');
      view.addClass(startGameButton, 'menu-btn');
      view.addClass(createdLevelsButton, 'menu-btn');

      // keep legacy classes if you style them elsewhere too
      view.addClass(editorButton, 'editor-btn');
      view.addClass(startGameButton, 'start-btn');
      view.addClass(createdLevelsButton, 'created-btn');

      // back and onboard CTA
      view.addClass(backToMenuBtn, 'back-btn');
      view.addClass(onboardDirectButton, 'onboard-btn');

      // labels
      startGameButton.textContent = 'BRING YOUR A GAME';
      startGameButton.setAttribute('aria-label', 'Start Game');

      editorButton.textContent = 'Level Editor';
      editorButton.setAttribute('aria-label', 'Level Editor');

      createdLevelsButton.textContent = 'Saved Levels';
      createdLevelsButton.setAttribute('aria-label', 'Saved Levels');

      onboardDirectButton.textContent = 'KEEP IT SIMPLE';
      onboardDirectButton.setAttribute('aria-label', 'Onboard me directly');

      // Compose DOM
      // Center stack the three main buttons; onboard stays docked at bottom
      view.append(startScreen, startGameButton);
      view.append(startScreen, editorButton);
      view.append(startScreen, createdLevelsButton);
      view.append(startScreen, onboardDirectButton);
      view.append(btnWrapper, backToMenuBtn);
      view.append(mainWrapper, startScreen);
      view.append(mainWrapper, btnWrapper);

      // Handlers
      editorButton.onclick = that.startEditor;
      createdLevelsButton.onclick = that.startCreatedLevels;
      backToMenuBtn.onclick = that.backToMenu;
      startGameButton.onclick = that.onStartGame;
      onboardDirectButton.onclick = function () {
        window.location.href = 'onboard.html';
      };

      // ---- iOS restrictions: show ONLY "KEEP IT SIMPLE" ----
      if (IS_IOS) {
        // Hide gameplay-related buttons entirely for iOS
        view.style(startGameButton, { display: 'none' });
        view.style(editorButton, { display: 'none' });
        view.style(createdLevelsButton, { display: 'none' });
        // Also ensure the back button is hidden by default
        view.style(backToMenuBtn, { display: 'none' });

        // Wipe any persisted in-game state so we never auto-resume gameplay
        clearState();
      }

      // Attempt auto-resume if user refreshes mid-session (non-iOS only)
      if (!IS_IOS) {
        that.tryAutoResume();
      }
    };

    this.tryAutoResume = function() {
      var s = readState();
      if (!s.inGame) return;

      if (backToMenuBtn) view.style(backToMenuBtn, { display: 'block' });
      that.hideMainMenu();

      qflow.ensureName()
        .then(function() {
          currentLevel = s.currentLevel || 1;

          if (s.pendingMilestone) {
            return new Promise(function(resolve) {
              if (window.MilestoneScreen && MilestoneScreen.getInstance) {
                var milestone = MilestoneScreen.getInstance();
                var step = Math.min(3, currentLevel);
                milestone.show({ level: currentLevel, step: step }, function() {
                  writeState({ pendingMilestone: false, pendingAfterComplete: true, inGame: true, currentLevel: currentLevel });
                  resolve();
                });
              } else {
                writeState({ pendingMilestone: false, pendingAfterComplete: true, inGame: true, currentLevel: currentLevel });
                resolve();
              }
            }).then(function() {
              return qflow.afterLevelComplete(currentLevel).then(function() {
                currentLevel = currentLevel + 1;
                writeState({ inGame: true, currentLevel: currentLevel, pendingAfterComplete: false });
                return that.fetchLevels(currentLevel).then(function(map) {
                  if (Object.keys(map).length === 0) {
                    console.warn('No more levels, game over');
                    marioGame.gameOver();
                  } else {
                    marioGame.clearInstances();
                    marioGame.init(map, currentLevel);
                    that.hookLevelComplete();
                  }
                });
              });
            });
          }

          if (s.pendingAfterComplete) {
            return qflow.afterLevelComplete(currentLevel).then(function() {
              currentLevel = currentLevel + 1;
              writeState({ inGame: true, currentLevel: currentLevel, pendingAfterComplete: false });
              return that.fetchLevels(currentLevel).then(function(map) {
                if (Object.keys(map).length === 0) {
                  console.warn('No more levels, game over');
                  marioGame.gameOver();
                } else {
                  marioGame.clearInstances();
                  marioGame.init(map, currentLevel);
                  that.hookLevelComplete();
                }
              });
            });
          }

          return that.fetchLevels(currentLevel).then(function(map) {
            if (Object.keys(map).length === 0) {
              console.warn('No levels fetched, using fallback map');
              map = that.loadMainGameMap();
            }
            marioGame.clearInstances();
            marioGame.init(map, currentLevel);
            that.hookLevelComplete();
          });
        })
        .catch(function(err) {
          console.error('Auto-resume failed:', err);
          that.showMainMenu();
          if (backToMenuBtn) view.style(backToMenuBtn, { display: 'none' });
          clearState();
        });
    };

    this.fetchLevels = function(levelNumber) {
      console.log("Fetching level " + levelNumber + " from: /api/levels/" + levelNumber);
      levelsCache = null;
      return fetch("/api/levels/" + levelNumber)
        .then(function(res) {
          if (!res.ok) {
            throw new Error("Server returned " + res.status + ": " + res.statusText);
          }
          return res.json();
        })
        .then(function(data) {
          console.log('Fetched level data:', data);
          if (!data || !data.map || !Array.isArray(data.map)) {
            throw new Error('Invalid level data: map is missing or not an array');
          }
          var normalized = {}; normalized[levelNumber] = JSON.stringify(data.map);
          levelsCache = normalized;
          return levelsCache;
        })
        .catch(function(err) {
          console.error("Fetch level " + levelNumber + " failed:", err.message);
          return {};
        });
    };

    this.onStartGame = function() {
      if (IS_IOS) {
        // Guard: gameplay is disabled on iOS. Redirect to simple onboarding.
        window.location.href = 'onboard.html';
        return;
      }

      if (backToMenuBtn) {
        view.style(backToMenuBtn, { display: 'block' });
      } else {
        console.error('backToMenuBtn is undefined');
      }

      qflow.ensureName().then(function() {
        currentLevel = 1;
        writeState({ inGame: true, currentLevel: currentLevel, pendingAfterComplete: false, pendingMilestone: false });
        return that.fetchLevels(currentLevel);
      })
      .then(function(map) {
        if (Object.keys(map).length === 0) {
          console.warn('No levels fetched, using fallback map');
          map = that.loadMainGameMap();
        }
        that.startGame(map);
      })
      .catch(function(err) {
        console.error('Start game failed:', err);
        var map = that.loadMainGameMap();
        that.startGame(map);
      });
    };

    // NEW: Onboarding-only path (no gameplay)
    this.startOnboardingOnly = function() {
      if (backToMenuBtn) view.style(backToMenuBtn, { display: 'block' });
      that.hideMainMenu();
      marioGame.pauseGame && marioGame.pauseGame();
      marioGame.clearTimeOut && marioGame.clearTimeOut();
      marioGame.removeGameScreen && marioGame.removeGameScreen();
      if (editorStarted) editor.removeEditorScreen();
      createdLevels.removeCreatedLevelsScreen();

      writeState({ inGame: false, pendingAfterComplete: false, pendingMilestone: false, currentLevel: 1 });

      qflow.ensureName()
        .then(function(){ return qflow.afterLevelComplete(1); })
        .then(function(){ return qflow.afterLevelComplete(2); })
        .then(function(){ return qflow.afterLevelComplete(3); })
        .then(function(){
          that.showMainMenu();
          if (backToMenuBtn) view.style(backToMenuBtn, { display: 'none' });
        })
        .catch(function(err){
          console.error('Onboarding-only flow failed:', err);
          that.showMainMenu();
          if (backToMenuBtn) view.style(backToMenuBtn, { display: 'none' });
        });
    };

    this.loadMainGameMap = function() {
      var obj = {}; obj[currentLevel] = '[[0,0,0],[0,1,0]]';
      return obj;
    };

    this.startGame = function(levelMap) {
      console.log('Starting game with map:', levelMap);
      marioGame.clearInstances();
      marioGame.init(levelMap, currentLevel);
      that.hideMainMenu();
      if (editorStarted) {
        editor.removeEditorScreen();
      }
      createdLevels.removeCreatedLevelsScreen();
      that.hookLevelComplete();
    };

    this.hookLevelComplete = function() {
      marioGame.onLevelComplete = function() {
        writeState({ inGame: true, currentLevel: currentLevel, pendingMilestone: true, pendingAfterComplete: false });

        var afterMilestone = function() {
          writeState({ pendingMilestone: false, pendingAfterComplete: true, inGame: true, currentLevel: currentLevel });

          qflow.afterLevelComplete(currentLevel)
            .then(function() {
              currentLevel++;
              writeState({ inGame: true, currentLevel: currentLevel, pendingAfterComplete: false, pendingMilestone: false });
              return that.fetchLevels(currentLevel);
            })
            .then(function(map) {
              if (Object.keys(map).length === 0) {
                console.warn('No more levels, game over');
                marioGame.gameOver();
              } else {
                marioGame.init(map, currentLevel);
                that.hookLevelComplete();
              }
            })
            .catch(function(err) {
              console.error('Failed to load next level:', err);
              marioGame.gameOver();
            });
        };

        if (window.MilestoneScreen && MilestoneScreen.getInstance) {
          var milestone = MilestoneScreen.getInstance();
          var step = Math.min(3, currentLevel);
          milestone.show({ level: currentLevel, step: step }, afterMilestone);
        } else {
          afterMilestone();
        }
      };
    };

    this.startEditor = function() {
      if (IS_IOS) {
        // Editor (which can lead to gameplay) is disabled on iOS
        window.location.href = 'onboard.html';
        return;
      }
      if (backToMenuBtn) {
        view.style(backToMenuBtn, { display: 'block' });
      } else {
        console.error('backToMenuBtn is undefined');
      }
      if (!editorStarted) {
        editor.init();
        editorStarted = true;
      } else {
        editor.showEditorScreen();
      }
      that.hideMainMenu();
      marioGame.removeGameScreen();
      createdLevels.removeCreatedLevelsScreen();
    };

    this.startCreatedLevels = function() {
      if (IS_IOS) {
        // Created levels (and potential play) disabled on iOS
        window.location.href = 'onboard.html';
        return;
      }
      if (backToMenuBtn) {
        view.style(backToMenuBtn, { display: 'block' });
      } else {
        console.error('backToMenuBtn is undefined');
      }
      if (!editorStarted) {
        editor.init();
        editorStarted = true;
      }
      createdLevels.init();
      that.hideMainMenu();
      marioGame.removeGameScreen();
      if (editorStarted) {
        editor.removeEditorScreen();
      }
    };

    this.backToMenu = function() {
      marioGame.pauseGame();
      marioGame.clearTimeOut();
      marioGame.removeGameScreen();
      if (editorStarted) {
        editor.removeEditorScreen();
      }
      createdLevels.removeCreatedLevelsScreen();
      that.showMainMenu();
      if (backToMenuBtn) {
        view.style(backToMenuBtn, { display: 'none' });
      } else {
        console.error('backToMenuBtn is undefined');
      }
      writeState({ inGame: false, pendingAfterComplete: false, pendingMilestone: false });
    };

    this.hideMainMenu = function() {
      if (startScreen) {
        view.style(startScreen, { display: 'none' });
      } else {
        console.error('startScreen is undefined');
      }
    };

    this.showMainMenu = function() {
      if (startScreen) {
        view.style(startScreen, { display: 'block' });
      } else {
        console.error('startScreen is undefined');
      }
    };
  }

  return {
    getInstance: function() {
      if (!instance) instance = new MarioMaker();
      return instance;
    }
  };
})();

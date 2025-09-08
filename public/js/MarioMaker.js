// public/js/MarioMaker.js
var MarioMaker = (function() {
  var instance;

  function MarioMaker() {
    var view = View.getInstance();

    // UI elements
    var mainWrapper, startScreen, btnWrapper;
    var editorButton, startGameButton, createdLevelsButton, backToMenuBtn;
    var onboardDirectButton; // NEW

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
    // GS schema:
    // {
    //   inGame: boolean,
    //   currentLevel: number,
    //   pendingMilestone: boolean,
    //   pendingAfterComplete: boolean
    // }
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
      onboardDirectButton = view.create('button'); // NEW

      if (!startScreen || !btnWrapper || !editorButton || !startGameButton || !createdLevelsButton || !backToMenuBtn || !onboardDirectButton) {
        console.error('Failed to create UI elements');
        return;
      }

      view.addClass(startScreen, 'start-screen');
      view.addClass(btnWrapper, 'btn-wrapper');
      view.addClass(editorButton, 'editor-btn');
      view.addClass(startGameButton, 'start-btn');
      view.addClass(createdLevelsButton, 'created-btn');
      view.addClass(backToMenuBtn, 'back-btn');
      view.addClass(onboardDirectButton, 'onboard-btn'); // NEW

      
      onboardDirectButton.textContent = 'Onboard me directly'; // NEW

      // Compose DOM
      view.append(startScreen, editorButton);
      view.append(startScreen, startGameButton);
      view.append(startScreen, createdLevelsButton);
      view.append(startScreen, onboardDirectButton); // NEW (center bottom)
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

      // Attempt auto-resume if user refreshes mid-session
      that.tryAutoResume();
    };

    this.tryAutoResume = function() {
      var s = readState();
      if (!s.inGame) return; // nothing to do

      // show back button and hide main menu
      if (backToMenuBtn) view.style(backToMenuBtn, { display: 'block' });
      that.hideMainMenu();

      // Ensure name step is initialized once
      qflow.ensureName()
        .then(function() {
          currentLevel = s.currentLevel || 1;

          // If we were in the middle of the milestone animation, replay it, then proceed to questions.
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

          // Otherwise just reload the saved current level
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
          // fall back to start screen
          that.showMainMenu();
          if (backToMenuBtn) view.style(backToMenuBtn, { display: 'none' });
          clearState();
        });
    };

    this.fetchLevels = function(levelNumber) {
      console.log(`Fetching level ${levelNumber} from: http://localhost:3000/api/levels/${levelNumber}`);
      levelsCache = null;
      return fetch(`http://localhost:3000/api/levels/${levelNumber}`)
        .then(function(res) {
          if (!res.ok) {
            throw new Error(`Server returned ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then(function(data) {
          console.log('Fetched level data:', data);
          if (!data || !data.map || !Array.isArray(data.map)) {
            throw new Error('Invalid level data: map is missing or not an array');
          }
          var normalized = { [levelNumber]: JSON.stringify(data.map) };
          levelsCache = normalized;
          return levelsCache;
        })
        .catch(function(err) {
          console.error(`Fetch level ${levelNumber} failed:`, err.message);
          return {};
        });
    };

    this.onStartGame = function() {
      if (backToMenuBtn) {
        view.style(backToMenuBtn, { display: 'block' });
      } else {
        console.error('backToMenuBtn is undefined');
      }

      // BEFORE LEVEL 1: ensure name (only once)
      qflow.ensureName().then(function() {
        currentLevel = 1;
        // mark inGame + current level
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
      // Make back button visible, hide main menu, and make sure no game screen is running
      if (backToMenuBtn) view.style(backToMenuBtn, { display: 'block' });
      that.hideMainMenu();
      marioGame.pauseGame && marioGame.pauseGame();
      marioGame.clearTimeOut && marioGame.clearTimeOut();
      marioGame.removeGameScreen && marioGame.removeGameScreen();
      if (editorStarted) editor.removeEditorScreen();
      createdLevels.removeCreatedLevelsScreen();

      // Ensure we don't auto-resume game
      writeState({ inGame: false, pendingAfterComplete: false, pendingMilestone: false, currentLevel: 1 });

      // Run questionnaire sequence only
      qflow.ensureName()
        .then(function(){ return qflow.afterLevelComplete(1); })
        .then(function(){ return qflow.afterLevelComplete(2); })
        .then(function(){ return qflow.afterLevelComplete(3); })
        .then(function(){
          // Done; return to menu (or keep back button so user can return)
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
      return { [currentLevel]: '[[0,0,0],[0,1,0]]' };
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
        // Mark that we completed currentLevel and are about to run Milestone, then inter-level Qs
        writeState({ inGame: true, currentLevel: currentLevel, pendingMilestone: true, pendingAfterComplete: false });

        // 1) Milestone celebration (if available)
        var afterMilestone = function() {
          writeState({ pendingMilestone: false, pendingAfterComplete: true, inGame: true, currentLevel: currentLevel });

          // 2) Inter-level questions (role, details, etc.)
          qflow.afterLevelComplete(currentLevel)
            .then(function() {
              // 3) Advance to next level
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
          // Fallback: no milestone script loaded
          afterMilestone();
        }
      };
    };

    this.startEditor = function() {
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
      // leaving editor does not toggle inGame state
    };

    this.startCreatedLevels = function() {
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
      // explicitly clear inGame state when going back to menu
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

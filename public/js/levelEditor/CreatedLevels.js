var CreatedLevels = (function() {
  var instance;

  function CreatedLevels() {
    var view = View.getInstance();
    var levelsWrapper = null; // Initialize as null
    var that = this;

    this.init = function() {
      var mainWrapper = view.getMainWrapper();
      if (!mainWrapper) {
        console.error('Main wrapper not found in CreatedLevels.init');
        return;
      }

      levelsWrapper = view.create('div');
      var deleteAllBtn = view.create('button');

      if (!levelsWrapper || !deleteAllBtn) {
        console.error('Failed to create elements in CreatedLevels.init');
        return;
      }

      view.addClass(levelsWrapper, 'levels-wrapper');
      view.addClass(deleteAllBtn, 'delete-all-btn');
      view.style(levelsWrapper, { display: 'block' });
      view.append(levelsWrapper, deleteAllBtn);
      view.append(mainWrapper, levelsWrapper);
      view.setHTML(deleteAllBtn, 'Delete All');

      deleteAllBtn.onclick = that.deleteAllMaps;

      that.showLevels();
    };

    this.showLevels = function() {
      if (!levelsWrapper) {
        console.warn('levelsWrapper is undefined, attempting to reinitialize');
        that.init();
        if (!levelsWrapper) {
          console.error('Reinitialization failed: levelsWrapper is still undefined');
          return;
        }
      }

      // Clear existing level buttons
      while (levelsWrapper.hasChildNodes()) {
        view.remove(levelsWrapper, levelsWrapper.lastChild);
      }

      // Fetch levels from backend
      fetch('http://localhost:3000/api/levels/list')
        .then(function(res) {
          if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
          }
          return res.json();
        })
        .then(function(levels) {
          console.log('Fetched levels:', levels);
          if (levels.length > 0) {
            levels.forEach(function(level, index) {
              var levelButton = view.create('div');
              var levelName = `Level ${index + 1} (Created: ${new Date(level.createdAt).toLocaleString()})`;

              view.setHTML(levelButton, levelName);
              view.addClass(levelButton, 'level-btn');
              view.append(levelsWrapper, levelButton);

              levelButton.onclick = function() {
                console.log('Starting level with ID:', level._id);
                that.startLevel(level._id);
                that.removeCreatedLevelsScreen();
              };
            });
          } else {
            var noMapsMessage = view.create('div');
            view.addClass(noMapsMessage, 'no-maps');
            view.setHTML(noMapsMessage, 'No maps currently saved. Please use the Level Editor to create custom Maps');
            view.append(levelsWrapper, noMapsMessage);
          }
        })
        .catch(function(err) {
          console.error('Failed to fetch levels:', err);
          var noMapsMessage = view.create('div');
          view.addClass(noMapsMessage, 'no-maps');
          view.setHTML(noMapsMessage, 'Error fetching levels. Please try again later.');
          view.append(levelsWrapper, noMapsMessage);
        });
    };

    this.deleteAllMaps = function() {
      fetch('http://localhost:3000/api/levels', { method: 'DELETE' })
        .then(function(res) {
          if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
          }
          that.removeCreatedLevelsScreen();
          that.init();
        })
        .catch(function(err) {
          console.error('Failed to delete levels:', err);
          alert('Error deleting levels. Please try again.');
        });
    };

    this.startLevel = function(levelId) {
      var marioMakerInstance = MarioMaker.getInstance();
      console.log('Fetching level with ID:', levelId);
      if (!/^[0-9a-fA-F]{24}$/.test(levelId)) {
        console.error('Invalid levelId:', levelId);
        alert('Error: Invalid level ID.');
        return;
      }
      fetch(`http://localhost:3000/api/levels/${levelId}`)
        .then(function(res) {
          if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
          }
          return res.json();
        })
        .then(function(data) {
          if (data.map) {
            var map = { [marioMakerInstance.currentLevel || 1]: JSON.stringify(data.map) };
            marioMakerInstance.startGame(map);
          } else {
            console.error('Invalid level data:', data);
            alert('Error: Invalid level data.');
          }
        })
        .catch(function(err) {
          console.error('Failed to fetch level:', err);
          alert('Error loading level. Please try again.');
        });
    };

    this.showCreatedLevelsScreen = function() {
      if (!levelsWrapper) {
        console.warn('levelsWrapper is undefined, attempting to reinitialize');
        that.init();
        if (!levelsWrapper) {
          console.error('Reinitialization failed: levelsWrapper is still undefined');
          return;
        }
      }
      view.style(levelsWrapper, { display: 'block' });
      that.showLevels();
    };

    this.removeCreatedLevelsScreen = function() {
      if (levelsWrapper) {
        view.style(levelsWrapper, { display: 'none' });
        while (levelsWrapper.hasChildNodes()) {
          view.remove(levelsWrapper, levelsWrapper.lastChild);
        }
      } else {
        console.warn('levelsWrapper is undefined, cannot remove created levels screen');
      }
    };
  }

  return {
    getInstance: function() {
      if (!instance) instance = new CreatedLevels();
      return instance;
    }
  };
})();
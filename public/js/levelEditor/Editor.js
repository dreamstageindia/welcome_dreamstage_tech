// public/js/levelEditor/Editor.js

function Editor() {
  var view = View.getInstance();
  var mainWrapper, viewPort, gameWorld, grid, elementWrapper;
  var map, maxWidth, height = 480, tileSize = 32, scrollMargin = 0;
  var selectedElement = [];
  var that = this;

  this.init = function() {
    mainWrapper = view.getMainWrapper();
    viewPort = view.create('div');
    view.addClass(viewPort, 'editor-screen');
    view.style(viewPort, { display: 'block' });
    view.append(mainWrapper, viewPort);

    that.createLevelEditor();
    that.drawGrid(3840);
    that.showElements();
  };

  this.createLevelEditor = function() {
    var rightArrow = view.create('div'),
        leftArrow  = view.create('div');
    gameWorld = view.create('div');

    view.style(gameWorld, { width: 6400 + 'px', height: height + 'px' });
    view.addClass(rightArrow, 'right-arrow');
    view.addClass(leftArrow,  'left-arrow');

    view.append(viewPort, rightArrow);
    view.append(viewPort, leftArrow);
    view.append(viewPort, gameWorld);

    rightArrow.addEventListener('click', that.rightScroll);
    leftArrow .addEventListener('click', that.leftScroll);
  };

  this.drawGrid = function(width) {
    maxWidth = width;
    grid = view.create('table');
    var rows = height / tileSize, cols = maxWidth / tileSize, mousedown = false;

    for (var r = 0; r < rows; r++) {
      var tr = view.create('tr');
      for (var c = 0; c < cols; c++) {
        var td = view.create('td');
        view.addClass(td, 'cell');

        td.onmousedown = function(e) {
          e.preventDefault();
          selectedElement.push(this);
          view.addClass(this, 'active');
          mousedown = true;
        };
        td.onmouseover = function() {
          if (mousedown) {
            selectedElement.push(this);
            view.addClass(this, 'active');
          }
        };
        td.onmouseup = function() { mousedown = false; };

        view.append(tr, td);
      }
      grid.onmouseleave = function() { mousedown = false; };
      view.append(grid, tr);
    }

    view.append(gameWorld, grid);
  };

  this.showElements = function() {
    elementWrapper = view.create('div');
    view.addClass(elementWrapper, 'element-wrapper');
    view.style(elementWrapper, { display: 'block' });
    view.append(mainWrapper, elementWrapper);

    var elems = ['cell','platform','coin-box','power-up-box','useless-box',
                 'flag','flag-pole','pipe-left','pipe-right','pipe-top-left',
                 'pipe-top-right','goomba'];
    elems.forEach(function(cls) {
      var d = view.create('div');
      view.addClass(d, cls);
      view.append(elementWrapper, d);
      d.onclick = function() { that.drawElement(cls); };
    });

    // control buttons
    var lvlSizeBtn = view.create('div'); view.addClass(lvlSizeBtn, 'lvl-size');
    var smallBtn   = view.create('button'); view.addClass(smallBtn, 'grid-small-btn');
    var medBtn     = view.create('button'); view.addClass(medBtn,   'grid-medium-btn');
    var largeBtn   = view.create('button'); view.addClass(largeBtn, 'grid-large-btn');
    var clearBtn   = view.create('button'); view.addClass(clearBtn, 'clear-map-btn');
    var saveBtn    = view.create('button'); view.addClass(saveBtn,   'save-map-btn');

    view.append(elementWrapper, lvlSizeBtn);
    view.append(elementWrapper, smallBtn);
    view.append(elementWrapper, medBtn);
    view.append(elementWrapper, largeBtn);
    view.append(elementWrapper, clearBtn);
    view.append(elementWrapper, saveBtn);

    smallBtn.onclick = that.gridSmall;
    medBtn.onclick   = that.gridMedium;
    largeBtn.onclick = that.gridLarge;
    clearBtn.onclick = that.resetEditor;
    saveBtn.onclick  = that.saveMap;
  };

  that.gridSmall = function() {
    view.remove(gameWorld, grid);
    that.drawGrid(1280);
  };
  that.gridMedium = function() {
    view.remove(gameWorld, grid);
    that.drawGrid(3840);
  };
  that.gridLarge = function() {
    view.remove(gameWorld, grid);
    that.drawGrid(6400);
  };

  this.drawElement = function(cls) {
    selectedElement.forEach(function(cell) {
      view.addClass(cell, cls);
    });
    selectedElement = [];
  };

  that.generateMap = function() {
    var newMap = [], rows = grid.getElementsByTagName('tr');
    for (var r = 0; r < rows.length; r++) {
      var cols = rows[r].getElementsByTagName('td'), arr = [];
      for (var c = 0; c < cols.length; c++) {
        var cls = cols[c].className, v;
        switch (cls) {
          case 'platform':      v = 1;  break;
          case 'coin-box':      v = 2;  break;
          case 'power-up-box':  v = 3;  break;
          case 'useless-box':   v = 4;  break;
          case 'flag-pole':     v = 5;  break;
          case 'flag':          v = 6;  break;
          case 'pipe-left':     v = 7;  break;
          case 'pipe-right':    v = 8;  break;
          case 'pipe-top-left': v = 9;  break;
          case 'pipe-top-right':v = 10; break;
          case 'goomba':        v = 20; break;
          default:              v = 0;  break;
        }
        arr.push(v);
      }
      newMap.push(arr);
    }
    map = newMap;
  };

  // ←––––––– THE ONLY CHANGE –––––––→
  this.saveMap = function() {
    that.generateMap();
    var endpoint = 'http://localhost:3000/api/levels';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map: map })
    })
    .then(function(res) {
      if (!res.ok) throw new Error('Server responded ' + res.status);
      return res.json();
    })
    .then(function(data) {
      alert('Level saved! ID: ' + data._id);
    })
    .catch(function(err) {
      console.error('Save failed:', err);
      alert('Error saving level: ' + err.message);
    });
  };

  this.rightScroll = function() {
    if (scrollMargin > -(maxWidth - 1280)) {
      scrollMargin -= 160;
      view.style(gameWorld, { 'margin-left': scrollMargin + 'px' });
    }
  };
  this.leftScroll = function() {
    if (scrollMargin < 0) {
      scrollMargin += 160;
      view.style(gameWorld, { 'margin-left': scrollMargin + 'px' });
    }
  };

  this.resetEditor = function() {
    var rows = grid.getElementsByTagName('tr');
    for (var r = 0; r < rows.length; r++) {
      var cols = rows[r].getElementsByTagName('td');
      for (var c = 0; c < cols.length; c++) {
        view.addClass(cols[c], 'cell');
      }
    }
    selectedElement = [];
    scrollMargin = 0;
    view.style(gameWorld, { 'margin-left': '0px' });
  };

  this.removeEditorScreen = function() {
    view.style(viewPort,       { display: 'none' });
    view.style(elementWrapper, { display: 'none' });
    that.resetEditor();
  };
  this.showEditorScreen = function() {
    view.style(viewPort,       { display: 'block' });
    view.style(elementWrapper, { display: 'block' });
  };
}

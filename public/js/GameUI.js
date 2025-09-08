// public/js/GameUI.js
// Canvas elements for the main Mario game

var GameUI = (function() {
  var instance;

  function GameUI() {
    var canvas = document.getElementsByClassName('game-screen')[0];
    var ctx = canvas.getContext('2d');

    var that = this;

    this.setWidth = function(width) {
      canvas.width = width;
    };

    this.setHeight = function(height) {
      canvas.height = height;
    };

    this.getWidth = function() {
      return canvas.width;
    };

    this.getHeight = function() {
      return canvas.height;
    };

    this.getCanvas = function() {
      return canvas;
    };

    this.show = function() {
      canvas.style.display = 'block';
    };

    this.hide = function() {
      canvas.style.display = 'none';
    };

    this.clear = function(x, y, width, height) {
      ctx.clearRect(x, y, width, height);
    };

    this.scrollWindow = function(x, y) {
      ctx.translate(x, y);
    };

    // NOTE: use distinct param names to avoid shadowing
    this.draw = function(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
      ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
    };

    this.makeBox = function(x, y, width, height) {
      ctx.rect(x, y, width, height);
      ctx.fillStyle = 'black';
      ctx.fill();
    };

    // UPDATED: black text with grey shadow (applies to all canvas text)
    this.writeText = function(text, x, y) {
      ctx.font = '20px SuperMario256';
      // black text
      ctx.fillStyle = '#000000';
      // grey shadow
      ctx.shadowColor = 'rgba(128,128,128,0.9)';
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.shadowBlur = 0;

      ctx.fillText(text, x, y);

      // reset shadow so sprites/images aren't affected
      ctx.shadowColor = 'transparent';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
    };
  }

  return {
    getInstance: function() {
      if (instance == null) {
        instance = new GameUI();
      }
      return instance;
    }
  };
})();

function Mario() {
  var gameUI = GameUI.getInstance();

  // --- Tunables ---
  // Make this more negative for a higher jump.
  this.JUMP_IMPULSE = -38;   // was typically around -12 to -14
  this.AIR_JUMP_LOCK = true; // keep single-jump behavior

  this.type = 'small';
  this.x;
  this.y;
  this.width = 32;
  this.height = 44;
  this.speed = 0;
  this.velX = 0;
  this.velY = 0;
  this.jumping = false;
  this.grounded = false;
  this.invulnerable = false;
  this.sX = 0; // sprite x
  this.sY = 4; // sprite y
  this.frame = 0;

  var that = this;
  var marioSprite;

  this.init = function() {
    that.x = 10;
    that.y = gameUI.getHeight() - 40 - 40;

    marioSprite = new Image();
    marioSprite.src = 'images/mario-sprites.png';
  };

  // Call this from your input handler instead of setting velY directly
  this.jump = function() {
    if (that.AIR_JUMP_LOCK) {
      if (!that.jumping && that.grounded) {
        that.velY = that.JUMP_IMPULSE;
        that.jumping = true;
        that.grounded = false;
      }
    } else {
      // (optional) allow mid-air jump boosts
      that.velY = that.JUMP_IMPULSE;
      that.jumping = true;
      that.grounded = false;
    }
  };

  // Optional: quick way to scale jump height at runtime (e.g., powerups)
  this.setJumpHeight = function(multiplier) {
    // multiplier > 1 makes it higher; e.g., 1.2 = +20% jump height
    that.JUMP_IMPULSE = -Math.abs(that.JUMP_IMPULSE) * multiplier;
  };

  this.draw = function() {
    that.sX = that.width * that.frame;
    gameUI.draw(
      marioSprite,
      that.sX, that.sY,
      that.width, that.height,
      that.x, that.y,
      that.width, that.height
    );
  };

  this.checkMarioType = function() {
    if (that.type == 'big') {
      that.height = 60;

      //big mario sprite position
      if (that.invulnerable) {
        that.sY = 276; //if invulnerable, show transparent mario
      } else {
        that.sY = 90;
      }
    } else if (that.type == 'small') {
      that.height = 44;

      //small mario sprite
      if (that.invulnerable) {
        that.sY = 222; //if invulnerable, show transparent mario
      } else {
        that.sY = 4;
      }
    } else if (that.type == 'fire') {
      that.height = 60;

      //fire mario sprite
      that.sY = 150;
    }
  };

  this.resetPos = function() {
    var canv = gameUI.getCanvas();
    that.x = canv.width  / 10;
    that.y = canv.height - 40;
    that.frame = 0;
  };
}

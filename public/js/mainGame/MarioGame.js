// Main Class of Mario Game

function MarioGame() {
  var gameUI = GameUI.getInstance();

  var maxWidth; // width of the game world
  var height;
  var viewPort; // width of canvas, viewport that can be seen
  var tileSize;
  var map;
  var originalMaps;

  var translatedDist; // distance translated as Mario moves to the right
  var centerPos;      // center position of the viewPort
  var marioInGround;

  // instances
  var mario;
  var element;
  var gameSound;
  var score;

  var keys = [];
  var goombas;
  var powerUps;
  var bullets;
  var bulletFlag = false;

  var currentLevel;

  var animationID;
  var timeOutId;

  var tickCounter     = 0;  // for animating Mario
  var maxTick         = 25; // max number for ticks to show Mario sprite
  var instructionTick = 0;  // showing control instructions counter
  var that = this;

  this.onLevelComplete = null;

  this.init = function(levelMaps, level) {
    height = 480;
    maxWidth = 0;
    viewPort = 1280;
    tileSize = 32;
    translatedDist = 0;
    goombas = [];
    powerUps = [];
    bullets = [];

    gameUI.setWidth(viewPort);
    gameUI.setHeight(height);
    gameUI.show();

    currentLevel = level;
    originalMaps = levelMaps;
    map = JSON.parse(levelMaps[currentLevel]);

    if (!score) {
      score = new Score();
      score.init();
    }
    score.displayScore();
    score.updateLevelNum(currentLevel);

    if (!mario) {
      mario = new Mario();
      mario.init();
    } else {
      mario.x = 10;
      mario.frame = 0;
    }

    element = new Element();
    gameSound = new GameSound();
    gameSound.init();

    that.calculateMaxWidth();
    that.bindKeyPress();
    that.startGame();
  };

  // FIX: compute world width correctly
  that.calculateMaxWidth = function() {
    maxWidth = 0;
    for (var row = 0; row < map.length; row++) {
      var rowWidth = map[row].length * tileSize;
      if (rowWidth > maxWidth) maxWidth = rowWidth;
    }
  };

  that.bindKeyPress = function() {
    var canvas = gameUI.getCanvas(); // for touch events

    // keyboard binding
    document.body.addEventListener('keydown', function(e) {
      keys[e.keyCode] = true;
    });
    document.body.addEventListener('keyup',   function(e) {
      keys[e.keyCode] = false;
    });

    // helper to normalize touch X to base 1280 space
    function normX(touch) {
      var rect = canvas.getBoundingClientRect();
      var xClamped = Math.max(rect.left, Math.min(touch.clientX, rect.right));
      var rel = (xClamped - rect.left) / rect.width; // 0..1
      return rel * 1280;
    }

    // preventDefault only for single-finger control, not for pinch
    function isMultiTouch(e) {
      var t = e.touches || e.changedTouches;
      return t && t.length > 1;
    }

    // touch binding on the canvas
    canvas.addEventListener('touchstart', function(e) {
      if (isMultiTouch(e)) return; // let pinch-zoom work
      e.preventDefault();
      var touches = e.changedTouches;
      for (var i = 0; i < touches.length; i++) {
        var x = normX(touches[i]);
        if (x <= 200)                      keys[37] = true;   // left
        if (x > 200 && x < 400)            keys[39] = true;   // right
        if (x > 640 && x <= 1080) { keys[16] = true; keys[17] = true; } // run & bullet
        if (x > 1080 && x < 1280)          keys[32] = true;   // jump
      }
    }, { passive: false });

    canvas.addEventListener('touchend', function(e) {
      if (isMultiTouch(e)) return;
      e.preventDefault();
      var touches = e.changedTouches;
      for (var i = 0; i < touches.length; i++) {
        var x = normX(touches[i]);
        if (x <= 200)                      keys[37] = false;
        if (x > 200 && x <= 640)           keys[39] = false;
        if (x > 640 && x <= 1080) { keys[16] = false; keys[17] = false; }
        if (x > 1080 && x < 1280)          keys[32] = false;
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function(e) {
      if (isMultiTouch(e)) return;
      e.preventDefault();
      var touches = e.changedTouches;
      for (var i = 0; i < touches.length; i++) {
        var x = normX(touches[i]);
        if (x <= 200)                      { keys[37] = true;  keys[39] = false; }
        if (x > 200 && x < 400)            { keys[39] = true;  keys[37] = false; }
        if (x > 640 && x <= 1080)          { keys[16] = true;  keys[32] = false; }
        if (x > 1080 && x < 1280)          { keys[32] = true;  keys[16] = false; keys[17] = false; }
      }
    }, { passive: false });

    // on-screen button controls (mobile)
    const btnLeft  = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnJump  = document.getElementById('btn-jump');

    if (btnLeft) {
      btnLeft.addEventListener('touchstart', function(e) { e.preventDefault(); keys[37] = true;  }, { passive: false });
      btnLeft.addEventListener('touchend',   function(e) { e.preventDefault(); keys[37] = false; }, { passive: false });
    }
    if (btnRight) {
      btnRight.addEventListener('touchstart', function(e) { e.preventDefault(); keys[39] = true;  }, { passive: false });
      btnRight.addEventListener('touchend',   function(e) { e.preventDefault(); keys[39] = false; }, { passive: false });
    }
    if (btnJump) {
      btnJump.addEventListener('touchstart', function(e) { e.preventDefault(); keys[38] = true;  }, { passive: false });
      btnJump.addEventListener('touchend',   function(e) { e.preventDefault(); keys[38] = false; }, { passive: false });
    }
  };

  // Main Game Loop
  this.startGame = function() {
    animationID = window.requestAnimationFrame(that.startGame);
    gameUI.clear(0, 0, maxWidth, height);

    that.renderMap();

    for (var i = 0; i < powerUps.length; i++) {
      powerUps[i].draw();
      powerUps[i].update();
    }
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].draw();
      bullets[i].update();
    }
    for (var i = 0; i < goombas.length; i++) {
      goombas[i].draw();
      goombas[i].update();
    }

    that.checkPowerUpMarioCollision();
    that.checkBulletEnemyCollision();
    that.checkEnemyMarioCollision();

    mario.draw();
    that.updateMario();
    that.wallCollision();
    marioInGround = mario.grounded;
  };

  this.renderMap = function() {
    mario.grounded = false;
    for (var i = 0; i < powerUps.length; i++) powerUps[i].grounded = false;
    for (var i = 0; i < goombas.length;  i++) goombas[i].grounded  = false;

    for (var row = 0; row < map.length; row++) {
      for (var column = 0; column < map[row].length; column++) {
        switch (map[row][column]) {
          case 1: // platform
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.platform();
            element.draw();
            that.checkElementMarioCollision(element, row, column);
            that.checkElementPowerUpCollision(element);
            that.checkElementEnemyCollision(element);
            that.checkElementBulletCollision(element);
            break;

          case 2: // coinBox
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.coinBox();
            element.draw();
            that.checkElementMarioCollision(element, row, column);
            that.checkElementPowerUpCollision(element);
            that.checkElementEnemyCollision(element);
            that.checkElementBulletCollision(element);
            break;

          case 3: // powerUp Box
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.powerUpBox();
            element.draw();
            that.checkElementMarioCollision(element, row, column);
            that.checkElementPowerUpCollision(element);
            that.checkElementEnemyCollision(element);
            that.checkElementBulletCollision(element);
            break;

          case 4: // uselessBox
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.uselessBox();
            element.draw();
            that.checkElementMarioCollision(element, row, column);
            that.checkElementPowerUpCollision(element);
            that.checkElementEnemyCollision(element);
            that.checkElementBulletCollision(element);
            break;

          case 5: // flagPole
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.flagPole();
            element.draw();
            that.checkElementMarioCollision(element, row, column);
            break;

          case 6: // flag
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.flag();
            element.draw();
            break;

          case 7: // pipeLeft
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.pipeLeft();
            element.draw();
            that.checkElementMarioCollision(element, row, column);
            that.checkElementPowerUpCollision(element);
            that.checkElementEnemyCollision(element);
            that.checkElementBulletCollision(element);
            break;

          case 8: // pipeRight
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.pipeRight();
            element.draw();
            that.checkElementMarioCollision(element, row, column);
            that.checkElementPowerUpCollision(element);
            that.checkElementEnemyCollision(element);
            that.checkElementBulletCollision(element);
            break;

          case 9: // pipeTopLeft
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.pipeTopLeft();
            element.draw();
            that.checkElementMarioCollision(element, row, column);
            that.checkElementPowerUpCollision(element);
            that.checkElementEnemyCollision(element);
            that.checkElementBulletCollision(element);
            break;

          case 10: // pipeTopRight
            element.x = column * tileSize;
            element.y = row * tileSize;
            element.pipeTopRight();
            element.draw();
            that.checkElementMarioCollision(element, row, column);
            that.checkElementPowerUpCollision(element);
            that.checkElementEnemyCollision(element);
            that.checkElementBulletCollision(element);
            break;

          case 20: // goomba
            var enemy = new Enemy();
            enemy.x = column * tileSize;
            enemy.y = row * tileSize;
            enemy.goomba();
            enemy.draw();
            goombas.push(enemy);
            map[row][column] = 0;
            break;
        }
      }
    }
  };

  this.collisionCheck = function(objA, objB) {
    var vX = objA.x + objA.width/2  - (objB.x + objB.width/2);
    var vY = objA.y + objA.height/2 - (objB.y + objB.height/2);
    var hWidths  = objA.width/2  + objB.width/2;
    var hHeights = objA.height/2 + objB.height/2;
    var collisionDirection = null;

    if (Math.abs(vX) < hWidths && Math.abs(vY) < hHeights) {
      var offsetX = hWidths  - Math.abs(vX);
      var offsetY = hHeights - Math.abs(vY);

      if (offsetX >= offsetY) {
        if (vY > 0 && vY < 37) {
          collisionDirection = 't';
          if (objB.type != 5) objA.y += offsetY;
        } else if (vY < 0) {
          collisionDirection = 'b';
          if (objB.type != 5) objA.y -= offsetY;
        }
      } else {
        if (vX > 0) {
          collisionDirection = 'l';
          objA.x += offsetX;
        } else {
          collisionDirection = 'r';
          objA.x -= offsetX;
        }
      }
    }
    return collisionDirection;
  };

  this.checkElementMarioCollision = function(element, row, column) {
    var c = that.collisionCheck(mario, element);
    if (c === 'l' || c === 'r') {
      mario.velX = 0;
      mario.jumping = false;
      if (element.type === 5) that.levelFinish(c);
    } else if (c === 'b') {
      if (element.type !== 5) {
        mario.grounded = true;
        mario.jumping = false;
      }
    } else if (c === 't') {
      if (element.type !== 5) mario.velY *= -1;
      if (element.type === 3) {
        var pu = new PowerUp();
        if (mario.type === 'small') pu.mushroom(element.x, element.y);
        else pu.flower(element.x, element.y);
        powerUps.push(pu);
        map[row][column] = 4;
        gameSound.play('powerUpAppear');
      }
      if (element.type === 2) {
        score.coinScore++;
        score.totalScore += 100;
        score.updateCoinScore();
        score.updateTotalScore();
        map[row][column] = 4;
        gameSound.play('coin');
      }
    }
  };

  this.checkElementPowerUpCollision = function(element) {
    for (var i = 0; i < powerUps.length; i++) {
      var c = that.collisionCheck(powerUps[i], element);
      if (c === 'l' || c === 'r') powerUps[i].velX *= -1;
      else if (c === 'b') powerUps[i].grounded = true;
    }
  };

  this.checkElementEnemyCollision = function(element) {
    for (var i = 0; i < goombas.length; i++) {
      if (goombas[i].state !== 'deadFromBullet') {
        var c = that.collisionCheck(goombas[i], element);
        if (c === 'l' || c === 'r') goombas[i].velX *= -1;
        else if (c === 'b') goombas[i].grounded = true;
      }
    }
  };

  this.checkElementBulletCollision = function(element) {
    for (var i = 0; i < bullets.length; i++) {
      var c = that.collisionCheck(bullets[i], element);
      if (c === 'b') bullets[i].grounded = true;
      else if (c === 't' || c === 'l' || c === 'r') bullets.splice(i, 1);
    }
  };

  this.checkPowerUpMarioCollision = function() {
    for (var i = 0; i < powerUps.length; i++) {
      var c = that.collisionCheck(powerUps[i], mario);
      if (c) {
        if (powerUps[i].type === 30 && mario.type === 'small') mario.type = 'big';
        else if (powerUps[i].type === 31) mario.type = 'fire';
        powerUps.splice(i, 1);
        score.totalScore += 1000;
        score.updateTotalScore();
        gameSound.play('powerUp');
      }
    }
  };

  this.checkEnemyMarioCollision = function() {
    for (var i = 0; i < goombas.length; i++) {
      var g = goombas[i];
      if (!mario.invulnerable && g.state !== 'dead' && g.state !== 'deadFromBullet') {
        var c = that.collisionCheck(g, mario);
        if (c === 't') {
          g.state = 'dead';
          mario.velY = -mario.speed;
          score.totalScore += 1000;
          score.updateTotalScore();
          gameSound.play('killEnemy');
        } else if (c === 'l' || c === 'r' || c === 'b') {
          g.velX *= -1;
          if (mario.type === 'big' || mario.type === 'fire') {
            mario.type = (mario.type === 'big' ? 'small' : 'big');
            mario.invulnerable = true;
            gameSound.play('powerDown');
            setTimeout(function(){ mario.invulnerable = false; }, 1000);
          } else {
            that.pauseGame();
            mario.frame = 13;
            score.lifeCount--;
            score.updateLifeCount();
            gameSound.play('marioDie');
            timeOutId = setTimeout(function() {
              if (score.lifeCount === 0) that.gameOver();
              else that.resetGame();
            }, 3000);
            break;
          }
        }
      }
    }
  };

  this.checkBulletEnemyCollision = function() {
    for (var i = 0; i < goombas.length; i++) {
      for (var j = 0; j < bullets.length; j++) {
        var g = goombas[i];
        if (g && g.state !== 'dead') {
          var c = that.collisionCheck(g, bullets[j]);
          if (c) {
            bullets.splice(j, 1);
            g.state = 'deadFromBullet';
            score.totalScore += 1000;
            score.updateTotalScore();
            gameSound.play('killEnemy');
          }
        }
      }
    }
  };

  this.wallCollision = function() {
    if (mario.x >= maxWidth - mario.width) mario.x = maxWidth - mario.width;
    else if (mario.x <= translatedDist) mario.x = translatedDist + 1;

    if (mario.y >= height) {
      that.pauseGame();
      gameSound.play('marioDie');
      score.lifeCount--;
      score.updateLifeCount();
      timeOutId = setTimeout(function() {
        if (score.lifeCount === 0) that.gameOver();
        else that.resetGame();
      }, 3000);
    }
  };

  this.updateMario = function() {
    var friction = 0.9;
    var gravity  = 0.2;

    mario.checkMarioType();

    if (keys[38] || keys[32]) {
      if (!mario.jumping && mario.grounded) {
        mario.jumping = true;
        mario.grounded = false;
        mario.velY = -(mario.speed / 2 + 6);
        if (mario.frame === 0 || mario.frame === 1) mario.frame = 3;
        else if (mario.frame === 8 || mario.frame === 9) mario.frame = 2;
        gameSound.play('jump');
      }
    }

    if (keys[39]) {
      that.checkMarioPos();
      if (mario.velX < mario.speed) mario.velX++;
      if (!mario.jumping) {
        tickCounter++;
        if (tickCounter > maxTick / mario.speed) {
          tickCounter = 0;
          mario.frame = (mario.frame !== 1 ? 1 : 0);
        }
      }
    }

    if (keys[37]) {
      if (mario.velX > -mario.speed) mario.velX--;
      if (!mario.jumping) {
        tickCounter++;
        if (tickCounter > maxTick / mario.speed) {
          tickCounter = 0;
          mario.frame = (mario.frame !== 9 ? 9 : 8);
        }
      }
    }

    mario.speed = keys[16] ? 4.5 : 3;

    if (keys[17] && mario.type === 'fire') {
      if (!bulletFlag) {
        bulletFlag = true;
        var bullet = new Bullet();
        var direction = (mario.frame === 9 || mario.frame === 8 || mario.frame === 2) ? -1 : 1;
        bullet.init(mario.x, mario.y, direction);
        bullets.push(bullet);
        gameSound.play('bullet');
        setTimeout(function(){ bulletFlag = false; }, 500);
      }
    }

    if (mario.velX > 0 && mario.velX < 1 && !mario.jumping) mario.frame = 0;
    else if (mario.velX > -1 && mario.velX < 0 && !mario.jumping) mario.frame = 8;

    if (mario.grounded) {
      mario.velY = 0;
      if (mario.frame === 3) mario.frame = 0;
      else if (mario.frame === 2) mario.frame = 8;
    }

    mario.velX *= friction;
    mario.velY += gravity;
    mario.x += mario.velX;
    mario.y += mario.velY;
  };

  this.checkMarioPos = function() {
    centerPos = translatedDist + viewPort / 2;
    if (mario.x > centerPos && centerPos + viewPort / 2 < maxWidth) {
      gameUI.scrollWindow(-mario.speed, 0);
      translatedDist += mario.speed;
    }
  };

  this.levelFinish = function(collisionDirection) {
    if (collisionDirection === 'r') {
      mario.x += 10;
      mario.velY = 2;
      mario.frame = 11;
    } else if (collisionDirection === 'l') {
      mario.x -= 32;
      mario.velY = 2;
      mario.frame = 10;
    }

    if (marioInGround) {
      mario.x += 20;
      mario.frame = 10;
      tickCounter++;
      if (tickCounter > maxTick) {
        that.pauseGame();
        mario.x += 10;
        tickCounter = 0;
        mario.frame = 12;
        gameSound.play('stageClear');
        timeOutId = setTimeout(function() {
          if (that.onLevelComplete) {
            that.onLevelComplete();
          } else {
            that.gameOver();
          }
        }, 5000);
      }
    }
  };

  this.pauseGame = function() {
    window.cancelAnimationFrame(animationID);
  };

  this.gameOver = function() {
    score.gameOverView();
    gameUI.makeBox(0, 0, maxWidth, height);
    gameUI.writeText('Game Over',      centerPos - 80, height - 300);
    gameUI.writeText('Thanks For Playing', centerPos - 122, height / 2);
  };

  this.resetGame = function() {
    that.clearInstances();
    that.init(originalMaps, currentLevel);
  };

  this.clearInstances = function() {
    mario      = null;
    element    = null;
    gameSound  = null;
    goombas    = [];
    bullets    = [];
    powerUps   = [];
  };

  this.clearTimeOut = function() {
    clearTimeout(timeOutId);
  };

  this.removeGameScreen = function() {
    gameUI.hide();
    if (score) score.hideScore();
  };

  this.showGameScreen = function() {
    gameUI.show();
  };
}

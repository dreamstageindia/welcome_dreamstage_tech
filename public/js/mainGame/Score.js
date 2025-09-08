// public/js/Score.js
function Score() {
  var view = View.getInstance();

  var mainWrapper;
  var scoreWrapper;
  var coinScoreWrapper;
  var totalScoreWrapper;
  var lifeCountWrapper;
  var levelWrapper;

  this.coinScore;
  this.totalScore;
  this.lifeCount;

  var that = this;

  // helper: apply text color + shadow to an element
  function setTextStyles(el, color, shadow) {
    if (!el) return;
    view.style(el, {
      color: color,
      textShadow: shadow,
      fontFamily: 'SuperMario256, Arial, sans-serif'
    });
  }

  // apply the default (black text with grey shadow) to all score labels
  function applyDefaultTextStyles() {
    var color = '#000000';
    var shadow = '1px 1px 0 rgba(128,128,128,0.9)';
    setTextStyles(scoreWrapper,      color, shadow);
    setTextStyles(coinScoreWrapper,  color, shadow);
    setTextStyles(totalScoreWrapper, color, shadow);
    setTextStyles(lifeCountWrapper,  color, shadow);
    setTextStyles(levelWrapper,      color, shadow);
  }

  this.init = function() {
    that.coinScore = 0;
    that.totalScore = 0;
    that.lifeCount = 5;

    mainWrapper = view.getMainWrapper();

    scoreWrapper      = view.create('div');
    coinScoreWrapper  = view.create('div');
    totalScoreWrapper = view.create('div');
    lifeCountWrapper  = view.create('div');
    levelWrapper      = view.create('div');

    view.addClass(scoreWrapper,      'score-wrapper');
    view.addClass(coinScoreWrapper,  'coin-score');
    view.addClass(totalScoreWrapper, 'total-score');
    view.addClass(lifeCountWrapper,  'life-count');
    view.addClass(levelWrapper,      'level-num');

    // DOM structure: [level, lives, coins, score] inside score bar
    view.append(scoreWrapper, levelWrapper);
    view.append(scoreWrapper, lifeCountWrapper);
    view.append(scoreWrapper, coinScoreWrapper);
    view.append(scoreWrapper, totalScoreWrapper);
    view.append(mainWrapper,  scoreWrapper);

    // ensure text styles (black + grey shadow) on creation
    applyDefaultTextStyles();

    that.updateCoinScore();
    that.updateTotalScore();
    that.updateLifeCount();
    that.updateLevelNum(1);
  };

  this.updateCoinScore = function() {
    if (that.coinScore == 100) {
      that.coinScore = 0;
      that.lifeCount++;
      that.updateLifeCount();
    }
    view.setHTML(coinScoreWrapper, 'Coins: ' + that.coinScore);
  };

  this.updateTotalScore = function() {
    view.setHTML(totalScoreWrapper, 'Score: ' + that.totalScore);
  };

  this.updateLifeCount = function() {
    view.setHTML(lifeCountWrapper, 'x ' + that.lifeCount);
  };

  this.updateLevelNum = function(level) {
    view.setHTML(levelWrapper, 'Level: ' + level);
  };

  this.displayScore = function() {
    // show bar with default sky-blue background and keep text styles enforced
    view.style(scoreWrapper, { display: 'block', background: '#add1f3' });
    applyDefaultTextStyles();
  };

  this.hideScore = function() {
    view.style(scoreWrapper, { display: 'none' });

    that.coinScore = 0;
    that.lifeCount = 5;
    that.totalScore = 0;
    that.updateCoinScore();
    that.updateTotalScore();
    that.updateLifeCount();
  };

  this.gameOverView = function() {
    // switch to black background and invert text to white for contrast
    view.style(scoreWrapper, { background: 'black' });
    var color = '#ffffff';
    var shadow = '1px 1px 0 rgba(0,0,0,0.9)';
    setTextStyles(scoreWrapper,      color, shadow);
    setTextStyles(coinScoreWrapper,  color, shadow);
    setTextStyles(totalScoreWrapper, color, shadow);
    setTextStyles(lifeCountWrapper,  color, shadow);
    setTextStyles(levelWrapper,      color, shadow);
  };
}

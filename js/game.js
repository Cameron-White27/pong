// =============================================================
// Canvas
// =============================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// =============================================================
// Settings
// =============================================================

// Ball (drawn as an arrow)
const startSpeed = 6; // speed at the start of each point
const speedUp = 1; // speed added by each normal hit
const maxSpeed = 20; // speed cap for normal hits
const serveAngle = 30; // largest sideways lean of a serve, in degrees
const bounceAngle = 60; // return angle off the very end of a paddle, in degrees

// Paddles (drawn as shields)
const paddleStartSpeed = 4; // speed on the first frame a key is held
const paddleSpeedUp = 1.05; // speed multiplier for each frame the key stays held
const paddleMaxSpeed = 14;
const paddleWidth = 140; // the shield image is stretched to fill this box,
const paddleHeight = 70; // and the box is also the hitbox
const paddleY = canvas.height - paddleHeight - 10;

// Warrior buff: given to a player who is behind by buffBehindBy points or more
const buffBehindBy = 2;
const buffPaddleWidth = 200;
const buffSpeedUp = 3; // used instead of speedUp on buffed hits
const buffMaxSpeed = 30; // used instead of maxSpeed on buffed hits; the next
// normal hit caps the speed back down to maxSpeed

// Scoring: first to winScore, but a player must lead by winBy to win
const winScore = 11;
const winBy = 2;

// =============================================================
// Images and sounds
// =============================================================

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

// True once an image has finished loading without errors
function isLoaded(image) {
  return image.complete && image.naturalWidth > 0;
}

const images = {
  background: loadImage("assets/images/background.jpg"),
  ball: loadImage("assets/images/ball.png"),
  leftShield: loadImage("assets/images/leftShield.png"),
  rightShield: loadImage("assets/images/rightShield.png"),
};

const sounds = {
  deflect: new Audio("assets/sounds/deflect.mp3"),
  score: new Audio("assets/sounds/score.mp3"),
  win: new Audio("assets/sounds/win.mp3"),
  music: new Audio("assets/sounds/battleMusic.mp3"),
};
sounds.music.loop = true;

// The arrow image points up and to the right, which is -45 degrees on the
// canvas. drawBall subtracts this so the arrow faces the way it is moving.
const arrowImageAngle = -Math.PI / 4;

// Rewinds before playing so a sound that is still playing restarts
// instead of being skipped
function playSound(sound) {
  sound.currentTime = 0;
  sound.play();
}

// =============================================================
// Game objects and state
// =============================================================

const ball = {
  x: 0, // position and speed are set by resetBall
  y: 0,
  width: 30,
  height: 30,
  speedX: 0,
  speedY: 0,
  color: "yellow", // fallback if the image hasn't loaded
  image: images.ball,
};

// Builds a paddle centered in its half of the screen.
// settings holds everything that differs between the two players.
function createPaddle(settings) {
  const halfWidth = settings.sideEnd - settings.sideStart;
  return {
    ...settings,
    x: settings.sideStart + (halfWidth - paddleWidth) / 2,
    y: paddleY,
    width: paddleWidth,
    height: paddleHeight,
    speed: paddleStartSpeed,
    score: 0,
    buffed: false,
    color: "white", // fallback if the image hasn't loaded
  };
}

const leftPaddle = createPaddle({
  name: "Player 1",
  side: "left",
  sideStart: 0, // the paddle is kept between sideStart and sideEnd
  sideEnd: canvas.width / 2,
  leftKey: "a",
  rightKey: "d",
  image: images.leftShield,
  // The part of the image that contains the shield, without the empty border
  crop: { x: 6, y: 7, width: 193, height: 192 },
  turn: Math.PI / 2, // quarter turn clockwise so the shield lies on its side
});

const rightPaddle = createPaddle({
  name: "Player 2",
  side: "right",
  sideStart: canvas.width / 2,
  sideEnd: canvas.width,
  leftKey: "arrowleft",
  rightKey: "arrowright",
  image: images.rightShield,
  crop: { x: 11, y: 9, width: 173, height: 177 },
  turn: -Math.PI / 2, // quarter turn the other way, mirroring the left shield
});

const paddles = [leftPaddle, rightPaddle];

let sparks = [];
const heldKeys = new Set(); // lowercase names of the keys currently held down
let playing = false; // false while paused and before the first serve
let gameOver = false;
let winnerText = "";

// =============================================================
// Paddles
// =============================================================

// Axis-aligned rectangle overlap test between the ball and a paddle
function ballHitsPaddle(paddle) {
  return (
    ball.x < paddle.x + paddle.width &&
    ball.x + ball.width > paddle.x &&
    ball.y < paddle.y + paddle.height &&
    ball.y + ball.height > paddle.y
  );
}

// Keeps a paddle inside its own half, between the wall and the center line
function keepOnSide(paddle) {
  if (paddle.x < paddle.sideStart) {
    paddle.x = paddle.sideStart;
  }
  if (paddle.x > paddle.sideEnd - paddle.width) {
    paddle.x = paddle.sideEnd - paddle.width;
  }
}

// Moves a paddle based on its player's keys. Holding a key accelerates the
// paddle up to paddleMaxSpeed; releasing both keys resets its speed.
function movePaddle(paddle) {
  const leftHeld = heldKeys.has(paddle.leftKey);
  const rightHeld = heldKeys.has(paddle.rightKey);

  if (leftHeld) {
    paddle.x -= paddle.speed;
  }
  if (rightHeld) {
    paddle.x += paddle.speed;
  }
  keepOnSide(paddle);

  if (leftHeld || rightHeld) {
    paddle.speed = Math.min(paddle.speed * paddleSpeedUp, paddleMaxSpeed);
  } else {
    paddle.speed = paddleStartSpeed;
  }
}

// Changes a paddle's width while keeping its center in place
function setPaddleWidth(paddle, newWidth) {
  const center = paddle.x + paddle.width / 2;
  paddle.width = newWidth;
  paddle.x = center - newWidth / 2;
  keepOnSide(paddle);
}

// Gives the buff to a player who is far enough behind and removes it
// from a player who has caught up
function updateBuffs() {
  leftPaddle.buffed = rightPaddle.score - leftPaddle.score >= buffBehindBy;
  rightPaddle.buffed = leftPaddle.score - rightPaddle.score >= buffBehindBy;

  for (const paddle of paddles) {
    setPaddleWidth(paddle, paddle.buffed ? buffPaddleWidth : paddleWidth);
  }
}

// =============================================================
// Ball
// =============================================================

// Places the ball near the top center and serves it downward, leaning
// toward the given side ("left" or "right")
function resetBall(direction) {
  ball.x = canvas.width / 2 - ball.width / 2;
  ball.y = canvas.height / 3;

  // Random angle from straight down. The 10 degree minimum stops a serve
  // from dropping straight onto the center line.
  const angle = 10 + Math.random() * (serveAngle - 10);
  const radians = (angle * Math.PI) / 180;
  const sign = direction === "left" ? -1 : 1;

  ball.speedX = sign * Math.sin(radians) * startSpeed;
  ball.speedY = Math.cos(radians) * startSpeed;
}

// Sends the ball back up off a paddle. The hit position sets the angle:
// the center returns it straight up, the ends angle it up to bounceAngle.
function bounceOffPaddle(paddle) {
  const ballCenter = ball.x + ball.width / 2;
  const paddleCenter = paddle.x + paddle.width / 2;

  // -1 at the paddle's left end, 0 at its center, 1 at its right end
  let hitSpot = (ballCenter - paddleCenter) / (paddle.width / 2);
  hitSpot = Math.max(-1, Math.min(1, hitSpot));
  const radians = (hitSpot * bounceAngle * Math.PI) / 180;

  // Buffed hits add more speed and have a higher cap
  const gain = paddle.buffed ? buffSpeedUp : speedUp;
  const limit = paddle.buffed ? buffMaxSpeed : maxSpeed;
  const speed = Math.min(Math.hypot(ball.speedX, ball.speedY) + gain, limit);

  ball.speedX = Math.sin(radians) * speed;
  ball.speedY = -Math.cos(radians) * speed; // negative is upward

  // Move the ball above the paddle so it can't collide again next frame
  ball.y = paddle.y - ball.height;

  makeSparks(ballCenter, paddle.y, paddle.buffed);
  playSound(sounds.deflect);
}

// =============================================================
// Sparks
// =============================================================

// Adds a burst of sparks at (x, y). big is used for buffed hits.
function makeSparks(x, y, big) {
  const count = big ? 45 : 25;
  const colors = ["#ffffff", "#fff3b0", "#ffd34d", "#ff9a1f"];

  for (let i = 0; i < count; i++) {
    // Mostly upward, spread up to about 110 degrees to either side
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
    const speed = 2 + Math.random() * (big ? 9 : 6);
    const life = 15 + Math.random() * 25; // in frames

    sparks.push({
      x: x,
      y: y,
      speedX: Math.cos(angle) * speed,
      speedY: Math.sin(angle) * speed,
      life: life,
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 1.5 + Math.random() * 2,
    });
  }
}

// Moves each spark one frame, applying gravity and drag, and removes
// sparks whose life has run out
function updateSparks() {
  for (const spark of sparks) {
    spark.x += spark.speedX;
    spark.y += spark.speedY;
    spark.speedY += 0.35; // gravity
    spark.speedX *= 0.96; // drag
    spark.life--;
  }
  sparks = sparks.filter((spark) => spark.life > 0);
}

// Draws each spark as a streak that fades out over its life
function drawSparks() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter"; // overlapping sparks add up to brighter colors
  ctx.lineCap = "round";
  for (const spark of sparks) {
    ctx.globalAlpha = spark.life / spark.maxLife;
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = spark.size;
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    // The tail points back along the spark's path, so faster sparks leave longer streaks
    ctx.lineTo(spark.x - spark.speedX * 2, spark.y - spark.speedY * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// =============================================================
// Scoring
// =============================================================

// True if scoring the next point would win the game for player
function isMatchPoint(player, other) {
  return player.score + 1 >= winScore && player.score + 1 - other.score >= winBy;
}

function hasWon(player, other) {
  return player.score >= winScore && player.score - other.score >= winBy;
}

// Awards a point to scorer, then either ends the game or serves again
function pointScored(scorer, other) {
  scorer.score++;
  updateBuffs();

  if (hasWon(scorer, other)) {
    sounds.music.pause();
    playSound(sounds.win);
    gameOver = true;
    playing = false;
    winnerText = scorer.name + " wins!";
    return;
  }

  playSound(sounds.score);

  // Serve toward the player who lost the point, except on match point,
  // when the serve goes toward the player who is one point from winning
  let serveTo = other;
  if (isMatchPoint(leftPaddle, rightPaddle)) {
    serveTo = leftPaddle;
  }
  if (isMatchPoint(rightPaddle, leftPaddle)) {
    serveTo = rightPaddle;
  }
  resetBall(serveTo.side);
}

function newGame() {
  leftPaddle.score = 0;
  rightPaddle.score = 0;
  updateBuffs();
  sparks = [];
  gameOver = false;
  sounds.music.currentTime = 0;
  resetBall("right");
}

// Space: starts a new game after a win, otherwise pauses or unpauses.
// The music pauses and resumes along with the game.
function togglePlaying() {
  if (gameOver) {
    newGame();
  }
  playing = !playing;

  if (playing) {
    sounds.music.play();
  } else {
    sounds.music.pause();
  }
}

// =============================================================
// Update
// =============================================================

// Advances the game by one frame
function update() {
  for (const paddle of paddles) {
    movePaddle(paddle);
  }

  ball.x += ball.speedX;
  ball.y += ball.speedY;

  // The top and sides are walls. The ball is moved back inside and its
  // speed is pointed away from the wall, so it can't get stuck in one.
  if (ball.y < 0) {
    ball.y = 0;
    ball.speedY = Math.abs(ball.speedY);
  }
  if (ball.x < 0) {
    ball.x = 0;
    ball.speedX = Math.abs(ball.speedX);
  }
  if (ball.x > canvas.width - ball.width) {
    ball.x = canvas.width - ball.width;
    ball.speedX = -Math.abs(ball.speedX);
  }

  // Paddles only catch the ball on its way down
  if (ball.speedY > 0) {
    for (const paddle of paddles) {
      if (ballHitsPaddle(paddle)) {
        bounceOffPaddle(paddle);
        break;
      }
    }
  }

  updateSparks();

  // The ball fell off the bottom: the player whose half it landed in
  // missed it, so the other player scores
  if (ball.y > canvas.height) {
    const ballCenter = ball.x + ball.width / 2;
    if (ballCenter < canvas.width / 2) {
      pointScored(rightPaddle, leftPaddle);
    } else {
      pointScored(leftPaddle, rightPaddle);
    }
  }
}

// =============================================================
// Drawing
// =============================================================

// Draws a filled rectangle; used when an object's image hasn't loaded
function drawObject(obj) {
  ctx.fillStyle = obj.color;
  ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
}

// Draws a paddle's shield image on its side, cropped and stretched to fill
// the paddle's box. A buffed shield glows red.
function drawPaddle(paddle) {
  if (!isLoaded(paddle.image)) {
    drawObject(paddle);
    return;
  }

  ctx.save();
  if (paddle.buffed) {
    ctx.shadowColor = "red";
    ctx.shadowBlur = 30;
  }

  // Rotate around the paddle's center. After a quarter turn the image's
  // width runs vertically, so it is drawn paddle.height wide and paddle.width tall.
  ctx.translate(paddle.x + paddle.width / 2, paddle.y + paddle.height / 2);
  ctx.rotate(paddle.turn);
  const c = paddle.crop;
  ctx.drawImage(
    paddle.image,
    c.x, c.y, c.width, c.height, // source rectangle in the image
    -paddle.height / 2, -paddle.width / 2, paddle.height, paddle.width, // destination
  );
  ctx.restore();
}

// Draws the arrow rotated to point in its direction of travel
function drawBall() {
  if (!isLoaded(ball.image)) {
    drawObject(ball);
    return;
  }

  const flyingAngle = Math.atan2(ball.speedY, ball.speedX);

  ctx.save();

  // Glow around the arrow so it stands out against the background.
  // The shadow follows the image's transparent edges, so it outlines the arrow's shape.
  ctx.shadowColor = "white";
  ctx.shadowBlur = 15;

  ctx.translate(ball.x + ball.width / 2, ball.y + ball.height / 2);
  ctx.rotate(flyingAngle - arrowImageAngle);
  ctx.drawImage(ball.image, -ball.width / 2, -ball.height / 2, ball.width, ball.height);
  ctx.restore();
}

// Draws text centered on x
function drawText(text, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.font = size + "px Arial";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

// Draws the scores, buff labels and any on-screen message
function drawHud() {
  for (const paddle of paddles) {
    const centerX = (paddle.sideStart + paddle.sideEnd) / 2;
    drawText(paddle.score, centerX, 70, 50, "white");
    if (paddle.buffed) {
      drawText("WARRIOR BUFF", centerX, 105, 24, "red");
    }
  }

  const middleX = canvas.width / 2;
  const middleY = canvas.height / 2;

  if (!gameOver && (isMatchPoint(leftPaddle, rightPaddle) || isMatchPoint(rightPaddle, leftPaddle))) {
    drawText("MATCH POINT", middleX, 120, 30, "white");
  }

  if (gameOver) {
    drawText(winnerText, middleX, middleY - 30, 50, "white");
    drawText("Press Space to play again", middleX, middleY + 40, 50, "white");
  } else if (!playing) {
    drawText("Press Space", middleX, middleY, 50, "white");
  }
}

// Draws the whole frame
function draw() {
  // The background image is stretched to fill the canvas, covering the
  // previous frame. Black is used until the image has loaded.
  if (isLoaded(images.background)) {
    ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Center line, gray so the arrow stays visible when crossing it
  ctx.fillStyle = "gray";
  ctx.fillRect(canvas.width / 2 - 2, 0, 4, canvas.height);

  for (const paddle of paddles) {
    drawPaddle(paddle);
  }
  drawBall();
  drawSparks(); // last, so sparks appear on top
  drawHud();
}

// =============================================================
// Input
// =============================================================

// Keys are stored in lowercase so Caps Lock and Shift don't affect controls
document.addEventListener("keydown", function (event) {
  const key = event.key.toLowerCase();
  heldKeys.add(key);

  // event.repeat is true for the automatic repeats while a key is held,
  // so holding Space toggles only once
  if (key === " " && !event.repeat) {
    togglePlaying();
  }

  // Stop the arrow keys and Space from scrolling the page
  if (key === " " || key === "arrowleft" || key === "arrowright") {
    event.preventDefault();
  }
});

document.addEventListener("keyup", function (event) {
  heldKeys.delete(event.key.toLowerCase());
});

// Keyup events are missed while the window is out of focus, so forget all
// held keys to stop paddles from moving on their own afterwards
window.addEventListener("blur", function () {
  heldKeys.clear();
});

// =============================================================
// Start
// =============================================================

function gameLoop() {
  if (playing) {
    update();
  }
  draw();
}

resetBall("right");
setInterval(gameLoop, 1000 / 60); // 60 frames per second

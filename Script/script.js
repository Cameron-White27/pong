// Grab the canvas from the page and the 2D context we use to draw on it
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Settings for the ball
let startSpeed = 6; // how fast the ball moves when a point starts
let speedUp = 1; // added to the ball's speed every time a paddle hits it
let maxSpeed = 20; // the ball never goes faster than this off a normal hit
let serveAngle = 30; // the serve leans sideways by a random amount up to this many degrees
let bounceAngle = 60; // hitting the ball with the very end of a paddle sends it off at this angle

// Settings for the paddles
let paddleStartSpeed = 4; // how fast a paddle moves as soon as you press the key
let paddleSpeedUp = 1.05; // every frame you hold the key, the speed is multiplied by this
let paddleMaxSpeed = 14; // paddles never go faster than this

// Paddle size. The shields are drawn on their sides and stretched to fill this box,
// and the hitbox is exactly this box, so what you see is what you hit.
let paddleWidth = 140;
let paddleHeight = 70;
let paddleY = canvas.height - paddleHeight - 10;

// Warrior buff: a player who is behind by this many points or more gets the buff
let buffBehindBy = 2;
let buffPaddleWidth = 200; // the buffed shield is this wide
let buffSpeedUp = 3; // buffed hits add this much speed instead of speedUp
// Buffed hits are allowed past maxSpeed, up to this.
// When the other player hits it back, their normal hit drops it back to maxSpeed.
let buffMaxSpeed = 30;

// Sounds for game
let scoreSound = new Audio("SFX/score.mp3");
let winningSound = new Audio("SFX/winSound.mp3");

// Background music. loop = true makes it start over by itself when it ends.
let battleMusic = new Audio("SFX/battleMusic.mp3");
battleMusic.loop = true;

// Pictures for the ball and paddles
let ballImage = new Image();
ballImage.src = "WarriorsClashTheme/warriorsClash_Ball.png";
let leftPaddleImage = new Image();
leftPaddleImage.src = "WarriorsClashTheme/warriorsClash_Paddle1.png";
let rightPaddleImage = new Image();
rightPaddleImage.src = "WarriorsClashTheme/warriorsClash_Paddle2.png";

// The arrow picture points up and to the right, which is -45 degrees on the canvas
// (0 is pointing right, and negative angles go up). We need this to turn it the right way.
let arrowImageAngle = -Math.PI / 4;

// Plays a sound from the start, even if it's still playing from last time.
// Without rewinding, a second hit right after the first one would be silent.
function playSound(sound) {
  sound.currentTime = 0;
  sound.play();
}

// The ball
let ball = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  width: 30,
  height: 30,
  speedX: 0,
  speedY: startSpeed,
  color: "yellow", // only used if the picture hasn't loaded
  image: ballImage,
};

// Left paddle (Player 1), starts in the middle of the left half
let leftPaddle = {
  x: canvas.width / 4 - paddleWidth / 2,
  y: paddleY,
  width: paddleWidth,
  height: paddleHeight,
  sideStart: 0, // this paddle's half of the screen starts here...
  sideEnd: canvas.width / 2, // ...and ends at the middle line
  speed: paddleStartSpeed,
  score: 0,
  buffed: false,
  color: "white",
  image: leftPaddleImage,
  // The part of the picture that actually has the shield in it (no empty border),
  // so the drawn shield fills the hitbox edge to edge
  crop: { x: 6, y: 7, width: 193, height: 192 },
  turn: Math.PI / 2, // a quarter turn clockwise, so the top of the shield faces the middle
};

// Right paddle (Player 2), starts in the middle of the right half
let rightPaddle = {
  x: (canvas.width * 3) / 4 - paddleWidth / 2,
  y: paddleY,
  width: paddleWidth,
  height: paddleHeight,
  sideStart: canvas.width / 2, // starts at the middle line...
  sideEnd: canvas.width, // ...and ends at the right wall
  speed: paddleStartSpeed,
  score: 0,
  buffed: false,
  color: "white",
  image: rightPaddleImage,
  crop: { x: 11, y: 9, width: 173, height: 177 },
  turn: -Math.PI / 2, // a quarter turn the other way, so it mirrors the left shield
};

// All the sparks currently flying around
let sparks = [];

// true while that key is being held down
let aPressed = false;
let dPressed = false;
let leftPressed = false;
let rightPressed = false;

// false when the game is paused or hasn't started yet
let playing = false;

// First to 11 wins, but you have to win by 2
let winScore = 11;
let winBy = 2;
let gameOver = false;
let winnerText = "";

// Returns true if the ball is overlapping the paddle.
// It compares the edges of the two rectangles, so it works for either paddle.
function ballHitsPaddle(paddle) {
  return (
    ball.x < paddle.x + paddle.width &&
    ball.x + ball.width > paddle.x &&
    ball.y < paddle.y + paddle.height &&
    ball.y + ball.height > paddle.y
  );
}

// Keeps a paddle on its own half: it can't go past the wall or the middle line
function keepOnSide(paddle) {
  if (paddle.x < paddle.sideStart) {
    paddle.x = paddle.sideStart;
  }
  if (paddle.x > paddle.sideEnd - paddle.width) {
    paddle.x = paddle.sideEnd - paddle.width;
  }
}

// Moves a paddle left or right depending on which keys are held.
// The longer you hold a key, the faster the paddle moves.
function movePaddle(paddle, leftHeld, rightHeld) {
  if (leftHeld) {
    paddle.x -= paddle.speed;
  }
  if (rightHeld) {
    paddle.x += paddle.speed;
  }

  keepOnSide(paddle);

  if (leftHeld || rightHeld) {
    // A key is held, so speed the paddle up a little (up to the limit)
    paddle.speed *= paddleSpeedUp;
    if (paddle.speed > paddleMaxSpeed) {
      paddle.speed = paddleMaxSpeed;
    }
  } else {
    // No key is held, so reset the speed for next time
    paddle.speed = paddleStartSpeed;
  }
}

// Changes a paddle's width but keeps it centered where it was
function setPaddleWidth(paddle, newWidth) {
  let center = paddle.x + paddle.width / 2;
  paddle.width = newWidth;
  paddle.x = center - newWidth / 2;
  keepOnSide(paddle);
}

// Gives the warrior buff to whoever is far enough behind, and takes it away
// from anyone who has caught up
function updateBuffs() {
  leftPaddle.buffed = rightPaddle.score - leftPaddle.score >= buffBehindBy;
  rightPaddle.buffed = leftPaddle.score - rightPaddle.score >= buffBehindBy;

  for (let paddle of [leftPaddle, rightPaddle]) {
    if (paddle.buffed) {
      setPaddleWidth(paddle, buffPaddleWidth);
    } else {
      setPaddleWidth(paddle, paddleWidth);
    }
  }
}

// Draws a filled rectangle for anything with x, y, width, height and color
function drawObject(obj) {
  ctx.fillStyle = obj.color;
  ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
}

// Draws a shield lying on its side, stretched to fill the paddle's box
function drawPaddle(paddle) {
  ctx.save();

  // A buffed shield glows red
  if (paddle.buffed) {
    ctx.shadowColor = "red";
    ctx.shadowBlur = 30;
  }

  if (paddle.image.complete && paddle.image.naturalWidth > 0) {
    // Move to the middle of the paddle and turn the canvas a quarter turn.
    // After turning, the picture's width runs up and down and its height runs
    // left to right, so we draw it paddle.height wide and paddle.width tall.
    ctx.translate(paddle.x + paddle.width / 2, paddle.y + paddle.height / 2);
    ctx.rotate(paddle.turn);
    let c = paddle.crop;
    ctx.drawImage(
      paddle.image,
      c.x, c.y, c.width, c.height, // the part of the picture to use
      -paddle.height / 2, -paddle.width / 2, paddle.height, paddle.width, // where to put it
    );
  } else {
    drawObject(paddle); // picture not loaded yet, draw a plain rectangle
  }

  ctx.restore();
}

// Draws the arrow turned so its tip points the way it's flying.
function drawBall() {
  if (!(ball.image.complete && ball.image.naturalWidth > 0)) {
    drawObject(ball); // picture not loaded yet, draw a plain square
    return;
  }

  // Math.atan2 turns the ball's speed into the angle it's moving at
  let flyingAngle = Math.atan2(ball.speedY, ball.speedX);

  // Move the canvas to the middle of the ball, spin it, draw the arrow
  // centered there, then undo the move and spin so nothing else is affected
  ctx.save();
  ctx.translate(ball.x + ball.width / 2, ball.y + ball.height / 2);
  ctx.rotate(flyingAngle - arrowImageAngle);
  ctx.drawImage(ball.image, -ball.width / 2, -ball.height / 2, ball.width, ball.height);
  ctx.restore();
}

// Makes a burst of sparks at (x, y), like metal hitting metal.
// Buffed hits make a bigger burst.
function makeSparks(x, y, big) {
  let count = big ? 45 : 25;
  let colors = ["#ffffff", "#fff3b0", "#ffd34d", "#ff9a1f"];

  for (let i = 0; i < count; i++) {
    // Mostly upward, spread out up to about 110 degrees either side
    let angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
    let speed = 2 + Math.random() * (big ? 9 : 6);
    let life = 15 + Math.random() * 25; // how many frames it lasts

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

// Moves every spark one step and removes the ones that have burned out
function updateSparks() {
  for (let spark of sparks) {
    spark.x += spark.speedX;
    spark.y += spark.speedY;
    spark.speedY += 0.35; // gravity pulls them back down
    spark.speedX *= 0.96; // air slows them a little
    spark.life--;
  }
  sparks = sparks.filter((spark) => spark.life > 0);
}

// Draws each spark as a short glowing streak that fades as it dies
function drawSparks() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter"; // overlapping sparks add up and look brighter
  ctx.lineCap = "round";
  for (let spark of sparks) {
    ctx.globalAlpha = spark.life / spark.maxLife;
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = spark.size;
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    // The tail trails behind the way it came, so faster sparks make longer streaks
    ctx.lineTo(spark.x - spark.speedX * 2, spark.y - spark.speedY * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Puts the ball back in the middle and serves it downward.
// direction is "left" or "right", the player whose half the ball drifts toward.
function resetBall(direction) {
  ball.x = canvas.width / 2 - ball.width / 2;
  ball.y = canvas.height / 3;

  // Pick a random angle between 10 degrees and serveAngle.
  // 0 would be straight down; bigger numbers lean further to the side.
  let angle = 10 + Math.random() * (serveAngle - 10);

  // Convert to radians because Math.cos and Math.sin use radians
  let radians = (angle * Math.PI) / 180;

  // Use the angle to split the speed into sideways and downward movement
  ball.speedX = Math.sin(radians) * startSpeed;
  ball.speedY = Math.cos(radians) * startSpeed;

  // That math always leans the ball right, so flip it if it should go left
  if (direction == "left") {
    ball.speedX = -ball.speedX;
  }
}

// Sends the ball back up off a paddle.
// Where it lands on the paddle decides the angle: the middle sends it
// straight up, the ends send it off to the side. That's how you aim.
function bounceOffPaddle(paddle) {
  let ballCenter = ball.x + ball.width / 2;
  let paddleCenter = paddle.x + paddle.width / 2;

  // -1 at the far left end of the paddle, 0 in the middle, 1 at the far right end
  let hitSpot = (ballCenter - paddleCenter) / (paddle.width / 2);
  if (hitSpot < -1) hitSpot = -1;
  if (hitSpot > 1) hitSpot = 1;

  let radians = (hitSpot * bounceAngle * Math.PI) / 180;

  // Work out the ball's current speed and add some.
  // A buffed hit adds more and is allowed past maxSpeed.
  // A normal hit is capped at maxSpeed, so if a buffed hit sent the ball
  // faster than that, hitting it back brings it down to maxSpeed again.
  let speed = Math.sqrt(ball.speedX * ball.speedX + ball.speedY * ball.speedY);
  let limit;
  if (paddle.buffed) {
    speed += buffSpeedUp;
    limit = buffMaxSpeed;
  } else {
    speed += speedUp;
    limit = maxSpeed;
  }
  if (speed > limit) {
    speed = limit;
  }

  ball.speedX = Math.sin(radians) * speed;
  ball.speedY = -Math.cos(radians) * speed; // negative means up

  // Put the ball on top of the paddle so it can't get stuck inside it
  ball.y = paddle.y - ball.height;

  // Sparks fly from where the arrow struck the shield
  makeSparks(ballCenter, paddle.y, paddle.buffed);

  // TODO: play the new paddle hit sound here
}

// Returns true if this player would win by scoring the next point
function isMatchPoint(player, other) {
  return (
    player.score + 1 >= winScore && player.score + 1 - other.score >= winBy
  );
}

// Returns true if this player has enough points and is ahead by enough to win
function hasWon(player, other) {
  return player.score >= winScore && player.score - other.score >= winBy;
}

// Runs whenever someone scores.
// scorer is the paddle that got the point, other is the one that didn't.
// scorerSide is "left" or "right".
function pointScored(scorer, other, scorerSide) {
  scorer.score++;
  updateBuffs();

  // If that point won the game, stop and show who won
  if (hasWon(scorer, other)) {
    battleMusic.pause();
    playSound(winningSound);
    gameOver = true;
    playing = false;
    if (scorerSide == "left") {
      winnerText = "Player 1 wins!";
    } else {
      winnerText = "Player 2 wins!";
    }
    return;
  }

  // Not a winning point, so just play the normal score sound
  playSound(scoreSound);

  // Usually the ball is served toward the player who just lost the point
  let direction;
  if (scorerSide == "left") {
    direction = "right";
  } else {
    direction = "left";
  }

  // On match point the ball is served toward the player who is ahead instead
  if (isMatchPoint(leftPaddle, rightPaddle)) {
    direction = "left";
  }
  if (isMatchPoint(rightPaddle, leftPaddle)) {
    direction = "right";
  }

  resetBall(direction);
}

// Resets the scores and serves to start a new game
function newGame() {
  leftPaddle.score = 0;
  rightPaddle.score = 0;
  updateBuffs();
  sparks = [];
  gameOver = false;
  battleMusic.currentTime = 0; // start the music over for the new game
  resetBall("right");
}

// Moves everything one step and checks for bounces and points
function update() {
  // Move the paddles
  movePaddle(leftPaddle, aPressed, dPressed);
  movePaddle(rightPaddle, leftPressed, rightPressed);

  // Move the ball
  ball.x += ball.speedX;
  ball.y += ball.speedY;

  // The top and both sides are walls. Put the ball back on the wall
  // and point it away, so it can never get stuck bouncing inside one.
  if (ball.y < 0) {
    ball.y = 0;
    ball.speedY = Math.abs(ball.speedY); // go down
  }
  if (ball.x < 0) {
    ball.x = 0;
    ball.speedX = Math.abs(ball.speedX); // go right
  }
  if (ball.x > canvas.width - ball.width) {
    ball.x = canvas.width - ball.width;
    ball.speedX = -Math.abs(ball.speedX); // go left
  }

  // Ball comes down onto a paddle: send it back up
  if (ball.speedY > 0) {
    if (ballHitsPaddle(leftPaddle)) {
      bounceOffPaddle(leftPaddle);
    } else if (ballHitsPaddle(rightPaddle)) {
      bounceOffPaddle(rightPaddle);
    }
  }

  updateSparks();

  // The ball fell past the bottom. Whoever's half it fell on missed it,
  // so the other player gets the point.
  if (ball.y > canvas.height) {
    let ballCenter = ball.x + ball.width / 2;
    if (ballCenter < canvas.width / 2) {
      pointScored(rightPaddle, leftPaddle, "right"); // Player 1 missed
    } else {
      pointScored(leftPaddle, rightPaddle, "left"); // Player 2 missed
    }
  }
}

// Draws the whole screen for the current frame
function draw() {
  // Fill the screen with black to erase the last frame
  // <img src = "Style/warriorsClash_Background.jpg"></img>
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Gray line down the middle (gray so the ball is still easy to see on it)
  ctx.fillStyle = "gray";
  ctx.fillRect(canvas.width / 2 - 2, 0, 4, canvas.height);

  // Draw the paddles, the ball and the sparks on top
  drawPaddle(leftPaddle);
  drawPaddle(rightPaddle);
  drawBall();
  drawSparks();

  // Draw the scores. textAlign "center" centers the text on the x position.
  ctx.fillStyle = "white";
  ctx.font = "50px Arial";
  ctx.textAlign = "center";
  ctx.fillText(leftPaddle.score, canvas.width / 4, 70);
  ctx.fillText(rightPaddle.score, (canvas.width * 3) / 4, 70);

  // Show "WARRIOR BUFF" under the score of whoever has it
  ctx.font = "24px Arial";
  ctx.fillStyle = "red";
  if (leftPaddle.buffed) {
    ctx.fillText("WARRIOR BUFF", canvas.width / 4, 105);
  }
  if (rightPaddle.buffed) {
    ctx.fillText("WARRIOR BUFF", (canvas.width * 3) / 4, 105);
  }
  ctx.fillStyle = "white";
  ctx.font = "50px Arial";

  // Show "MATCH POINT" when either player is one point from winning
  if (
    !gameOver &&
    (isMatchPoint(leftPaddle, rightPaddle) ||
      isMatchPoint(rightPaddle, leftPaddle))
  ) {
    ctx.font = "30px Arial";
    ctx.fillText("MATCH POINT", canvas.width / 2, 120);
    ctx.font = "50px Arial";
  }

  // Show the winner, or the start message when the game is paused
  if (gameOver) {
    ctx.fillText(winnerText, canvas.width / 2, canvas.height / 2 - 30);
    ctx.fillText(
      "Press Space to play again",
      canvas.width / 2,
      canvas.height / 2 + 40,
    );
  } else if (!playing) {
    ctx.fillText("Press Space", canvas.width / 2, canvas.height / 2);
  }
}

// Runs at 60 fps
function gameLoop() {
  if (playing) {
    update();
  }
  draw();
}

// Serve the first ball
resetBall("right");

setInterval(gameLoop, 1000 / 60);

// When a key is pressed, remember that it's held down.
// Space starts or pauses the game, and starts a new one after someone wins.
// toLowerCase() makes "A" and "a" count the same, so Caps Lock doesn't break the controls.
document.addEventListener("keydown", function (event) {
  let key = event.key.toLowerCase();
  if (key == "a") aPressed = true;
  if (key == "d") dPressed = true;
  if (event.key == "ArrowLeft") leftPressed = true;
  if (event.key == "ArrowRight") rightPressed = true;
  if (event.key == " ") {
    if (gameOver) {
      newGame();
    }
    playing = !playing;

    // Music plays while the game is running and pauses with it.
    // pause() keeps its place, so unpausing carries on where it left off.
    if (playing) {
      battleMusic.play();
    } else {
      battleMusic.pause();
    }
  }

  // Stop the arrow keys and space from scrolling the page
  if (event.key == "ArrowLeft" || event.key == "ArrowRight" || event.key == " ") {
    event.preventDefault();
  }
});

// When a key is let go, mark it as not held anymore
document.addEventListener("keyup", function (event) {
  let key = event.key.toLowerCase();
  if (key == "a") aPressed = false;
  if (key == "d") dPressed = false;
  if (event.key == "ArrowLeft") leftPressed = false;
  if (event.key == "ArrowRight") rightPressed = false;
});

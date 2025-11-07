// Pong Game
var canvas, ctx;
var player, ai, ball;
var playerScore = 0;
var aiScore = 0;
var gameRunning = true;
var keys = {};

const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 10;
const PADDLE_SPEED = 5;
const AI_SPEED = 4;
const BALL_SPEED = 5;

function init() {
    canvas = document.getElementById('pongCanvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas to full screen
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Initialize game objects
    player = {
        x: 50,
        y: canvas.height / 2 - PADDLE_HEIGHT / 2,
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT,
        speed: PADDLE_SPEED
    };
    
    ai = {
        x: canvas.width - 50 - PADDLE_WIDTH,
        y: canvas.height / 2 - PADDLE_HEIGHT / 2,
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT,
        speed: AI_SPEED
    };
    
    resetBall();
    
    // Event listeners
    window.addEventListener('keydown', function(e) {
        keys[e.key.toLowerCase()] = true;
        if (e.key === 'Escape') {
            window.location.href = 'index.html';
        }
        if (e.key.toLowerCase() === 'r' && !gameRunning) {
            restart();
        }
    });
    
    window.addEventListener('keyup', function(e) {
        keys[e.key.toLowerCase()] = false;
    });
    
    window.addEventListener('resize', function() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // Keep paddles in bounds
        player.y = Math.max(0, Math.min(player.y, canvas.height - PADDLE_HEIGHT));
        ai.y = Math.max(0, Math.min(ai.y, canvas.height - PADDLE_HEIGHT));
    });
    
    // Start game loop
    gameLoop();
}

function resetBall() {
    ball = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        width: BALL_SIZE,
        height: BALL_SIZE,
        vx: (Math.random() > 0.5 ? 1 : -1) * BALL_SPEED,
        vy: (Math.random() * 2 - 1) * BALL_SPEED
    };
}

function update() {
    if (!gameRunning) return;
    
    // Player movement
    if ((keys['w'] || keys['arrowup']) && player.y > 0) {
        player.y -= player.speed;
    }
    if ((keys['s'] || keys['arrowdown']) && player.y < canvas.height - PADDLE_HEIGHT) {
        player.y += player.speed;
    }
    
    // AI movement (simple follow ball)
    var aiCenter = ai.y + PADDLE_HEIGHT / 2;
    var ballY = ball.y;
    
    if (ballY < aiCenter - 10) {
        ai.y = Math.max(0, ai.y - ai.speed);
    } else if (ballY > aiCenter + 10) {
        ai.y = Math.min(canvas.height - PADDLE_HEIGHT, ai.y + ai.speed);
    }
    
    // Ball movement
    ball.x += ball.vx;
    ball.y += ball.vy;
    
    // Ball collision with top/bottom walls
    if (ball.y <= 0 || ball.y >= canvas.height - BALL_SIZE) {
        ball.vy = -ball.vy;
    }
    
    // Ball collision with player paddle
    if (ball.x <= player.x + PADDLE_WIDTH &&
        ball.x >= player.x &&
        ball.y + BALL_SIZE >= player.y &&
        ball.y <= player.y + PADDLE_HEIGHT &&
        ball.vx < 0) {
        ball.vx = -ball.vx;
        // Add some spin based on where ball hits paddle
        var hitPos = (ball.y - player.y) / PADDLE_HEIGHT;
        ball.vy = (hitPos - 0.5) * BALL_SPEED * 2;
        ball.x = player.x + PADDLE_WIDTH; // Prevent sticking
    }
    
    // Ball collision with AI paddle
    if (ball.x + BALL_SIZE >= ai.x &&
        ball.x <= ai.x + PADDLE_WIDTH &&
        ball.y + BALL_SIZE >= ai.y &&
        ball.y <= ai.y + PADDLE_HEIGHT &&
        ball.vx > 0) {
        ball.vx = -ball.vx;
        // Add some spin based on where ball hits paddle
        var hitPos = (ball.y - ai.y) / PADDLE_HEIGHT;
        ball.vy = (hitPos - 0.5) * BALL_SPEED * 2;
        ball.x = ai.x - BALL_SIZE; // Prevent sticking
    }
    
    // Score points
    if (ball.x < 0) {
        aiScore++;
        updateScore();
        resetBall();
        if (aiScore >= 10) {
            endGame('AI');
        }
    } else if (ball.x > canvas.width) {
        playerScore++;
        updateScore();
        resetBall();
        if (playerScore >= 10) {
            endGame('Player');
        }
    }
}

function updateScore() {
    document.getElementById('playerScore').textContent = playerScore;
    document.getElementById('aiScore').textContent = aiScore;
}

function endGame(winner) {
    gameRunning = false;
    var gameOverDiv = document.getElementById('gameOver');
    gameOverDiv.innerHTML = '<div>' + winner + ' Wins!</div><div style="font-size: 0.6em; margin-top: 20px;">Press R to restart</div>';
    gameOverDiv.style.display = 'block';
}

function restart() {
    playerScore = 0;
    aiScore = 0;
    updateScore();
    gameRunning = true;
    document.getElementById('gameOver').style.display = 'none';
    resetBall();
    player.y = canvas.height / 2 - PADDLE_HEIGHT / 2;
    ai.y = canvas.height / 2 - PADDLE_HEIGHT / 2;
}

function draw() {
    // Clear canvas with dark background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw paddles
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.fillRect(ai.x, ai.y, ai.width, ai.height);
    
    // Draw ball
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ball.x, ball.y, ball.width, ball.height);
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start game when page loads
window.onload = function() {
    init();
    gameLoop();
};


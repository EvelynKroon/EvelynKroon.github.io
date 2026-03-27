const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Load images
const backgroundImage = new Image();
backgroundImage.src = 'background.png';
const playerImage = new Image();
playerImage.src = 'you.png';
const andreiiImage = new Image();
andreiiImage.src = 'Andreii.png';
const matveiiImage = new Image();
matveiiImage.src = 'Matveii.png';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_SIZE = 30;
const PLAYER_SPEED = 200; // pixels per second
const ENEMY_RADIUS = 15;
const MIN_SPAWN_INTERVAL = 0.5; // seconds

const DIFFICULTIES = {
    easy: {
        baseEnemySpeed: 80,
        baseSpawnInterval: 4,
        spawnDecreaseRate: 0.05
    },
    medium: {
        baseEnemySpeed: 100,
        baseSpawnInterval: 3,
        spawnDecreaseRate: 0.1
    },
    hard: {
        baseEnemySpeed: 120,
        baseSpawnInterval: 2,
        spawnDecreaseRate: 0.15
    }
};

let ENEMY_SPEED = 100; // pixels per second
let BASE_SPAWN_INTERVAL = 3; // seconds
let SPAWN_DECREASE_RATE = 0.1; // decrease per second

const state = {
    player: {
        x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
        y: CANVAS_HEIGHT / 2 - PLAYER_SIZE / 2,
        width: PLAYER_SIZE,
        height: PLAYER_SIZE,
        color: 'green'
    },
    enemies: [],
    particles: [],
    gameOver: false,
    gameState: 'menu'
};

let keysPressed = {};
let lastTime = 0;
let survivalTime = 0;
let spawnTimer = 0;
let score = 0;
let currentSpawnInterval = BASE_SPAWN_INTERVAL;
let currentDifficulty = null;
let highScore = parseInt(localStorage.getItem('canvas_apocalypse_highscore')) || 0;
let shakeTime = 0;
let shakeOffsetX = 0;
let shakeOffsetY = 0;

document.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
    if ((e.key === 'r' || e.key === 'R') && state.gameState === 'gameOver') {
        e.preventDefault();
        // reset state
        state.player.x = CANVAS_WIDTH / 2 - PLAYER_SIZE / 2;
        state.player.y = CANVAS_HEIGHT / 2 - PLAYER_SIZE / 2;
        state.enemies = [];
        spawnEnemy();
        state.gameOver = false;
        state.gameState = 'playing';
        survivalTime = 0;
        spawnTimer = 0;
        score = 0;
        currentSpawnInterval = BASE_SPAWN_INTERVAL;
    }
    if (state.gameState === 'menu') {
        if (e.key === '1') {
            e.preventDefault();
            currentDifficulty = DIFFICULTIES.easy;
            ENEMY_SPEED = currentDifficulty.baseEnemySpeed;
            BASE_SPAWN_INTERVAL = currentDifficulty.baseSpawnInterval;
            SPAWN_DECREASE_RATE = currentDifficulty.spawnDecreaseRate;
            state.gameState = 'playing';
            spawnEnemy();
        } else if (e.key === '2') {
            e.preventDefault();
            currentDifficulty = DIFFICULTIES.medium;
            ENEMY_SPEED = currentDifficulty.baseEnemySpeed;
            BASE_SPAWN_INTERVAL = currentDifficulty.baseSpawnInterval;
            SPAWN_DECREASE_RATE = currentDifficulty.spawnDecreaseRate;
            state.gameState = 'playing';
            spawnEnemy();
        } else if (e.key === '3') {
            e.preventDefault();
            currentDifficulty = DIFFICULTIES.hard;
            ENEMY_SPEED = currentDifficulty.baseEnemySpeed;
            BASE_SPAWN_INTERVAL = currentDifficulty.baseSpawnInterval;
            SPAWN_DECREASE_RATE = currentDifficulty.spawnDecreaseRate;
            state.gameState = 'playing';
            spawnEnemy();
        }
    }
});

document.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
});

function spawnEnemy() {
    const enemy = {
        x: 0,
        y: 0,
        radius: ENEMY_RADIUS,
        color: 'red',
        image: Math.random() < 0.5 ? andreiiImage : matveiiImage
    };
    const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
    switch(side) {
        case 0: // top
            enemy.x = Math.random() * CANVAS_WIDTH;
            enemy.y = -ENEMY_RADIUS;
            break;
        case 1: // right
            enemy.x = CANVAS_WIDTH + ENEMY_RADIUS;
            enemy.y = Math.random() * CANVAS_HEIGHT;
            break;
        case 2: // bottom
            enemy.x = Math.random() * CANVAS_WIDTH;
            enemy.y = CANVAS_HEIGHT + ENEMY_RADIUS;
            break;
        case 3: // left
            enemy.x = -ENEMY_RADIUS;
            enemy.y = Math.random() * CANVAS_HEIGHT;
            break;
    }
    state.enemies.push(enemy);
}

function spawnExplosion(x, y) {
    for (let i = 0; i < 30; i++) {
        state.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 200,
            vy: (Math.random() - 0.5) * 200,
            life: 1,
            maxLife: 1,
            color: 'red'
        });
    }
}

function updateParticles(deltaTime) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx * deltaTime;
        p.y += p.vy * deltaTime;
        p.life -= deltaTime;
        if (p.life <= 0) {
            state.particles.splice(i, 1);
        }
    }
}

function drawBackground() {
    if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
        ctx.drawImage(backgroundImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
        // Fallback: grid if image not loaded
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        for (let x = 0; x < CANVAS_WIDTH; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, CANVAS_HEIGHT);
            ctx.stroke();
        }
        for (let y = 0; y < CANVAS_HEIGHT; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(CANVAS_WIDTH, y);
            ctx.stroke();
        }
    }
}

function drawParticles() {
    for (const p of state.particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
}

function checkCollision(rect, circle) {
    // Circle vs Rectangle collision detection
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
    const distanceX = circle.x - closestX;
    const distanceY = circle.y - closestY;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;
    return distanceSquared < (circle.radius * circle.radius);
}

function update(deltaTime) {
    let dx = 0, dy = 0;
    if (keysPressed['w'] || keysPressed['W'] || keysPressed['ArrowUp']) dy -= 1;
    if (keysPressed['s'] || keysPressed['S'] || keysPressed['ArrowDown']) dy += 1;
    if (keysPressed['a'] || keysPressed['A'] || keysPressed['ArrowLeft']) dx -= 1;
    if (keysPressed['d'] || keysPressed['D'] || keysPressed['ArrowRight']) dx += 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
        dx *= 0.707;
        dy *= 0.707;
    }

    state.player.x += dx * PLAYER_SPEED * deltaTime;
    state.player.y += dy * PLAYER_SPEED * deltaTime;

    // Clamp to bounds
    state.player.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_SIZE, state.player.x));
    state.player.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_SIZE, state.player.y));

    // Move enemies
    for (let enemy of state.enemies) {
        const enemyDx = (state.player.x + PLAYER_SIZE / 2) - enemy.x;
        const enemyDy = (state.player.y + PLAYER_SIZE / 2) - enemy.y;
        const distance = Math.sqrt(enemyDx * enemyDx + enemyDy * enemyDy);
        if (distance > 0) {
            const normalizedDx = enemyDx / distance;
            const normalizedDy = enemyDy / distance;
            enemy.x += normalizedDx * ENEMY_SPEED * deltaTime;
            enemy.y += normalizedDy * ENEMY_SPEED * deltaTime;
        }
    }

    // Check collision
    for (let enemy of state.enemies) {
        if (checkCollision(state.player, enemy)) {
            spawnExplosion(state.player.x + PLAYER_SIZE / 2, state.player.y + PLAYER_SIZE / 2);
            shakeTime = 0.2;
            if (Math.floor(score) > highScore) {
                highScore = Math.floor(score);
                localStorage.setItem('canvas_apocalypse_highscore', highScore);
            }
            state.gameOver = true;
            state.gameState = 'gameOver';
            break;
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBackground();
    if (state.gameState === 'menu') {
        ctx.fillStyle = 'white';
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Select Difficulty', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100);
        ctx.font = '24px Arial';
        ctx.fillText('1. Easy', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
        ctx.fillText('2. Medium', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
        ctx.fillText('3. Hard', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
        ctx.fillText(`High Score: ${highScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
    } else if (state.gameState === 'gameOver') {
        ctx.save();
        ctx.translate(shakeOffsetX, shakeOffsetY);
        ctx.fillStyle = 'white';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50);
        ctx.font = '24px Arial';
        ctx.fillText('Press R to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
        ctx.fillText(`Score: ${Math.floor(score)}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80);
        ctx.fillText(`High Score: ${highScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 110);
        ctx.restore();
    } else {
        ctx.save();
        ctx.translate(shakeOffsetX, shakeOffsetY);
        if (playerImage.complete) {
            ctx.drawImage(playerImage, state.player.x, state.player.y, state.player.width, state.player.height);
        } else {
            // Fallback: draw green square if image not loaded
            ctx.fillStyle = state.player.color;
            ctx.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
        }

        // Draw enemies
        for (let enemy of state.enemies) {
            if (enemy.image && enemy.image.complete) {
                ctx.drawImage(enemy.image, enemy.x - enemy.radius, enemy.y - enemy.radius, enemy.radius * 2, enemy.radius * 2);
            } else {
                // Fallback: draw red circle if image not loaded
                ctx.fillStyle = enemy.color;
                ctx.beginPath();
                ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw UI
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Time: ${survivalTime.toFixed(1)}s`, 10, 30);
        ctx.fillText(`Score: ${Math.floor(score)}`, 10, 60);
        ctx.restore();
    }
    drawParticles();
}

function gameLoop(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    if (state.gameState === 'playing' && !state.gameOver) {
        survivalTime += deltaTime;
        score += deltaTime;
        currentSpawnInterval = Math.max(MIN_SPAWN_INTERVAL, BASE_SPAWN_INTERVAL - survivalTime * SPAWN_DECREASE_RATE);
        spawnTimer += deltaTime;
        if (spawnTimer >= currentSpawnInterval) {
            spawnEnemy();
            spawnTimer = 0;
        }
        update(deltaTime);
    }
    updateParticles(deltaTime);
    shakeTime -= deltaTime;
    if (shakeTime > 0) {
        shakeOffsetX = (Math.random() - 0.5) * 5;
        shakeOffsetY = (Math.random() - 0.5) * 5;
    } else {
        shakeOffsetX = 0;
        shakeOffsetY = 0;
    }
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop(0);
// ================================================================
// Mini Mario — игровой движок на чистом Canvas
// ================================================================

const canvas      = document.getElementById("game");
const ctx         = canvas.getContext("2d");
const statusLabel = document.getElementById("status-label");
const startMenu   = document.getElementById("start-menu");
const startBtn    = document.getElementById("start-game-btn");
const skinBtn     = document.getElementById("skin-btn");
const skinMenu    = document.getElementById("skin-menu");
const backBtn     = document.getElementById("back-btn");
const recordsList = document.getElementById("records-list");

let currentSkin = "cuphead";  // выбранный скин по умолчанию

// Размеры экрана берём прямо из атрибутов тега <canvas>
const VIEW_WIDTH  = canvas.width;   // 1280
const VIEW_HEIGHT = canvas.height;  // 720

const WORLD_WIDTH = 6200;  // горизонтальный размер уровня
const GRAVITY     = 1800;  // пикселей / с²
const MOVE_SPEED  = 290;   // пикселей / с
const JUMP_FORCE  = -660;  // начальная вертикальная скорость прыжка
const DASH_SPEED  = 1150;  // скорость рывка
const DASH_DURATION = 0.14;
const POWERUP_DURATION = 10;
const RECORDS_KEY = "mini-mario-records-v1";

const BACKGROUND_IMAGE = new Image();
BACKGROUND_IMAGE.src = "back.jpg";
const BG_PIXEL_CANVAS = document.createElement("canvas");
const BG_PIXEL_CTX = BG_PIXEL_CANVAS.getContext("2d");

function drawPixelatedBackgroundImage(pixelSize = 4) {
  if (!BG_PIXEL_CTX) return;

  const miniW = Math.max(1, Math.floor(VIEW_WIDTH / pixelSize));
  const miniH = Math.max(1, Math.floor(VIEW_HEIGHT / pixelSize));

  if (BG_PIXEL_CANVAS.width !== miniW || BG_PIXEL_CANVAS.height !== miniH) {
    BG_PIXEL_CANVAS.width = miniW;
    BG_PIXEL_CANVAS.height = miniH;
  }

  BG_PIXEL_CTX.imageSmoothingEnabled = false;
  BG_PIXEL_CTX.clearRect(0, 0, miniW, miniH);
  BG_PIXEL_CTX.drawImage(BACKGROUND_IMAGE, 0, 0, miniW, miniH);

  ctx.drawImage(BG_PIXEL_CANVAS, 0, 0, miniW, miniH, 0, 0, VIEW_WIDTH, VIEW_HEIGHT);
}

function formatRecordTime(totalSeconds) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const secs = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
  return `${mins}:${secs}`;
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(r =>
      r &&
      typeof r.time === "number" &&
      typeof r.coins === "number" &&
      typeof r.skin === "string" &&
      typeof r.createdAt === "number"
    );
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function renderRecords() {
  if (!recordsList) return;

  const records = loadRecords();
  if (records.length === 0) {
    recordsList.innerHTML = "<li>No records yet</li>";
    return;
  }

  recordsList.innerHTML = records
    .map(r => `<li>${formatRecordTime(r.time)} | coins: ${r.coins} | ${r.skin}</li>`)
    .join("");
}

function addRecord() {
  const records = loadRecords();
  records.push({
    time: gameTimer,
    coins: coinsCollected,
    skin: currentSkin,
    createdAt: Date.now(),
  });

  records.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.coins !== b.coins) return b.coins - a.coins;
    return a.createdAt - b.createdAt;
  });

  const topRecords = records.slice(0, 7);
  saveRecords(topRecords);
  renderRecords();
}

// ----------------------------------------------------------------
// Фоновая 8-bit музыка (Web Audio)
// ----------------------------------------------------------------
let musicCtx = null;
let musicGain = null;
let musicStarted = false;
let musicStep = 0;
let musicTimer = null;

const CHORD_ROOTS = [261.63, 220.00, 246.94, 196.00]; // C4, A3, B3, G3
const LEAD_PATTERN = [
  0, 2, 4, 7, 4, 2, 0, -1,
  0, 2, 4, 9, 7, 4, 2, 0,
];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playChipNote(freq, startTime, duration, volume) {
  if (!musicCtx || !musicGain) return;
  const osc = musicCtx.createOscillator();
  const gain = musicCtx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(musicGain);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function startBackgroundMusic() {
  if (musicStarted) return;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  musicCtx = new AudioCtx();
  musicGain = musicCtx.createGain();
  musicGain.gain.value = 0.12;
  musicGain.connect(musicCtx.destination);

  musicStarted = true;
  const beat = 0.24;

  musicTimer = setInterval(() => {
    const now = musicCtx.currentTime + 0.02;
    const chord = CHORD_ROOTS[Math.floor(musicStep / 16) % CHORD_ROOTS.length];

    playChipNote(chord, now, 0.16, 0.09);

    const leadOffset = LEAD_PATTERN[musicStep % LEAD_PATTERN.length];
    if (leadOffset >= 0) {
      const leadFreq = midiToFreq(60 + leadOffset); // от C4
      playChipNote(leadFreq, now, 0.12, 0.065);
    }

    if (musicStep % 4 === 0) {
      playChipNote(chord / 2, now, 0.2, 0.11);
    }

    musicStep = (musicStep + 1) % 64;
  }, beat * 1000);
}

// ----------------------------------------------------------------
// Загрузка изображений (все спрайты из папки проекта)
// ----------------------------------------------------------------
const IMAGES = {};
["cuphead.stand", "cuphead.run", "cuphead.sprint", "cuphead.dead", "mughead.stand", "mughead.run", "mughead.sprint", "mughead.dead", "blue", "fiol", "fioll", "grib", "money", "blok", "kub", "kub1", "redB", "BlueB", "greenB", "red", "bubble", "falg1", "flag2"].forEach(name => {
  const img = new Image();
  img.src   = name + ".png";
  IMAGES[name] = img;
});

// ----------------------------------------------------------------
// Управление — стрелки ← → и клавиши A D, прыжок — Пробел
// ----------------------------------------------------------------
const keys = { left: false, right: false, jump: false };

window.addEventListener("keydown", e => {
  if (isMenuOpen) {
    if (e.code === "Enter") {
      e.preventDefault();
      startGameFromMenu();
    }
    return;
  }

  startBackgroundMusic();
  if (e.code === "ArrowLeft"  || e.code === "KeyA") keys.left  = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
  if (e.code === "Space") { keys.jump = true;  e.preventDefault(); }
  if (e.code === "KeyR")  resetGame();
  if (e.code === "KeyF")  shootPlayerBullet();
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") tryStartDash();
});

window.addEventListener("keyup", e => {
  if (isMenuOpen) return;
  if (e.code === "ArrowLeft"  || e.code === "KeyA") keys.left  = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  if (e.code === "Space") { keys.jump = false; e.preventDefault(); }
});

window.addEventListener("pointerdown", startBackgroundMusic, { once: true });
if (startBtn) startBtn.addEventListener("click", startGameFromMenu);
if (skinBtn) skinBtn.addEventListener("click", openSkinSelector);
if (backBtn) backBtn.addEventListener("click", closeSkinSelector);

// Обработчики для кнопок выбора скина
document.querySelectorAll(".skin-option").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const skin = e.currentTarget.dataset.skin;
    selectSkin(skin);
  });
});

renderRecords();

// ----------------------------------------------------------------
// Геометрия уровня. Земля начинается на y = 640 (640 + 80 = 720).
// ----------------------------------------------------------------
const GROUND_Y = 640;

const platforms = [
  // Наземные сегменты с ямами между ними
  { x:    0, y: GROUND_Y, width:  700, height: 80 },
  { x:  820, y: GROUND_Y, width:  560, height: 80 },
  { x: 1490, y: GROUND_Y, width:  560, height: 80 },
  { x: 2170, y: GROUND_Y, width:  500, height: 80 },
  { x: 2780, y: GROUND_Y, width:  420, height: 80 },
  { x: 3320, y: GROUND_Y, width:  520, height: 80 },
  { x: 3970, y: GROUND_Y, width:  630, height: 80 },
  { x: 4730, y: GROUND_Y, width:  520, height: 80 },
  { x: 5410, y: GROUND_Y, width:  790, height: 80 },
  // Подвесные кирпичные платформы
  { x:  310, y: 530, width: 130, height: 22 },
  { x:  530, y: 468, width: 120, height: 22 },
  { x:  880, y: 525, width: 130, height: 22 },
  { x: 1090, y: 458, width: 130, height: 22 },
  { x: 1710, y: 452, width: 130, height: 22 },
  { x: 3470, y: 500, width: 140, height: 22 },
  { x: 4120, y: 450, width: 150, height: 22 },
  { x: 4980, y: 490, width: 150, height: 22 },
  { x: 5630, y: 435, width: 160, height: 22 },
];

// ----------------------------------------------------------------
// Враги. Три типа:
//   "blue"  — синяя птица, патрулирует
//   "grib"  — гриб, патрулирует
//   "fiol"  — фиолетовый, патрулирует + каждые 5 с бросает снаряд
// ----------------------------------------------------------------
const ENEMY_DEFS = [
  {
    type: "blue",
    x: 860, y: GROUND_Y - 72, width: 72, height: 72,
    speed: 90, minX: 820,  maxX: 1340, direction: 1,
  },
  {
    type: "grib",
    x: 1530, y: GROUND_Y - 68, width: 68, height: 68,
    speed: 75, minX: 1490, maxX: 2030, direction: 1,
  },
  {
    type: "fiol",
    x: 2220, y: GROUND_Y - 72, width: 72, height: 72,
    speed: 65, minX: 2170, maxX: 2640, direction: 1,
    shootInterval: 5,   // секунды между выстрелами
  },
  {
    type: "blue",
    x: 3520, y: GROUND_Y - 72, width: 72, height: 72,
    speed: 95, minX: 3320, maxX: 3830, direction: -1,
  },
  {
    type: "grib",
    x: 4280, y: GROUND_Y - 68, width: 68, height: 68,
    speed: 82, minX: 4020, maxX: 4560, direction: 1,
  },
  {
    type: "fiol",
    x: 5050, y: GROUND_Y - 72, width: 72, height: 72,
    speed: 70, minX: 4740, maxX: 5230, direction: -1,
    shootInterval: 4.5,
  },
  {
    type: "blue",
    x: 5720, y: GROUND_Y - 72, width: 72, height: 72,
    speed: 105, minX: 5430, maxX: 6150, direction: 1,
  },
];

// Финишный флагшток
const finish = { x: 6020, y: 460, width: 20, height: 180 };

// Начальная позиция игрока
const INIT_PLAYER = { x: 80, y: GROUND_Y - 86, width: 66, height: 86 };
const PLAYER_DRAW_Y_OFFSET = 16;
const ENEMY_DRAW_Y_OFFSET = 8;
const PLAYER_HURTBOX_INSET_X = 14;
const PLAYER_HURTBOX_INSET_TOP = 12;
const PLAYER_HURTBOX_INSET_BOTTOM = 8;
const ENEMY_HURTBOX_INSET_X = 16;
const ENEMY_HURTBOX_INSET_TOP = 14;
const ENEMY_HURTBOX_INSET_BOTTOM = 10;
const BLOCK_SIZE = 22;
const PLAYER_BULLET_MAX_DISTANCE = BLOCK_SIZE * 50;
const FIOL_ACTIVATION_DISTANCE = BLOCK_SIZE * 50;
const FIOL_BULLET_MAX_DISTANCE = BLOCK_SIZE * 50;
const COIN_SIZE = 36;

const COIN_COUNT = 5;
const COIN_MIDDLE_POINTS = [
  { x: 3060, y: 592 },
  { x: 3220, y: 592 },
];
const COIN_SPAWN_POINTS = [
  { x: 760,  y: 592 },
  { x: 1120, y: 410 },
  { x: 1560, y: 592 },
  { x: 1880, y: 410 },
  { x: 2380, y: 592 },
  { x: 2860, y: 592 },
  { x: 3380, y: 452 },
  { x: 3660, y: 592 },
  { x: 4200, y: 402 },
  { x: 4880, y: 592 },
  { x: 5530, y: 385 },
  { x: 5860, y: 592 },
];

const QBOX_SIZE = 48;
const QBOX_DEFS = [
  { x: 210,  y: 450 },  // ближе к началу уровня
  { x: 1580, y: 450 },  // ближе к середине уровня
  { x: 3180, y: 450 },  // дополнительная коробка в центре длинной карты
];

const BUBBLE_SIZE = 56;
const BUBBLE_DEFS = [
  { x: 980,  y: GROUND_Y - 260 },
  { x: 2020, y: GROUND_Y - 260 },
  { x: 3560, y: GROUND_Y - 260 },
  { x: 5180, y: GROUND_Y - 260 },
  { x: 5750, y: GROUND_Y - 260 },
];

// ----------------------------------------------------------------
// Игровые переменные (заполняются в resetGame)
// ----------------------------------------------------------------
const camera      = { x: 0 };
let   enemies     = [];
let   projectiles = [];
let   coins       = [];
let   coinsCollected = 0;
let   gameState   = "playing";
let   lastTime    = 0;
let   qboxes      = [];
let   bonuses     = [];
let   playerBullets = [];
let   playerPowerup = null;
let   playerPowerupTime = 0;
let   gameTimer   = 0;
let   bubbles     = [];
let   deathAnimTime = 0;
let   isMenuOpen  = true;

function setMenuOpen(open) {
  isMenuOpen = open;
  if (startMenu) startMenu.hidden = !open;
  if (open) {
    statusLabel.textContent = "Open the menu and press PLAY";
    renderRecords();
  }
}

function startGameFromMenu() {
  setMenuOpen(false);
  resetGame();
  startBackgroundMusic();
}

function openSkinSelector() {
  if (skinMenu) skinMenu.hidden = false;
}

function closeSkinSelector() {
  if (skinMenu) skinMenu.hidden = true;
}

function selectSkin(skinName) {
  currentSkin = skinName;
  closeSkinSelector();
}

// Создаём объект игрока
function createPlayer() {
  return {
    x:              INIT_PLAYER.x,
    y:              INIT_PLAYER.y,
    width:          INIT_PLAYER.width,
    height:         INIT_PLAYER.height,
    vx:             0,
    vy:             0,
    onGround:       false,
    facing:         1,           // 1 = вправо, -1 = влево
    previousBottom: INIT_PLAYER.y + INIT_PLAYER.height,
    isRunning:      false,       // true пока бежит по земле
    bubbleBoostTimer: 0,
    isDashing:      false,
    dashTimer:      0,
    dashDirection:  1,
    airDashUsed:    false,
  };
}

const player = createPlayer();

// Создаём массив врагов из определений
function createEnemies() {
  return ENEMY_DEFS.map(def => ({
    ...def,
    alive:       true,
    // Таймер стрельбы: у fiol стоит = shootInterval, у остальных = 0
    shootTimer:  def.shootInterval ?? 0,
  }));
}

function createCoins() {
  const mandatory = COIN_MIDDLE_POINTS.map(def => ({
    x: def.x,
    y: def.y,
    width: COIN_SIZE,
    height: COIN_SIZE,
    collected: false,
  }));

  const middleKeys = new Set(COIN_MIDDLE_POINTS.map(p => `${p.x}:${p.y}`));
  const pool = COIN_SPAWN_POINTS.filter(p => !middleKeys.has(`${p.x}:${p.y}`));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }

  const randomCount = Math.max(0, COIN_COUNT - mandatory.length);
  const randomCoins = pool.slice(0, randomCount).map(def => ({
    x: def.x,
    y: def.y,
    width: COIN_SIZE,
    height: COIN_SIZE,
    collected: false,
  }));

  return [...mandatory, ...randomCoins];
}

function createQBoxes() {
  return QBOX_DEFS.map(def => ({
    x:            def.x,
    y:            def.y,
    width:        QBOX_SIZE,
    height:       QBOX_SIZE,
    hit:          false,
    bounceTimer:  0,
    bounceOffset: 0,
  }));
}

function createBubbles() {
  return BUBBLE_DEFS.map(def => ({
    x: def.x,
    y: def.y,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    pulse: 0,
    active: true,
  }));
}

// Полный сброс игры (вызывается при старте и по клавише R)
function resetGame() {
  Object.assign(player, createPlayer());
  enemies     = createEnemies();
  projectiles = [];
  coins        = createCoins();
  qboxes       = createQBoxes();
  bubbles      = createBubbles();
  bonuses      = [];
  playerBullets = [];
  playerPowerup = null;
  playerPowerupTime = 0;
  coinsCollected = 0;
  gameTimer    = 0;
  deathAnimTime = 0;
  camera.x    = 0;
  gameState   = "playing";
  statusLabel.textContent = `Coins: ${coinsCollected}/${coins.length}. Reach the flag and avoid enemies!`;
}

// ----------------------------------------------------------------
// Основной цикл обновления
// ----------------------------------------------------------------
function update(dt) {
  if (isMenuOpen) return;

  if (gameState !== "playing") {
    if (gameState === "lost") deathAnimTime += dt;
    updateCamera();
    return;
  }
  gameTimer += dt;

  if (playerPowerupTime > 0) {
    playerPowerupTime -= dt;
    if (playerPowerupTime <= 0) {
      playerPowerupTime = 0;
      playerPowerup = null;
    }
  }

  updatePlayer(dt);
  updateBubbles(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateQBoxes(dt);
  updateBonuses(dt);
  updatePlayerBullets(dt);
  checkCoinCollection();
  checkAllEnemyCollisions();
  checkProjectileCollisions();
  checkFinish();
  checkFallOut();
  updateCamera();
}

// --- Игрок ---
function updatePlayer(dt) {
  const currentSpeed = playerPowerup === "redB"  ? MOVE_SPEED * 1.6 : MOVE_SPEED;
  const currentJump  = playerPowerup === "BlueB" ? JUMP_FORCE * 1.35 : JUMP_FORCE;

  if (player.isDashing) {
    player.vx = DASH_SPEED * player.dashDirection;
    player.vy = 0;

    const prevX = player.x;
    player.x   += player.vx * dt;
    resolveHorizontalCollisions(player, prevX);
    resolveHorizontalQBoxCollisions(player, prevX);

    player.dashTimer -= dt;
    if (player.dashTimer <= 0) {
      player.isDashing = false;
      player.vx = 0;
    }

    player.x = Math.max(0, Math.min(player.x, WORLD_WIDTH - player.width));
    return;
  }

  // Горизонтальное движение (стрелки или A/D)
  if (keys.left && !keys.right) {
    player.vx     = -currentSpeed;
    player.facing = -1;
  } else if (keys.right && !keys.left) {
    player.vx     = currentSpeed;
    player.facing = 1;
  } else {
    player.vx = 0;
  }

  // Флаг анимации: игрок бежит, если на земле и есть горизонтальная скорость
  player.isRunning = player.onGround && player.vx !== 0;

  // Прыжок — только когда стоим на платформе
  if (keys.jump && player.onGround) {
    player.vy       = currentJump;
    player.onGround = false;
  }

  // Гравитация
  player.vy += GRAVITY * dt;

  // Движение по X → проверка коллизий
  const prevX = player.x;
  player.x   += player.vx * dt;
  resolveHorizontalCollisions(player, prevX);
  resolveHorizontalQBoxCollisions(player, prevX);

  // Движение по Y → проверка коллизий
  const prevY            = player.y;
  player.previousBottom  = prevY + player.height;  // нужно для проверки прыжка на врага
  player.y              += player.vy * dt;
  player.onGround        = false;
  resolveVerticalCollisions(player, prevY);
  resolveQBoxCollisions(player, prevY);
  resolveBubbleCollisions(player, prevY);

  if (player.onGround) player.airDashUsed = false;

  if (player.bubbleBoostTimer > 0) player.bubbleBoostTimer -= dt;

  // Не выходим за границы мира
  player.x = Math.max(0, Math.min(player.x, WORLD_WIDTH - player.width));
}

function tryStartDash() {
  if (gameState !== "playing") return;
  if (player.onGround || player.isDashing || player.airDashUsed) return;

  let dir = player.facing;
  if (keys.left && !keys.right) dir = -1;
  if (keys.right && !keys.left) dir = 1;

  player.facing = dir;
  player.isDashing = true;
  player.dashDirection = dir;
  player.dashTimer = DASH_DURATION;
  player.airDashUsed = true;
  player.vy = 0;
}

// --- Враги ---
function updateEnemies(dt) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    // Патрулирование туда-сюда
    enemy.x += enemy.direction * enemy.speed * dt;
    if (enemy.x <= enemy.minX) {
      enemy.x         = enemy.minX;
      enemy.direction = 1;
    } else if (enemy.x + enemy.width >= enemy.maxX) {
      enemy.x         = enemy.maxX - enemy.width;
      enemy.direction = -1;
    }

    // fiol выпускает снаряд каждые 5 секунд
    if (enemy.type === "fiol") {
      const playerCenterX = player.x + player.width / 2;
      const enemyCenterX = enemy.x + enemy.width / 2;
      const isPlayerNearFiol = Math.abs(playerCenterX - enemyCenterX) <= FIOL_ACTIVATION_DISTANCE;

      if (!isPlayerNearFiol) {
        // Пока игрок далеко, fiol не активен и не накапливает таймер выстрела.
        enemy.shootTimer = enemy.shootInterval;
        continue;
      }

      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0) {
        enemy.shootTimer = enemy.shootInterval;
        spawnProjectile(enemy);
      }
    }
  }
}

// Создаём снаряд в сторону игрока
function spawnProjectile(source) {
  const dir = player.x >= source.x ? 1 : -1;
  const spawnX = source.x + source.width  / 2 - 10;
  projectiles.push({
    x:      spawnX,
    y:      source.y + source.height / 2 - 10,
    width:  20,
    height: 20,
    vx:     350 * dir,
    startX: spawnX,
    alive:  true,
  });
}

function resolveBubbleCollisions(entity, prevY) {
  for (const bubble of bubbles) {
    if (!bubble.active) continue;
    if (!isOverlapping(entity, bubble)) continue;
    const wasAbove = prevY + entity.height <= bubble.y + 10;
    if (!wasAbove || entity.vy < 0) continue;

    entity.y = bubble.y - entity.height;
    entity.vy = JUMP_FORCE * 1.15;
    entity.onGround = false;
    entity.bubbleBoostTimer = 0.18;
    bubble.pulse = 0.2;
    bubble.active = false;
    break;
  }
}

// --- Снаряды ---
function updateProjectiles(dt) {
  for (const p of projectiles) {
    if (!p.alive) continue;
    p.x += p.vx * dt;
    if (Math.abs(p.x - p.startX) > FIOL_BULLET_MAX_DISTANCE) {
      p.alive = false;
      continue;
    }
    // Снаряды, вышедшие за пределы мира, помечаем как «мёртвые»
    if (p.x < -200 || p.x > WORLD_WIDTH + 200) p.alive = false;
  }
  // Удаляем «мёртвые» снаряды из массива (с конца, чтобы не сбивать индексы)
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (!projectiles[i].alive) projectiles.splice(i, 1);
  }
}

// ----------------------------------------------------------------
// Коллизии
// ----------------------------------------------------------------

// AABB-пересечение двух прямоугольников
function isOverlapping(a, b) {
  return (
    a.x < b.x + b.width  &&
    a.x + a.width  > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function getInsetRect(entity, insetX, insetTop, insetBottom) {
  return {
    x: entity.x + insetX,
    y: entity.y + insetTop,
    width: Math.max(1, entity.width - insetX * 2),
    height: Math.max(1, entity.height - insetTop - insetBottom),
  };
}

// Горизонтальные коллизии с платформами
function resolveHorizontalCollisions(entity, prevX) {
  for (const plat of platforms) {
    if (!isOverlapping(entity, plat)) continue;
    if (prevX + entity.width <= plat.x) {
      entity.x = plat.x - entity.width;
    } else if (prevX >= plat.x + plat.width) {
      entity.x = plat.x + plat.width;
    }
  }
}

// Вертикальные коллизии с платформами
function resolveVerticalCollisions(entity, prevY) {
  for (const plat of platforms) {
    if (!isOverlapping(entity, plat)) continue;
    if (prevY + entity.height <= plat.y) {
      // Приземляемся сверху
      entity.y        = plat.y - entity.height;
      entity.vy       = 0;
      entity.onGround = true;
    } else if (prevY >= plat.y + plat.height) {
      // Упираемся в потолок снизу
      entity.y  = plat.y + plat.height;
      entity.vy = 0;
    }
  }
}

// Горизонтальные коллизии с коробками-бонусами
function resolveHorizontalQBoxCollisions(entity, prevX) {
  for (const box of qboxes) {
    if (!isOverlapping(entity, box)) continue;
    if (prevX + entity.width <= box.x) {
      entity.x = box.x - entity.width;
    } else if (prevX >= box.x + box.width) {
      entity.x = box.x + box.width;
    }
  }
}

// Вертикальные коллизии с коробками; удар снизу активирует коробку
function resolveQBoxCollisions(entity, prevY) {
  for (const box of qboxes) {
    if (!isOverlapping(entity, box)) continue;
    if (prevY + entity.height <= box.y) {
      entity.y        = box.y - entity.height;
      entity.vy       = 0;
      entity.onGround = true;
    } else if (prevY >= box.y + box.height) {
      entity.y  = box.y + box.height;
      entity.vy = 0;
      if (!box.hit) hitQBox(box);
    }
  }
}

// Активирует коробку: запускает анимацию и выбрасывает случайный бонус
function hitQBox(box) {
  box.hit         = true;
  box.bounceTimer = 0.25;
  const types = ["redB", "BlueB", "greenB"];
  const type  = types[Math.floor(Math.random() * types.length)];
  bonuses.push({
    x:       box.x + (QBOX_SIZE - 40) / 2,
    y:       box.y - 4,
    targetY: box.y - QBOX_SIZE - 8,
    width:   40,
    height:  40,
    type:    type,
    vy:      -160,
    phase:   "emerge",
    active:  true,
  });
}

// Анимация дрыгания коробки при ударе
function updateQBoxes(dt) {
  for (const box of qboxes) {
    if (box.bounceTimer > 0) {
      box.bounceTimer -= dt;
      const t          = 1 - box.bounceTimer / 0.25;
      box.bounceOffset = Math.sin(t * Math.PI) * 10;
    } else {
      box.bounceOffset = 0;
    }
  }
}

function updateBubbles(dt) {
  for (const bubble of bubbles) {
    if (!bubble.active) continue;
    if (bubble.pulse > 0) bubble.pulse -= dt;
    if (bubble.pulse < 0) bubble.pulse = 0;
  }
}

function getMainGroundYForBonus(bonus) {
  const left  = bonus.x + 4;
  const right = bonus.x + bonus.width - 4;
  let   bestY = Infinity;

  for (const plat of platforms) {
    // Только основная земля, а не летающие платформы.
    if (plat.height <= 30) continue;
    const overlapsX = right > plat.x && left < plat.x + plat.width;
    if (!overlapsX) continue;

    const topY = plat.y - bonus.height;
    if (topY < bestY) bestY = topY;
  }

  return Number.isFinite(bestY) ? bestY : VIEW_HEIGHT + 200;
}

// Бонусы вылетают из коробки, затем падают на основную платформу
function updateBonuses(dt) {
  for (const bonus of bonuses) {
    if (!bonus.active) continue;

    if (bonus.phase === "emerge") {
      bonus.y += bonus.vy * dt;
      if (bonus.y <= bonus.targetY) {
        bonus.y     = bonus.targetY;
        bonus.vy    = 120;
        bonus.phase = "fall";
      }
    } else if (bonus.phase === "fall") {
      bonus.vy += GRAVITY * 0.55 * dt;
      bonus.y  += bonus.vy * dt;

      const groundY = getMainGroundYForBonus(bonus);
      if (bonus.y >= groundY) {
        bonus.y     = groundY;
        bonus.vy    = 0;
        bonus.phase = "ground";
      }
    }

    if (isOverlapping(player, bonus)) {
      bonus.active  = false;
      playerPowerup = bonus.type;
      playerPowerupTime = POWERUP_DURATION;
    }
  }
  for (let i = bonuses.length - 1; i >= 0; i--) {
    if (!bonuses[i].active) bonuses.splice(i, 1);
  }
}

// Игрок стреляет красным снарядом (только с бонусом greenB, клавиша F)
function shootPlayerBullet() {
  if (playerPowerup !== "greenB" || gameState !== "playing") return;
  const spawnX = player.x + (player.facing === 1 ? player.width : -24);
  playerBullets.push({
    x:      spawnX,
    y:      player.y + player.height / 2 - 12,
    width:  24,
    height: 24,
    vx:     580 * player.facing,
    startX: spawnX,
    alive:  true,
  });
}

// Обновление пуль игрока; при попадании во врага — враг умирает
function updatePlayerBullets(dt) {
  for (const b of playerBullets) {
    if (!b.alive) continue;
    b.x += b.vx * dt;
    if (Math.abs(b.x - b.startX) > PLAYER_BULLET_MAX_DISTANCE) {
      b.alive = false;
      continue;
    }
    if (b.x < -200 || b.x > WORLD_WIDTH + 200) { b.alive = false; continue; }
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (isOverlapping(b, enemy)) {
        b.alive     = false;
        enemy.alive = false;
        break;
      }
    }
  }
  for (let i = playerBullets.length - 1; i >= 0; i--) {
    if (!playerBullets[i].alive) playerBullets.splice(i, 1);
  }
}

// Проверяем столкновение с каждым врагом
function checkAllEnemyCollisions() {
  const playerHurtbox = getInsetRect(
    player,
    PLAYER_HURTBOX_INSET_X,
    PLAYER_HURTBOX_INSET_TOP,
    PLAYER_HURTBOX_INSET_BOTTOM
  );

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const enemyHurtbox = getInsetRect(
      enemy,
      ENEMY_HURTBOX_INSET_X,
      ENEMY_HURTBOX_INSET_TOP,
      ENEMY_HURTBOX_INSET_BOTTOM
    );

    if (!isOverlapping(playerHurtbox, enemyHurtbox)) continue;

    // Если игрок падает сверху — топчем врага
    const stompedFromAbove = player.vy > 0 && player.previousBottom <= enemyHurtbox.y + 8;
    if (stompedFromAbove) {
      enemy.alive = false;
      player.vy   = -400;   // подпрыгиваем после победы над врагом
      statusLabel.textContent = "Enemy defeated! Keep going.";
    } else {
      loseGame("An enemy hit you! Press R to restart.");
    }
  }
}

// Проверяем попадание снарядов в игрока
function checkProjectileCollisions() {
  for (const p of projectiles) {
    if (!p.alive) continue;
    if (isOverlapping(player, p)) {
      p.alive = false;
      loseGame("You were shot! Press R to restart.");
    }
  }
}

function checkCoinCollection() {
  for (const coin of coins) {
    if (coin.collected) continue;
    if (!isOverlapping(player, coin)) continue;

    coin.collected = true;
    coinsCollected += 1;
    statusLabel.textContent = `Coins: ${coinsCollected}/${coins.length}`;
  }
}

function checkFinish() {
  const reached =
    player.x + player.width > finish.x &&
    player.x < finish.x + finish.width + 30 &&
    player.y + player.height > finish.y;
  if (reached) {
    gameState = "won";
    addRecord();
    statusLabel.textContent = `Level complete! Time: ${formatRecordTime(gameTimer)}`;
  }
}

function checkFallOut() {
  if (player.y > VIEW_HEIGHT - 10) {
    // При падении в яму подбрасываем героя обратно в кадр,
    // чтобы анимация смерти была видна игроку.
    player.y = VIEW_HEIGHT - player.height - 170;
    player.vy = 0;
    loseGame("You fell into a pit! Press R to restart.");
  }
}

function loseGame(msg) {
  if (gameState !== "playing") return;
  deathAnimTime = 0;
  gameState = "lost";
  statusLabel.textContent = msg;
}

// Камера плавно следит за игроком
function updateCamera() {
  const target = player.x - VIEW_WIDTH * 0.35;
  camera.x = Math.max(0, Math.min(target, WORLD_WIDTH - VIEW_WIDTH));
}

// ----------------------------------------------------------------
// Отрисовка
// ----------------------------------------------------------------
function draw() {
  ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  drawBackground();

  ctx.save();
  ctx.translate(-camera.x, 0);   // сдвигаем весь мир на позицию камеры

  drawPlatforms();
  drawBubbles();
  drawQBoxes();
  drawBonuses();
  drawCoins();
  drawFinish();

  // Снаряды под врагами
  for (const p of projectiles) {
    if (p.alive) drawProjectile(p);
  }

  // Враги
  for (const enemy of enemies) {
    if (enemy.alive) drawEnemy(enemy);
  }

  drawPlayerBullets();
  drawPlayer(player);
  ctx.restore();

  drawHUD();
  // Оверлей победы/поражения — поверх всего
  drawOverlay();
}

// --- Фоновая сцена ---
function drawBackground() {
  const PX = 4;
  const BG_DARKEN_ALPHA = 0.40;
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  if (BACKGROUND_IMAGE.complete && BACKGROUND_IMAGE.naturalWidth > 0) {
    drawPixelatedBackgroundImage(PX);
    ctx.fillStyle = `rgba(0,0,0,${BG_DARKEN_ALPHA})`;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.restore();
    return;
  }

  // Небо: вертикальный градиент
  const skyGrad = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
  skyGrad.addColorStop(0, "#5bbfff");
  skyGrad.addColorStop(1, "#d6f2ff");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  // Пиксельная текстура неба: больше мелких квадратов = больше "пикселей".
  const ditherOffset = Math.floor(camera.x * 0.1);
  for (let py = 0; py < VIEW_HEIGHT - 80; py += 6) {
    for (let px = 0; px < VIEW_WIDTH; px += 6) {
      const n = (px + py + ditherOffset) % 18;
      if (n < 3) {
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fillRect(px, py, 2, 2);
      } else if (n > 14) {
        ctx.fillStyle = "rgba(120,170,230,0.12)";
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }

  // Облака (лёгкий параллакс — двигаются в 0.25 × скорости камеры)
  const cx = (camera.x * 0.25) % (VIEW_WIDTH + 300);
  drawCloud(120  - cx, 100, 1.0);
  drawCloud(440  - cx, 155, 0.8);
  drawCloud(740  - cx,  88, 1.2);
  drawCloud(1040 - cx, 170, 0.7);
  drawCloud(1300 - cx, 110, 0.9);

  // Зелёная полоса горизонта
  ctx.fillStyle = "#7cc36e";
  ctx.fillRect(0, VIEW_HEIGHT - 80, VIEW_WIDTH, 80);

  // Холмы (параллакс × 0.18)
  for (let i = 0; i < 8; i++) {
    const hx = i * 200 - (camera.x * 0.18) % 200;
    drawHill(hx, VIEW_HEIGHT - 80, 100 + (i % 2) * 24, 70 + (i % 3) * 12, PX);
  }

  ctx.fillStyle = `rgba(0,0,0,${BG_DARKEN_ALPHA})`;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.restore();
}

function drawCloud(x, y, scale) {
  const unit = Math.max(3, Math.floor(6 * scale));
  const blocks = [
    [0, 1], [1, 0], [2, 0], [3, 1],
    [1, 1], [2, 1], [1, 2], [2, 2],
    [4, 1], [3, 0], [3, 2], [0, 2],
  ];

  for (let i = 0; i < blocks.length; i++) {
    const bx = x + blocks[i][0] * unit;
    const by = y + blocks[i][1] * unit;
    ctx.fillStyle = i < 3 ? "rgba(255,255,255,0.9)" : "rgba(244,251,255,0.9)";
    ctx.fillRect(bx, by, unit, unit);
  }
}

function drawHill(x, baseY, width, height, px = 4) {
  const steps = Math.max(6, Math.floor(width / px));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const localX = Math.floor(t * width / px) * px;
    const parabola = 1 - Math.pow((t - 0.5) / 0.5, 2);
    const colH = Math.max(px, Math.floor((height * parabola) / px) * px);

    ctx.fillStyle = "#5ea851";
    ctx.fillRect(x + localX, baseY - colH, px, colH);

    ctx.fillStyle = "#79c167";
    ctx.fillRect(x + localX, baseY - colH, px, Math.min(px, colH));
  }
}

// --- Платформы ---
function drawPlatforms() {
  const blockImage = IMAGES["blok"];

  for (const plat of platforms) {
    // Летающие платформы рисуем через blok.png с растягиванием под нужные размеры.
    if (plat.height <= 30) {
      if (blockImage && blockImage.complete && blockImage.naturalWidth > 0) {
        ctx.drawImage(blockImage, plat.x, plat.y, plat.width, plat.height);
      } else {
        // Запасной стиль до загрузки изображения.
        ctx.fillStyle = "#c97b37";
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        const bw = 22;
        for (let x = plat.x; x < plat.x + plat.width; x += bw) {
          ctx.strokeStyle = "rgba(88,40,12,0.45)";
          ctx.strokeRect(x, plat.y, bw, plat.height);
        }
      }

      continue;
    }

    // Высокие платформы (земля)
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
    ctx.fillStyle = "#efc46a";
    ctx.fillRect(plat.x, plat.y, plat.width, 8);
  }
}

function drawCoins() {
  const coinImage = IMAGES["money"];

  for (const coin of coins) {
    if (coin.collected) continue;

    if (coinImage && coinImage.complete && coinImage.naturalWidth > 0) {
      ctx.drawImage(coinImage, coin.x, coin.y, coin.width, coin.height);
    } else {
      ctx.fillStyle = "#ffd33d";
      ctx.beginPath();
      ctx.arc(coin.x + coin.width / 2, coin.y + coin.height / 2, coin.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffea8a";
      ctx.fillRect(coin.x + coin.width * 0.42, coin.y + coin.height * 0.2, coin.width * 0.16, coin.height * 0.6);
    }
  }
}

// --- Пузырь-парирование ---
function drawBubbles() {
  const img = IMAGES["bubble"];

  for (const bubble of bubbles) {
    if (!bubble.active) continue;
    const scale = bubble.pulse > 0 ? 1 + Math.sin((bubble.pulse / 0.2) * Math.PI) * 0.12 : 1;
    const w = bubble.width * scale;
    const h = bubble.height * scale;
    const dx = bubble.x - (w - bubble.width) / 2;
    const dy = bubble.y - (h - bubble.height) / 2;

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, dx, dy, w, h);
    } else {
      ctx.fillStyle = "rgba(160,230,255,0.85)";
      ctx.beginPath();
      ctx.arc(dx + w / 2, dy + h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

// --- Вопросительные коробки ---
function drawQBoxes() {
  for (const box of qboxes) {
    const img   = IMAGES[box.hit ? "kub1" : "kub"];
    const drawY = box.y - box.bounceOffset;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, box.x, drawY, box.width, box.height);
    } else {
      ctx.fillStyle   = box.hit ? "#a07840" : "#f0a020";
      ctx.fillRect(box.x, drawY, box.width, box.height);
      ctx.strokeStyle = "#7a4a10";
      ctx.lineWidth   = 2;
      ctx.strokeRect(box.x, drawY, box.width, box.height);
      if (!box.hit) {
        ctx.save();
        ctx.fillStyle    = "#fff";
        ctx.font         = "bold 26px Arial";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", box.x + box.width / 2, drawY + box.height / 2);
        ctx.restore();
      }
    }
  }
}

// --- Выпавшие бонусы ---
function drawBonuses() {
  for (const bonus of bonuses) {
    if (!bonus.active) continue;
    const img = IMAGES[bonus.type];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, bonus.x, bonus.y, bonus.width, bonus.height);
    } else {
      ctx.fillStyle = bonus.type === "redB"  ? "#ff4444"
                    : bonus.type === "BlueB" ? "#4488ff"
                    : "#44cc44";
      ctx.beginPath();
      ctx.arc(bonus.x + bonus.width / 2, bonus.y + bonus.height / 2, bonus.width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// --- Пули игрока (greenB) ---
function drawPlayerBullets() {
  const img = IMAGES["red"];
  for (const b of playerBullets) {
    if (!b.alive) continue;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, b.x, b.y, b.width, b.height);
    } else {
      ctx.fillStyle = "#ff2020";
      ctx.beginPath();
      ctx.arc(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// --- HUD: coins, time, active bonus ---
function drawHUD() {
  ctx.save();
  ctx.textAlign    = "left";
  ctx.textBaseline = "top";

  const panelH = playerPowerup ? 88 : 58;
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(10, 10, 230, panelH);

  ctx.fillStyle = "#ffe066";
  ctx.font      = "bold 20px 'Trebuchet MS', sans-serif";
  ctx.fillText(`Coins: ${coinsCollected}/${coins.length}`, 20, 18);

  const mins = String(Math.floor(gameTimer / 60)).padStart(2, "0");
  const secs = String(Math.floor(gameTimer % 60)).padStart(2, "0");
  ctx.fillStyle = "#ffffff";
  ctx.font      = "18px 'Trebuchet MS', sans-serif";
  ctx.fillText(`Time: ${mins}:${secs}`, 20, 44);

  if (playerPowerup) {
    ctx.fillStyle = playerPowerup === "redB"  ? "#ff7755"
                  : playerPowerup === "BlueB" ? "#55aaff"
                  : "#55ee66";
    ctx.font      = "bold 16px 'Trebuchet MS', sans-serif";
    const leftSec = Math.max(0, Math.ceil(playerPowerupTime));
    const label   = playerPowerup === "greenB"
      ? `${playerPowerup}   F - shoot`
      : playerPowerup;
    ctx.fillText(`${label} (${leftSec}с)`, 20, 68);
  }

  ctx.restore();
}

// --- Игрок ---
function drawPlayer(hero) {
  ctx.save();

  const isDead = gameState === "lost";
  const shakeX = isDead ? Math.sin(deathAnimTime * 45) * 3 : 0;
  const shakeY = isDead ? Math.cos(deathAnimTime * 38) * 2 : 0;

  // Центрируем систему координат на спрайте, зеркалим при движении влево
  ctx.translate(hero.x + hero.width / 2 + shakeX, hero.y + shakeY);
  ctx.scale(hero.facing, 1);
  ctx.translate(-hero.width / 2, 0);

  // Во время смерти показываем dead-спрайт; во время рывка — Sprint, иначе run/stand.
  const dead = IMAGES[currentSkin + ".dead"];
  const sprint = IMAGES[currentSkin + ".sprint"];
  const baseKey = hero.isRunning ? (currentSkin + ".run") : (currentSkin + ".stand");
  const canUseDead = isDead && dead && dead.complete && dead.naturalWidth > 0;
  const canUseSprint = hero.isDashing && sprint && sprint.complete && sprint.naturalWidth > 0;
  const img    = canUseDead ? dead : (canUseSprint ? sprint : IMAGES[baseKey]);

  if (img && img.complete && img.naturalWidth > 0) {
    // Небольшой визуальный сдвиг вниз: убирает ощущение, что персонаж "парит".
    ctx.drawImage(img, 0, PLAYER_DRAW_Y_OFFSET, hero.width, hero.height);
  } else {
    // Запасный вид пока изображения не загрузились
    ctx.fillStyle = "#d6342c";  ctx.fillRect(6, PLAYER_DRAW_Y_OFFSET, 22, 8);
    ctx.fillStyle = "#f4c6a2";  ctx.fillRect(8, 12 + PLAYER_DRAW_Y_OFFSET, 18, 14);
    ctx.fillStyle = "#2f72d6";  ctx.fillRect(7, 26 + PLAYER_DRAW_Y_OFFSET, 20, 30);
  }

  ctx.restore();
}

// --- Враг (спрайт, зеркалится по направлению патрулирования) ---
function drawEnemy(enemy) {
  const img = IMAGES[enemy.type];

  ctx.save();
  ctx.translate(enemy.x + enemy.width / 2, enemy.y);
  ctx.scale(enemy.direction, 1);   // зеркалим по направлению движения
  ctx.translate(-enemy.width / 2, 0);

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, 0, ENEMY_DRAW_Y_OFFSET, enemy.width, enemy.height);
  } else {
    // Запасный цветной прямоугольник
    ctx.fillStyle = enemy.type === "blue" ? "#2170c7"
                  : enemy.type === "grib" ? "#c73221"
                  : "#7b21c7";
    ctx.fillRect(0, ENEMY_DRAW_Y_OFFSET, enemy.width, enemy.height);
  }

  ctx.restore();
}

// --- Снаряд fiol-а (fioll.png) ---
function drawProjectile(p) {
  const img = IMAGES["fioll"];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, p.x, p.y, p.width, p.height);
  } else {
    // Запасный красный круг
    ctx.fillStyle = "#ff3a3a";
    ctx.beginPath();
    ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Финишный флаг ---
function drawFinish() {
  const flagImg = gameState === "won" ? IMAGES["flag2"] : IMAGES["falg1"];
  if (flagImg && flagImg.complete) {
    ctx.drawImage(flagImg, finish.x, finish.y, 80, 180);
  } else {
    // Fallback: draw simple pole if image not loaded
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(finish.x, finish.y, finish.width, finish.height);
    ctx.fillStyle = "#2ca65a";
    ctx.beginPath();
    ctx.moveTo(finish.x + finish.width, finish.y + 8);
    ctx.lineTo(finish.x + 80, finish.y + 30);
    ctx.lineTo(finish.x + finish.width, finish.y + 52);
    ctx.closePath();
    ctx.fill();
  }
}

// --- Полупрозрачный оверлей победы / поражения ---
function drawOverlay() {
  if (gameState === "playing") return;

  ctx.fillStyle = "rgba(10,20,40,0.6)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  // Заголовок
  ctx.fillStyle = gameState === "won" ? "#ffe066" : "#ff5555";
  ctx.font      = "bold 56px 'Trebuchet MS', sans-serif";
  ctx.fillText(
    gameState === "won" ? "Level complete!" : "Game over",
    VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 36
  );

  // Подсказка
  ctx.fillStyle = "#ffffff";
  ctx.font      = "28px 'Trebuchet MS', sans-serif";
  ctx.fillText("Press R to restart", VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 22);
}

// ----------------------------------------------------------------
// Главный игровой цикл
// ----------------------------------------------------------------
function loop(timestamp) {
  // deltaTime ограничен 1/30 с, чтобы большие лаги не ломали физику
  const deltaTime = Math.min((timestamp - lastTime) / 1000 || 0, 1 / 30);
  lastTime = timestamp;

  update(deltaTime);
  draw();
  requestAnimationFrame(loop);
}

// Запуск
resetGame();
setMenuOpen(true);
requestAnimationFrame(loop);

import * as THREE from 'https://unpkg.com/three@0.163.0/build/three.module.js';

const LEVELS = [
  {
    id: 1,
    name: 'City Streets',
    length: 1400,
    timeLimit: 95,
    speedScale: 1,
    obstacleRate: 0.13,
    enemyRate: 0.08,
    bonusRate: 0.16,
    sky: 0x75d7ff,
    fog: 0x93dfff,
    roadSide: 0x2b4f66
  },
  {
    id: 2,
    name: 'Industrial Zone',
    length: 1700,
    timeLimit: 100,
    speedScale: 1.12,
    obstacleRate: 0.18,
    enemyRate: 0.12,
    bonusRate: 0.15,
    sky: 0x8ca0af,
    fog: 0xa7a8ab,
    roadSide: 0x454749
  },
  {
    id: 3,
    name: 'Suburbs / Highway',
    length: 2100,
    timeLimit: 115,
    speedScale: 1.25,
    obstacleRate: 0.27,
    enemyRate: 0.19,
    bonusRate: 0.14,
    sky: 0x8fd9b4,
    fog: 0xa8e8c8,
    roadSide: 0x2f5840
  },
  {
    id: 4,
    name: 'Mountain Pass',
    length: 2500,
    timeLimit: 125,
    speedScale: 1.40,
    obstacleRate: 0.33,
    enemyRate: 0.23,
    bonusRate: 0.16,
    sky: 0xc6dcff,
    fog: 0xd9e8ff,
    roadSide: 0x536280
  },
  {
    id: 5,
    name: 'Neon Megacity',
    length: 3000,
    timeLimit: 135,
    speedScale: 1.55,
    obstacleRate: 0.40,
    enemyRate: 0.28,
    bonusRate: 0.15,
    sky: 0x1d153f,
    fog: 0x2e1f5e,
    roadSide: 0x3f266f
  }
];

const LANE_LIMIT = 16;
const ROAD_WIDTH = 26;
const HALF_PI = Math.PI / 2;
const API_BASE = window.location.port === '3000' ? '' : 'http://localhost:3000';
const CAR_COLOR_THEMES = {
  cyan: { body: 0x19bfd0, rim: 0xbad7ff, rimGlow: 0x174a7c, underglow: 0x44f0ff, underglowGlow: 0x1ea0c0 },
  red: { body: 0xd04a4a, rim: 0xffc2c2, rimGlow: 0x7a1f1f, underglow: 0xff6c6c, underglowGlow: 0xa02323 },
  blue: { body: 0x3e72d6, rim: 0xc7d8ff, rimGlow: 0x203c7f, underglow: 0x72a3ff, underglowGlow: 0x274d9d },
  green: { body: 0x2da56a, rim: 0xc6ffe1, rimGlow: 0x1f6545, underglow: 0x63e0a2, underglowGlow: 0x1f7b52 },
  orange: { body: 0xd48532, rim: 0xffe1ba, rimGlow: 0x7f4a1f, underglow: 0xffb56b, underglowGlow: 0x9b5b20 },
  white: { body: 0xd9e3ee, rim: 0xffffff, rimGlow: 0x4a5968, underglow: 0xa8d8ff, underglowGlow: 0x39688e }
};

const musicState = {
  ctx: null,
  masterGain: null,
  timer: null,
  step: 0
};

const dom = {
  canvas: document.getElementById('gameCanvas'),
  menuOverlay: document.getElementById('menuOverlay'),
  gameOverOverlay: document.getElementById('gameOverOverlay'),
  gameOverTitle: document.getElementById('gameOverTitle'),
  gameOverText: document.getElementById('gameOverText'),
  happyEndOverlay: document.getElementById('happyEndOverlay'),
  happyEndText: document.getElementById('happyEndText'),
  startBtn: document.getElementById('startBtn'),
  continueBtn: document.getElementById('continueBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  retryBtn: document.getElementById('retryBtn'),
  menuBtn: document.getElementById('menuBtn'),
  happyEndMenuBtn: document.getElementById('happyEndMenuBtn'),
  menuStatus: document.getElementById('menuStatus'),
  playerName: document.getElementById('playerName'),
  carColorSelect: document.getElementById('carColorSelect'),
  musicToggleBtn: document.getElementById('musicToggleBtn'),
  graphicsSelect: document.getElementById('graphicsSelect'),
  hud: document.getElementById('hud'),
  hudPlayer: document.getElementById('hudPlayer'),
  hudLevel: document.getElementById('hudLevel'),
  hudScore: document.getElementById('hudScore'),
  hudFuel: document.getElementById('hudFuel'),
  hudHealth: document.getElementById('hudHealth'),
  hudNitro: document.getElementById('hudNitro'),
  hudAcc: document.getElementById('hudAcc'),
  hudBrk: document.getElementById('hudBrk'),
  hudHdl: document.getElementById('hudHdl'),
    eventFeed: document.getElementById('eventFeed')
  };

const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 1500);
const clock = new THREE.Clock();

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x172134, 1.15);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(-12, 30, 8);
scene.add(hemiLight, dirLight);

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(ROAD_WIDTH, 12000),
  new THREE.MeshStandardMaterial({ color: 0x1b1f2d, roughness: 0.95, metalness: 0.04 })
);
road.rotation.x = -HALF_PI;
road.position.set(0, -0.02, -6000);
scene.add(road);

const roadLines = new THREE.Group();
for (let i = 0; i < 240; i += 1) {
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.03, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8f8ff, emissive: 0x1f2b55 })
  );
  line.position.set(0, 0.02, -i * 45);
  roadLines.add(line);
}
scene.add(roadLines);

const roadsideGroup = new THREE.Group();
scene.add(roadsideGroup);

const player = createPlayerCar();
scene.add(player.mesh);

const world = {
  objects: [],
  levelGroup: new THREE.Group(),
  currentLevelConfig: LEVELS[0],
  levelTime: 0,
  levelElapsed: 0,
  levelDistance: 0,
  gameRunning: false,
  paused: false,
  keys: {},
  eventTimer: 0,
  lastEvent: '',
  selectedStartLevel: 1
};
scene.add(world.levelGroup);

const progress = {
  // Persistent player profile. This object is the single source of truth
  // for current run stats, upgrade progression, and menu preferences.
  // It is serialized to the backend and restored on Continue.
  playerName: '',
  currentLevel: 1,
  unlockedLevel: 1,
  score: 0,
  coins: 0,
  stats: {
    health: 100,
    fuel: 100,
    nitro: 0
  },
  upgrades: {
    acceleration: 1,
    brakes: 1,
    handling: 1
  },
  settings: {
    graphics: 'high',
    carColor: 'cyan',
    musicEnabled: true
  }
};

const startSnapshot = {
  score: 0,
  coins: 0,
  stats: { health: 100, fuel: 100, nitro: 0 },
  upgrades: { acceleration: 1, brakes: 1, handling: 1 }
};

function updateMusicToggleButton() {
  dom.musicToggleBtn.textContent = progress.settings.musicEnabled ? 'Music: On' : 'Music: Off';
  dom.musicToggleBtn.classList.toggle('music-off', !progress.settings.musicEnabled);
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function triggerTone({ frequency, type, volume, duration, attack = 0.01, release = 0.12, detune = 0 }) {
  if (!musicState.ctx || !musicState.masterGain || musicState.ctx.state !== 'running') {
    return;
  }

  const now = musicState.ctx.currentTime;
  const osc = musicState.ctx.createOscillator();
  const gain = musicState.ctx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detune;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

  osc.connect(gain);
  gain.connect(musicState.masterGain);

  osc.start(now);
  osc.stop(now + duration + release + 0.02);
}

// The soundtrack is generated procedurally: each step schedules bass, lead,
// and pad notes so we can keep looping music without shipping any audio files.
function playMusicStep() {
  const step = musicState.step % 16;
  const chordRoots = [45, 48, 43, 47];
  const chordRoot = chordRoots[Math.floor((musicState.step % 32) / 8)];

  if (step % 4 === 0) {
    triggerTone({
      frequency: midiToFrequency(chordRoot - 12),
      type: 'triangle',
      volume: 0.08,
      duration: 0.2,
      attack: 0.01,
      release: 0.08
    });
  }

  if (step % 2 === 0) {
    const leadOffsets = [7, 10, 12, 10, 7, 5, 3, 5];
    const leadNote = chordRoot + leadOffsets[(musicState.step / 2) % leadOffsets.length];
    triggerTone({
      frequency: midiToFrequency(leadNote),
      type: 'sawtooth',
      volume: 0.03,
      duration: 0.13,
      attack: 0.006,
      release: 0.1,
      detune: step % 4 === 0 ? -2 : 2
    });
  }

  if (step === 0 || step === 8) {
    triggerTone({
      frequency: midiToFrequency(chordRoot),
      type: 'sine',
      volume: 0.028,
      duration: 0.5,
      attack: 0.04,
      release: 0.22
    });
    triggerTone({
      frequency: midiToFrequency(chordRoot + 7),
      type: 'sine',
      volume: 0.018,
      duration: 0.45,
      attack: 0.04,
      release: 0.22
    });
  }

  musicState.step += 1;
}

async function ensureMusicContextReady() {
  if (!musicState.ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return false;
    }
    musicState.ctx = new AudioCtx();
    musicState.masterGain = musicState.ctx.createGain();
    musicState.masterGain.gain.value = 0.5;
    musicState.masterGain.connect(musicState.ctx.destination);
  }

  if (musicState.ctx.state === 'suspended') {
    await musicState.ctx.resume();
  }

  return musicState.ctx.state === 'running';
}

function stopMusicLoop() {
  if (musicState.timer) {
    clearInterval(musicState.timer);
    musicState.timer = null;
  }
}

// Starts a timed sequencer loop. We keep a fixed 150ms step so melody,
// bass rhythm, and ambience stay synchronized regardless of frame rate.
async function startMusicLoop() {
  if (!progress.settings.musicEnabled) {
    stopMusicLoop();
    return;
  }

  const ready = await ensureMusicContextReady();
  if (!ready || musicState.timer) {
    return;
  }

  // Keep music clearly audible after resumes/restarts.
  musicState.masterGain.gain.value = 0.5;

  musicState.step = 0;
  playMusicStep();
  musicState.timer = setInterval(playMusicStep, 150);
}

function setMusicEnabled(enabled) {
  progress.settings.musicEnabled = Boolean(enabled);
  updateMusicToggleButton();
  if (progress.settings.musicEnabled) {
    startMusicLoop();
  } else {
    stopMusicLoop();
  }
}

function normalizeCarColor(color) {
  return CAR_COLOR_THEMES[color] ? color : 'cyan';
}

function createPlayerCar(colorKey = 'cyan') {
  const mesh = new THREE.Group();
  const theme = CAR_COLOR_THEMES[normalizeCarColor(colorKey)];

  const bodyMat = new THREE.MeshStandardMaterial({ color: theme.body, metalness: 0.32, roughness: 0.34 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x101826, metalness: 0.35, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x204a7a, metalness: 0.65, roughness: 0.12 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.72, 4.7), bodyMat);
  body.position.y = 0.78;
  mesh.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.52, 2.2), darkMat);
  roof.position.set(0, 1.3, -0.2);
  mesh.add(roof);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.18, 1.05), bodyMat);
  hood.position.set(0, 1.08, 1.7);
  mesh.add(hood);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.2, 0.9), bodyMat);
  trunk.position.set(0, 1.02, -1.9);
  mesh.add(trunk);

  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.34, 0.08), glassMat);
  windscreen.position.set(0, 1.42, 0.82);
  mesh.add(windscreen);

  const rearWindow = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.3, 0.08), glassMat);
  rearWindow.position.set(0, 1.4, -1.2);
  mesh.add(rearWindow);

  const sideWindowL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 1.35), glassMat);
  sideWindowL.position.set(-0.93, 1.38, -0.18);
  mesh.add(sideWindowL);

  const sideWindowR = sideWindowL.clone();
  sideWindowR.position.x = 0.93;
  mesh.add(sideWindowR);

  const spoiler = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.12, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x0f1f35, emissive: 0x0b3048, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.45 })
  );
  spoiler.position.set(0, 1.2, -2.32);
  mesh.add(spoiler);

  const wheelGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.34, 14);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x101010, metalness: 0.45, roughness: 0.55 });
  const rimMat = new THREE.MeshStandardMaterial({ color: theme.rim, emissive: theme.rimGlow, emissiveIntensity: 0.22, metalness: 0.8, roughness: 0.18 });
  const wheelPositions = [
    [-1.24, 0.49, 1.42],
    [1.24, 0.49, 1.42],
    [-1.24, 0.49, -1.42],
    [1.24, 0.49, -1.42]
  ];

  for (const pos of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = HALF_PI;
    wheel.position.set(...pos);
    mesh.add(wheel);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 12), rimMat);
    rim.rotation.z = HALF_PI;
    rim.position.set(pos[0], pos[1], pos[2]);
    mesh.add(rim);
  }

  const headLightMat = new THREE.MeshStandardMaterial({ color: 0xd7faff, emissive: 0x62d8ff, emissiveIntensity: 0.65, metalness: 0.2, roughness: 0.22 });
  const tailLightMat = new THREE.MeshStandardMaterial({ color: 0xff5959, emissive: 0xb61a1a, emissiveIntensity: 0.7, metalness: 0.15, roughness: 0.3 });

  const headL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.1), headLightMat);
  headL.position.set(-0.72, 1.0, 2.34);
  mesh.add(headL);

  const headR = headL.clone();
  headR.position.x = 0.72;
  mesh.add(headR);

  const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.1), tailLightMat);
  tailL.position.set(-0.82, 0.95, -2.36);
  mesh.add(tailL);

  const tailR = tailL.clone();
  tailR.position.x = 0.82;
  mesh.add(tailR);

  const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.18, 0.15), darkMat);
  bumperFront.position.set(0, 0.33, 2.34);
  mesh.add(bumperFront);

  const bumperRear = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.18, 0.15), darkMat);
  bumperRear.position.set(0, 0.33, -2.34);
  mesh.add(bumperRear);

  const underglow = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.035, 4.0),
    new THREE.MeshStandardMaterial({ color: theme.underglow, emissive: theme.underglowGlow, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.2 })
  );
  underglow.position.set(0, 0.045, -0.1);
  mesh.add(underglow);

  mesh.position.set(0, 0, 3);

  return {
    mesh,
    speed: 0,
    lateralSpeed: 0,
    maxSpeed: 94,
    boost: 0,
    invincibleTimer: 0
  };
}

function applyPlayerCarColor(colorKey) {
  const currentPosition = player.mesh.position.clone();
  const currentRotation = player.mesh.rotation.clone();

  scene.remove(player.mesh);

  const upgradedPlayer = createPlayerCar(colorKey);
  player.mesh = upgradedPlayer.mesh;
  player.mesh.position.copy(currentPosition);
  player.mesh.rotation.copy(currentRotation);

  scene.add(player.mesh);
}

function resetPlayerDynamics() {
  player.mesh.position.set(0, 0, 3);
  player.mesh.rotation.set(0, Math.PI, 0);
  player.speed = 0;
  player.lateralSpeed = 0;
  player.boost = 0;
  player.invincibleTimer = 1;
}

function seededRandom(seed) {
  const x = Math.sin(seed * 999.91) * 10000;
  return x - Math.floor(x);
}

function buildLevel(levelId) {
  // Level build pipeline:
  // 1) Reset world state and player dynamics.
  // 2) Apply visual theme (sky/fog/roadside colors).
  // 3) Spawn gameplay objects with cooldowns to avoid impossible clusters.
  // 4) Spawn special entities and report level start to the event feed.
  const level = LEVELS[levelId - 1];
  world.currentLevelConfig = level;

  world.levelGroup.clear();
  roadsideGroup.clear();
  world.objects = [];
  world.levelElapsed = 0;
  world.levelDistance = 0;
  world.levelTime = level.timeLimit;
  resetPlayerDynamics();

  scene.background = new THREE.Color(level.sky);
  scene.fog = new THREE.Fog(level.fog, 80, 260);

  const sideMat = new THREE.MeshStandardMaterial({ color: level.roadSide, roughness: 1, metalness: 0 });
  const sideSize = new THREE.Vector3(16, 2, level.length + 350);
  const leftSide = new THREE.Mesh(new THREE.BoxGeometry(sideSize.x, sideSize.y, sideSize.z), sideMat);
  leftSide.position.set(-(ROAD_WIDTH / 2 + sideSize.x / 2), -1, -level.length / 2);
  const rightSide = leftSide.clone();
  rightSide.position.x *= -1;
  world.levelGroup.add(leftSide, rightSide);

  let obstacleCooldown = 0;
  let trafficCooldown = 0;

  for (let z = 25; z < level.length; z += 50) {
    const rnd = seededRandom(z + level.id * 1000);
    if (obstacleCooldown <= 0 && rnd < level.obstacleRate) {
      spawnTrashBin(z, rnd);
      obstacleCooldown = Math.max(95 - level.id * 12, 42);
    }

    obstacleCooldown -= 50;

    if (trafficCooldown <= 0 && rnd > 0.28 && rnd < 0.28 + level.enemyRate) {
      spawnTrafficCar(z, rnd);
      trafficCooldown = Math.max(120 - level.id * 12, 55);
    }

    trafficCooldown -= 50;

    if (rnd > 0.65 && rnd < 0.65 + level.bonusRate) {
      spawnBonus(z, rnd);
    }

    if (rnd > 0.92) {
      spawnHelper(z, rnd);
    }

    // Spawn roadside decor regularly based on loop step index.
    if (Math.floor((z - 25) / 50) % 4 === 0) {
      spawnRoadsideDecor(z);
    }
  }

  spawnPedestriansForLevel(level);

  if (levelId === 5) {
    spawnBoss(level.length - 260);
  }

  applyGraphicsSettings(progress.settings.graphics);
  feed(`Level ${level.id}: ${level.name}`);
}

function createTrafficCarMesh(color) {
  const car = new THREE.Group();
  
  // Main body shell
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.9, 4.8),
    new THREE.MeshStandardMaterial({ color, metalness: 0.28, roughness: 0.38 })
  );
  body.position.y = 0.95;
  car.add(body);
  
  // Cabin (upper body)
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.55, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x152b4d, emissive: 0x0b1930, metalness: 0.08, roughness: 0.4 })
  );
  cabin.position.set(0, 1.5, -0.25);
  car.add(cabin);
  
  // Wheels (4x)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.6 });
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 8);
  
  // Front-left wheel
  const wheelFL = new THREE.Mesh(wheelGeo, wheelMat);
  wheelFL.rotation.z = Math.PI / 2;
  wheelFL.position.set(-1.35, 0.5, 1.4);
  car.add(wheelFL);
  
  // Front-right wheel
  const wheelFR = new THREE.Mesh(wheelGeo, wheelMat);
  wheelFR.rotation.z = Math.PI / 2;
  wheelFR.position.set(1.35, 0.5, 1.4);
  car.add(wheelFR);
  
  // Rear-left wheel
  const wheelBL = new THREE.Mesh(wheelGeo, wheelMat);
  wheelBL.rotation.z = Math.PI / 2;
  wheelBL.position.set(-1.35, 0.5, -1.4);
  car.add(wheelBL);
  
  // Rear-right wheel
  const wheelBR = new THREE.Mesh(wheelGeo, wheelMat);
  wheelBR.rotation.z = Math.PI / 2;
  wheelBR.position.set(1.35, 0.5, -1.4);
  car.add(wheelBR);
  
  // Left side window
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x1a4d6d, metalness: 0.6, roughness: 0.1 });
  const windowLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.4, 1.2),
    windowMat
  );
  windowLeft.position.set(-0.95, 1.65, 0.2);
  car.add(windowLeft);
  
  // Right side window
  const windowRight = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.4, 1.2),
    windowMat
  );
  windowRight.position.set(0.95, 1.65, 0.2);
  car.add(windowRight);
  
  // Rear window
  const windowRear = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.35, 0.08),
    windowMat
  );
  windowRear.position.set(0, 1.65, -2.15);
  car.add(windowRear);
  
  // Front left headlight
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffff99, emissive: 0xffff44, metalness: 0.1, roughness: 0.3 });
  const headlightLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.25, 0.08),
    headlightMat
  );
  headlightLeft.position.set(-0.8, 1.3, 2.35);
  car.add(headlightLeft);
  
  // Front right headlight
  const headlightRight = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.25, 0.08),
    headlightMat
  );
  headlightRight.position.set(0.8, 1.3, 2.35);
  car.add(headlightRight);
  
  // Left taillight
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff0000, metalness: 0.1, roughness: 0.3 });
  const tailLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.08),
    tailMat
  );
  tailLeft.position.set(-0.9, 1.3, -2.35);
  car.add(tailLeft);
  
  // Right taillight
  const tailRight = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.08),
    tailMat
  );
  tailRight.position.set(0.9, 1.3, -2.35);
  car.add(tailRight);
  
  // Front bumper
  const bumperFront = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.2, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.4, roughness: 0.5 })
  );
  bumperFront.position.set(0, 0.4, 2.4);
  car.add(bumperFront);
  
  // Rear bumper
  const bumperRear = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.2, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.4, roughness: 0.5 })
  );
  bumperRear.position.set(0, 0.4, -2.4);
  car.add(bumperRear);
  
  // Side door handles
  const doorHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.1, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.4 })
  );
  doorHandle.position.set(-1.38, 1.0, 0.2);
  car.add(doorHandle);
  
  const doorHandleR = doorHandle.clone();
  doorHandleR.position.x = 1.38;
  car.add(doorHandleR);
  
  return car;
}

function spawnTrafficCar(z, rnd) {
  const carColors = [0xff4d6d, 0x42b3ff, 0xf8b400, 0x54d27f, 0xb184ff];
  // Random lane assignment (left, center, right)
  const laneRandom = seededRandom(z + 91);
  let laneX;
  if (laneRandom < 0.33) {
    laneX = -4.5; // left lane
  } else if (laneRandom < 0.66) {
    laneX = 0; // center lane
  } else {
    laneX = 4.5; // right lane
  }
  
  const colorIndex = Math.floor(seededRandom(z + 43) * carColors.length);
  const mesh = createTrafficCarMesh(carColors[colorIndex]);
  const isOncoming = seededRandom(z + 777) > 0.4; // 60% same direction, 40% oncoming
  
  mesh.position.set(laneX, 0, isOncoming ? world.currentLevelConfig.length + 50 : -z);
  if (isOncoming) {
    mesh.rotation.y = Math.PI; // rotate oncoming cars to face player
  }
  
  world.levelGroup.add(mesh);

  world.objects.push({
    type: 'trafficCar',
    mesh,
    laneX,
    isOncoming,
    speed: 12 + seededRandom(z + 81) * 10,
    active: true,
    radius: 1.95
  });
}

function createTrashBinMesh() {
  const bin = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d3138, metalness: 0.08, roughness: 0.9 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x242830, metalness: 0.1, roughness: 0.85 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.72, 2.1, 14), bodyMat);
  body.position.y = 1.05;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.18, 14), lidMat);
  lid.position.y = 2.18;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), lidMat);
  knob.position.y = 2.31;

  bin.add(body, lid, knob);
  return bin;
}

function spawnTrashBin(z, rnd) {
  const side = seededRandom(z + 77) > 0.5 ? 1 : -1;
  const x = side * (4 + seededRandom(z + 131) * 7.5);
  const mesh = createTrashBinMesh();
  mesh.position.set(x, 0, -z);
  world.levelGroup.add(mesh);
  world.objects.push({ type: 'trashBin', mesh, active: true, radius: 1.35 });
}

function createPedestrianMesh() {
  const person = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0b48a, roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x5564ff, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f1f24, roughness: 0.85 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), skin);
  head.position.y = 1.65;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.9, 10), cloth);
  torso.position.y = 1.05;
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.62, 8), dark);
  legL.position.set(-0.13, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.56, 8), skin);
  armL.position.set(-0.32, 1.03, 0);
  armL.rotation.z = 0.35;
  const armR = armL.clone();
  armR.position.x = 0.32;
  armR.rotation.z = -0.35;

  person.add(head, torso, legL, legR, armL, armR);
  return person;
}

function spawnPedestriansForLevel(level) {
  for (let i = 0; i < 2; i += 1) {
    const seed = level.id * 3000 + i * 211;
    const x = (seededRandom(seed + 91) * 2 - 1) * (LANE_LIMIT - 2.7);
    const z = -(level.length * (0.35 + i * 0.3) + seededRandom(seed + 13) * 45);
    const mesh = createPedestrianMesh();
    mesh.position.set(x, 0, z);
    world.levelGroup.add(mesh);
    world.objects.push({
      type: 'pedestrian',
      mesh,
      baseX: x,
      dir: i % 2 === 0 ? 1 : -1,
      speed: 1.8 + seededRandom(seed + 51),
      active: true,
      radius: 1.0
    });
  }
}

function getBonusKind(seed) {
  const roll = seededRandom(seed);
  if (roll < 0.70) {
    return 'coin';
  }
  if (roll < 0.82) {
    return 'fuel';
  }
  if (roll < 0.92) {
    return 'nitro';
  }
  return 'upgrade';
}

function createBonusCanisterMesh() {
  const style = { body: 0xd9192b, detail: 0x930f1d, glow: 0xff433d };

  const canister = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: style.body,
    emissive: style.detail,
    emissiveIntensity: 0.45,
    metalness: 0.2,
    roughness: 0.45
  });
  const detailMat = new THREE.MeshStandardMaterial({
    color: style.detail,
    emissive: 0x240306,
    metalness: 0.18,
    roughness: 0.5
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.5, 0.55), bodyMat);
  body.position.y = 0.8;

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.34), detailMat);
  neck.position.set(0.3, 1.58, 0);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10), detailMat);
  cap.rotation.z = HALF_PI;
  cap.position.set(0.5, 1.58, 0);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.26), detailMat);
  handle.position.set(-0.2, 1.54, 0);

  const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.03), detailMat);
  stamp.position.set(0, 0.84, 0.29);

  canister.add(body, neck, cap, handle, stamp);
  return { mesh: canister, glow: null };
}

function createCoinMesh() {
  const coinMaterial = new THREE.MeshStandardMaterial({
    color: 0xffde59,
    emissive: 0x8a6400,
    emissiveIntensity: 1.05,
    metalness: 0.9,
    roughness: 0.2
  });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.22, 24), coinMaterial);
  coin.rotation.x = HALF_PI;
  return { mesh: coin, glow: null };
}

function spawnBonus(z, rnd) {
  const x = (seededRandom(z + 77) * 2 - 1) * (LANE_LIMIT - 2);
  const kind = getBonusKind(z + rnd * 100);

  const bonusVisual = kind === 'coin' ? createCoinMesh() : createBonusCanisterMesh();
  const mesh = bonusVisual.mesh;
  const glow = bonusVisual.glow;

  mesh.position.set(x, 1.5, -z);
  if (kind !== 'coin') {
    mesh.position.y = 1.35;
  }

  world.levelGroup.add(mesh);
  world.objects.push({ type: 'bonus', bonusKind: kind, mesh, glow, active: true, radius: 1.35 });
}

function spawnHelper(z, rnd) {
  const side = rnd > 0.96 ? -1 : 1;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.4, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x31ffde, emissive: 0x0e4f46 })
  );
  mesh.position.set(side * (LANE_LIMIT + 4.7), 1.2, -z);
  world.levelGroup.add(mesh);
  world.objects.push({ type: 'helper', mesh, active: true, radius: 1.8 });
}

function createStreetLamp() {
  const lamp = new THREE.Group();

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1f2028, metalness: 0.38, roughness: 0.62 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x2a2e3a, metalness: 0.35, roughness: 0.58 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xe7f6ff,
    emissive: 0x5d7da0,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.92
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.45, 0.85, 10), poleMat);
  base.position.y = 0.42;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.2, 10), poleMat);
  pole.position.y = 3.2;

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.38, 10), headMat);
  neck.position.y = 5.95;

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.33, 0.74, 12), headMat);
  head.position.y = 6.42;

  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.48, 10), glassMat);
  glass.position.y = 6.3;

  lamp.add(base, pole, neck, head, glass);
  return lamp;
}

function spawnRoadsideDecor(z) {
  const leftLamp = createStreetLamp();
  leftLamp.scale.setScalar(1.35);
  leftLamp.position.set(-(LANE_LIMIT + 3), 0, -z);
  const rightLamp = createStreetLamp();
  rightLamp.scale.setScalar(1.35);
  rightLamp.position.set(LANE_LIMIT + 3, 0, -z);
  roadsideGroup.add(leftLamp, rightLamp);

  if (seededRandom(z + 640) > 0.55) {
    const height = 6 + seededRandom(z + 111) * 10;
    const width = 2.5 + seededRandom(z + 64) * 3;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, width),
      new THREE.MeshStandardMaterial({ color: 0x233f6f, emissive: 0x08112b })
    );
    block.position.set(-(LANE_LIMIT + 11), height / 2, -z - 18);
    const twin = block.clone();
    twin.position.x = LANE_LIMIT + 11;
    roadsideGroup.add(block, twin);
  }
}

function spawnBoss(z) {
  const boss = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 2.1, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2ea1, emissive: 0x5c1140, metalness: 0.35 })
  );
  boss.position.set(0, 1.1, -z);
  world.levelGroup.add(boss);
  world.objects.push({
    type: 'boss',
    mesh: boss,
    baseX: 0,
    amp: 6,
    freq: 1.05,
    active: true,
    radius: 3.2
  });
}

function applyGraphicsSettings(mode) {
  const low = mode === 'low';
  renderer.setPixelRatio(low ? 0.85 : Math.min(window.devicePixelRatio, 1.4));
  if (scene.fog) {
    scene.fog.near = low ? 70 : 80;
    scene.fog.far = low ? 190 : 240;
  }
  hemiLight.intensity = low ? 0.95 : 1.15;
}

function updateHud() {
  dom.hudPlayer.textContent = progress.playerName || '-';
  dom.hudLevel.textContent = String(progress.currentLevel);
  dom.hudScore.textContent = String(progress.score);
  dom.hudFuel.textContent = String(Math.max(0, Math.round(progress.stats.fuel)));
  dom.hudHealth.textContent = String(Math.max(0, Math.round(progress.stats.health)));
  dom.hudNitro.textContent = String(Math.round(progress.stats.nitro));
  dom.hudAcc.textContent = String(progress.upgrades.acceleration);
  dom.hudBrk.textContent = String(progress.upgrades.brakes);
  dom.hudHdl.textContent = String(progress.upgrades.handling);
}

function feed(message) {
  world.lastEvent = message;
  world.eventTimer = 2.3;
  dom.eventFeed.textContent = message;
}

function showMenu(message = '') {
  dom.menuStatus.textContent = message;
  dom.menuOverlay.classList.remove('hidden');
  dom.menuOverlay.classList.add('visible');
  dom.hud.classList.add('hidden');
  world.gameRunning = false;
}

function hideMenu() {
  dom.menuOverlay.classList.remove('visible');
  dom.menuOverlay.classList.add('hidden');
  dom.hud.classList.remove('hidden');
}

function setResumeVisible(show) {
  dom.resumeBtn.classList.toggle('hidden', !show);
}

function pauseGame() {
  if (!world.gameRunning) {
    return;
  }
  world.paused = true;
  setResumeVisible(true);
  showMenu('Paused. Press Esc or click Resume to continue.');
}

function resumeGame() {
  if (!world.paused) {
    return;
  }
  world.paused = false;
  setResumeVisible(false);
  hideMenu();
  world.gameRunning = true;
}

function showGameOver(title, text) {
  dom.gameOverTitle.textContent = title;
  dom.gameOverText.textContent = text;
  dom.gameOverOverlay.classList.remove('hidden');
  world.paused = false;
  setResumeVisible(false);
  world.gameRunning = false;
}

function hideGameOver() {
  dom.gameOverOverlay.classList.add('hidden');
}

function showHappyEnd(finalScore) {
  dom.happyEndText.textContent = `All levels completed! Final score: ${finalScore}.\nCongratulations, you conquered every Cyber Drive Adventure stage!`;
  dom.happyEndOverlay.classList.remove('hidden');
  world.paused = false;
  setResumeVisible(false);
  world.gameRunning = false;
}

function hideHappyEnd() {
  dom.happyEndOverlay.classList.add('hidden');
}

function normalizeName(name) {
  return String(name || '').trim().slice(0, 24);
}

async function loadProgress(playerName) {
  const response = await fetch(`${API_BASE}/api/progress/${encodeURIComponent(playerName)}`);
  if (!response.ok) {
    throw new Error('Save not found');
  }
  const data = await response.json();
  return data.progress;
}

async function saveProgress() {
  if (!progress.playerName) {
    return;
  }
  await fetch(`${API_BASE}/api/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerName: progress.playerName,
      progress: {
        currentLevel: progress.currentLevel,
        unlockedLevel: progress.unlockedLevel,
        score: progress.score,
        coins: progress.coins,
        stats: progress.stats,
        upgrades: progress.upgrades,
        settings: progress.settings
      }
    })
  });
}

function applyLoadedProgress(saved) {
  // Defensive restore: every field is validated and clamped so a corrupted
  // or outdated save does not crash gameplay or produce invalid values.
  progress.currentLevel = Math.min(5, Math.max(1, Number(saved.currentLevel) || 1));
  progress.unlockedLevel = Math.min(5, Math.max(progress.currentLevel, Number(saved.unlockedLevel) || progress.currentLevel));
  progress.score = Number(saved.score) || 0;
  progress.coins = Number(saved.coins) || 0;

  progress.stats.health = Number(saved.stats?.health) || 100;
  progress.stats.fuel = Number(saved.stats?.fuel) || 100;
  progress.stats.nitro = Number(saved.stats?.nitro) || 0;

  progress.upgrades.acceleration = Number(saved.upgrades?.acceleration) || 1;
  progress.upgrades.brakes = Number(saved.upgrades?.brakes) || 1;
  progress.upgrades.handling = Number(saved.upgrades?.handling) || 1;

  progress.settings.graphics = saved.settings?.graphics === 'low' ? 'low' : 'high';
  progress.settings.carColor = normalizeCarColor(saved.settings?.carColor || 'cyan');
  progress.settings.musicEnabled = saved.settings?.musicEnabled !== false;
  dom.graphicsSelect.value = progress.settings.graphics;
  dom.carColorSelect.value = progress.settings.carColor;
  updateMusicToggleButton();
  applyPlayerCarColor(progress.settings.carColor);
}

function resetToNewGame() {
  // New game keeps visual/audio settings from the current menu, but resets
  // progression values to a clean baseline snapshot.
  progress.currentLevel = 1;
  progress.unlockedLevel = 1;
  progress.score = startSnapshot.score;
  progress.coins = startSnapshot.coins;
  progress.stats = { ...startSnapshot.stats };
  progress.upgrades = { ...startSnapshot.upgrades };
  progress.settings.graphics = dom.graphicsSelect.value === 'low' ? 'low' : 'high';
  progress.settings.carColor = normalizeCarColor(dom.carColorSelect.value);
  progress.settings.musicEnabled = progress.settings.musicEnabled !== false;
  updateMusicToggleButton();
  applyPlayerCarColor(progress.settings.carColor);
}

function startLevel(levelId) {
  hideGameOver();
  buildLevel(levelId);
  updateHud();
  world.paused = false;
  setResumeVisible(false);
  hideMenu();
  world.gameRunning = true;
}

function completeLevel() {
  // Level completion flow:
  // - reward the player,
  // - unlock and launch the next level when available,
  // - otherwise finish the campaign and show the victory overlay.
  feed('Level completed! Saving progress...');

  if (progress.currentLevel < 5) {
    progress.currentLevel += 1;
    progress.unlockedLevel = Math.max(progress.unlockedLevel, progress.currentLevel);

    if (progress.currentLevel === 2) {
      progress.upgrades.acceleration += 1;
    } else if (progress.currentLevel === 3) {
      progress.upgrades.handling += 1;
    } else if (progress.currentLevel === 4) {
      progress.upgrades.acceleration += 1;
    } else if (progress.currentLevel === 5) {
      progress.upgrades.brakes += 1;
      progress.upgrades.handling += 1;
    }

    progress.stats.health = Math.min(100, progress.stats.health + 20);
    progress.stats.fuel = Math.min(100, progress.stats.fuel + 30);
    saveProgress();
    startLevel(progress.currentLevel);
    return;
  }

  world.gameRunning = false;
  saveProgress();
  showHappyEnd(progress.score);
}

function failLevel(reason) {
  world.gameRunning = false;
  showGameOver('Run Failed', reason);
}

function handleInput(dt) {
  // Input/vehicle simulation model:
  // 1) Read movement and nitro keys.
  // 2) Convert upgrades into physical coefficients (acceleration, braking, handling).
  // 3) Integrate speed/lateral velocity with damping.
  // 4) Apply bounds, roll tilt, forward movement, and continuous fuel drain.
  // 5) Apply edge-of-road damage at high speed.
  const level = world.currentLevelConfig;
  const up = world.keys.KeyW || world.keys.ArrowUp;
  const down = world.keys.KeyS || world.keys.ArrowDown;
  const left = world.keys.KeyA || world.keys.ArrowLeft;
  const right = world.keys.KeyD || world.keys.ArrowRight;
  const nitro = world.keys.Space && progress.stats.nitro > 0;

  const accel = (22 + progress.upgrades.acceleration * 6) * level.speedScale;
  const brakePower = 30 + progress.upgrades.brakes * 7;
  const handling = 26 + progress.upgrades.handling * 6;

  if (up) {
    player.speed += accel * dt;
  }
  if (down) {
    player.speed -= brakePower * dt;
  }

  if (!up && !down) {
    player.speed -= 14 * dt;
  }

  if (nitro) {
    player.boost = Math.min(14, player.boost + 40 * dt);
    progress.stats.nitro = Math.max(0, progress.stats.nitro - 11 * dt);
  } else {
    player.boost = Math.max(0, player.boost - 24 * dt);
  }

  let turnInput = 0;
  if (left) {
    turnInput -= 1;
  }
  if (right) {
    turnInput += 1;
  }

  const targetLateralSpeed = turnInput * handling;
  player.lateralSpeed = THREE.MathUtils.lerp(player.lateralSpeed, targetLateralSpeed, Math.min(1, dt * 12));
  if (!left && !right) {
    player.lateralSpeed *= Math.max(0, 1 - 10 * dt);
  }

  player.speed = THREE.MathUtils.clamp(player.speed, 0, player.maxSpeed + player.boost);

  player.mesh.position.x += player.lateralSpeed * dt;
  player.mesh.position.x = THREE.MathUtils.clamp(player.mesh.position.x, -LANE_LIMIT, LANE_LIMIT);

  const turnTilt = THREE.MathUtils.clamp(player.lateralSpeed * 0.035, -0.35, 0.35);
  player.mesh.rotation.z = THREE.MathUtils.lerp(player.mesh.rotation.z, -turnTilt, 0.45);

  player.mesh.position.z -= player.speed * dt;

  progress.stats.fuel -= (0.35 + player.speed * 0.016 + (nitro ? 0.3 : 0)) * dt;

  if (Math.abs(player.mesh.position.x) > LANE_LIMIT - 0.8 && player.speed > 25) {
    progress.stats.health -= 8 * dt;
    player.speed *= 0.96;
  }
}

function processObjects(dt) {
  // Object update and collision pipeline:
  // - update object movement/animation by type,
  // - run distance-based collision checks,
  // - apply type-specific consequences (damage, bonuses, fail states).
  // Collision checks are radius-based for performance and predictable gameplay,
  // which is important when many objects are active at once.
  const level = world.currentLevelConfig;
  for (const obj of world.objects) {
    if (!obj.active) {
      continue;
    }

    if (obj.type === 'trafficCar') {
      // Cars move only longitudinally: same-lane traffic or oncoming flow.
      if (obj.isOncoming) {
        obj.mesh.position.z -= obj.speed * dt * level.speedScale * 0.3;
        if (obj.mesh.position.z < player.mesh.position.z - 60) {
          obj.mesh.position.z = level.length + 60;
        }
      } else {
        obj.mesh.position.z += obj.speed * dt * level.speedScale * 0.3;
        if (obj.mesh.position.z > player.mesh.position.z + 60) {
          obj.mesh.position.z = -level.length - 60;
        }
      }
    }

    if (obj.type === 'pedestrian') {
      obj.mesh.position.x += obj.dir * obj.speed * dt;
      if (obj.mesh.position.x > LANE_LIMIT - 1 || obj.mesh.position.x < -(LANE_LIMIT - 1)) {
        obj.dir *= -1;
      }
      obj.mesh.rotation.y = obj.dir > 0 ? HALF_PI : -HALF_PI;
    }

    if (obj.type === 'boss') {
      const t = world.levelElapsed * obj.freq;
      obj.mesh.position.x = Math.sin(t) * obj.amp;
      obj.mesh.position.z = -level.length + 130 + Math.cos(t * 0.4) * 8;
    }

    if (obj.type === 'bonus') {
      obj.mesh.rotation.y += dt * 1.2;
      obj.mesh.position.y = 1.3 + Math.sin(world.levelElapsed * 3 + obj.mesh.position.z * 0.03) * 0.3;
      if (obj.glow) {
        const pulse = 1 + Math.sin(world.levelElapsed * 8 + obj.mesh.position.z * 0.03) * 0.35;
        obj.glow.intensity = 1 + pulse;
      }
      if (obj.bonusKind === 'coin') {
        obj.mesh.rotation.z += dt * 2.4;
        obj.mesh.material.emissiveIntensity = 0.85 + Math.sin(world.levelElapsed * 8.5) * 0.4;
      }
    }

    if (obj.type === 'helper') {
      obj.mesh.material.emissiveIntensity = 0.8 + Math.sin(world.levelElapsed * 4) * 0.35;
    }

    const dist = obj.mesh.position.distanceTo(player.mesh.position);
    if (dist > obj.radius + 1.6) {
      continue;
    }

    if (obj.type === 'trashBin') {
      if (player.invincibleTimer > 0) {
        continue;
      }
      progress.stats.health -= 18;
      player.speed *= 0.58;
      player.invincibleTimer = 0.45;
      feed('Trash bin hit: durability reduced');
      continue;
    }

    if (obj.type === 'trafficCar') {
      failLevel('You crashed into another car. Game Over.');
      return;
    }

    if (obj.type === 'pedestrian') {
      failLevel('You hit a pedestrian. Game Over.');
      continue;
    }

    if (obj.type === 'boss') {
      if (dist < 3.2 && player.invincibleTimer <= 0) {
        progress.stats.health -= 20;
        player.speed *= 0.55;
        player.invincibleTimer = 0.6;
        feed('Boss racer attack!');
      }
      continue;
    }

    if (obj.type === 'helper') {
      obj.active = false;
      obj.mesh.visible = false;
      progress.stats.health = Math.min(100, progress.stats.health + 28);
      progress.stats.fuel = Math.min(100, progress.stats.fuel + 16);
      progress.upgrades.brakes += 1;
      progress.score += 100;
      feed('Support bot: repairs and brake upgrade');
      continue;
    }

    if (obj.type === 'bonus') {
      obj.active = false;
      obj.mesh.visible = false;
      if (obj.bonusKind === 'coin') {
        progress.coins += 1;
        progress.score += 35;
        feed('Coin collected: +35 score');
      }
      if (obj.bonusKind === 'fuel') {
        progress.stats.fuel = Math.min(100, progress.stats.fuel + 22);
        progress.score += 25;
        feed('Fuel refilled');
      }
      if (obj.bonusKind === 'nitro') {
        progress.stats.nitro = Math.min(100, progress.stats.nitro + 38);
        progress.score += 25;
        feed('Nitro charge +38');
      }
      if (obj.bonusKind === 'upgrade') {
        progress.upgrades.acceleration += 1;
        progress.upgrades.handling += 1;
        progress.score += 60;
        feed('Upgrade: acceleration and handling');
      }
    }
  }
}

function updateCamera() {
  const target = new THREE.Vector3(
    player.mesh.position.x * 0.68,
    5.4,
    player.mesh.position.z + 12
  );
  camera.position.lerp(target, 0.11);
  camera.lookAt(player.mesh.position.x * 0.45, 1.2, player.mesh.position.z - 22);
}

function updateRoadLines() {
  const base = player.mesh.position.z;
  for (const line of roadLines.children) {
    if (line.position.z > base + 100) {
      line.position.z -= 10800;
    }
    if (line.position.z < base - 10500) {
      line.position.z += 10800;
    }
  }
}

function tick() {
  // Main frame loop:
  // - update timers and player/world physics,
  // - evaluate fail/win conditions,
  // - update camera and render,
  // - queue the next frame.
  const dt = Math.min(0.033, clock.getDelta());
  if (world.gameRunning) {
    world.levelElapsed += dt;
    world.levelDistance = -player.mesh.position.z;
    world.levelTime -= dt;

    handleInput(dt);
    processObjects(dt);
    updateRoadLines();

    player.invincibleTimer = Math.max(0, player.invincibleTimer - dt);

    if (world.eventTimer > 0) {
      world.eventTimer -= dt;
      if (world.eventTimer <= 0) {
        dom.eventFeed.textContent = `Goal: finish in ${Math.max(0, Math.round(world.currentLevelConfig.length - world.levelDistance))} m`;
      }
    }

    progress.score += Math.floor(player.speed * dt * 0.33);

    if (progress.stats.health <= 0) {
      failLevel('Hull integrity depleted. Drive more carefully.');
    }
    if (progress.stats.fuel <= 0) {
      failLevel('Out of fuel. Collect fuel bonuses.');
    }
    if (world.levelTime <= 0) {
      failLevel('Time is up. Push faster and use nitro.');
    }
    if (world.levelDistance >= world.currentLevelConfig.length) {
      completeLevel();
    }

    updateHud();
  }

  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyGraphicsSettings(progress.settings.graphics);
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    event.preventDefault();
    if (world.gameRunning) {
      pauseGame();
    } else if (world.paused) {
      resumeGame();
    }
    return;
  }
  world.keys[event.code] = true;
});

window.addEventListener('keyup', (event) => {
  world.keys[event.code] = false;
});

dom.graphicsSelect.addEventListener('change', () => {
  progress.settings.graphics = dom.graphicsSelect.value === 'low' ? 'low' : 'high';
  applyGraphicsSettings(progress.settings.graphics);
});

dom.carColorSelect.addEventListener('change', () => {
  progress.settings.carColor = normalizeCarColor(dom.carColorSelect.value);
  applyPlayerCarColor(progress.settings.carColor);
});

dom.musicToggleBtn.addEventListener('click', async () => {
  const nextEnabled = !progress.settings.musicEnabled;
  setMusicEnabled(nextEnabled);
  if (nextEnabled) {
    await startMusicLoop();
  }
});

dom.startBtn.addEventListener('click', async () => {
  const name = normalizeName(dom.playerName.value);
  if (!name) {
    dom.menuStatus.textContent = 'Please enter a player name.';
    return;
  }

  progress.playerName = name;
  await startMusicLoop();
  resetToNewGame();
  progress.currentLevel = world.selectedStartLevel;
  progress.unlockedLevel = Math.max(progress.unlockedLevel, world.selectedStartLevel);
  updateHud();

  try {
    await saveProgress();
  } catch {
    dom.menuStatus.textContent = 'Could not save initial game data.';
  }

  startLevel(world.selectedStartLevel);
});

dom.continueBtn.addEventListener('click', async () => {
  const name = normalizeName(dom.playerName.value);
  if (!name) {
    dom.menuStatus.textContent = 'Please enter a player name.';
    return;
  }

  progress.playerName = name;
  await startMusicLoop();

  try {
    dom.menuStatus.textContent = 'Loading progress...';
    const saved = await loadProgress(name);
    applyLoadedProgress(saved);
    updateHud();
    dom.menuStatus.textContent = '';
    startLevel(progress.currentLevel);
  } catch {
    dom.menuStatus.textContent = 'No save found. Start a new game.';
  }
});

dom.retryBtn.addEventListener('click', () => {
  progress.stats.health = Math.max(45, progress.stats.health);
  progress.stats.fuel = Math.max(40, progress.stats.fuel);
  startLevel(progress.currentLevel);
});

dom.resumeBtn.addEventListener('click', () => {
  startMusicLoop();
  resumeGame();
});

dom.menuBtn.addEventListener('click', async () => {
  hideGameOver();
  try {
    await saveProgress();
  } catch {
    dom.menuStatus.textContent = 'Could not save progress.';
  }
  showMenu('Progress saved.');
});

dom.happyEndMenuBtn.addEventListener('click', async () => {
  hideHappyEnd();
  try {
    await saveProgress();
  } catch {
    dom.menuStatus.textContent = 'Could not save progress.';
  }
  showMenu('Congratulations on your victory!');
});

// Level selector buttons
document.querySelectorAll('.level-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const levelNum = parseInt(btn.dataset.level);
    world.selectedStartLevel = levelNum;
    
    // Update active button
    document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    dom.menuStatus.textContent = `Selected level ${levelNum}: ${LEVELS[levelNum - 1].name}`;
  });
});

showMenu('Enter a name to start or continue.');
setResumeVisible(false);
updateMusicToggleButton();
updateHud();
applyGraphicsSettings(progress.settings.graphics);
camera.position.set(0, 6, 14);
camera.lookAt(0, 1, -10);

tick();

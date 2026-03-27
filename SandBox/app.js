const canvas = document.getElementById("sandbox");
const ctx = canvas.getContext("2d");

const materialSelect = document.getElementById("material");
const brushModeSelect = document.getElementById("brushMode");
const brushSizeInput = document.getElementById("brushSize");
const spawnRateInput = document.getElementById("spawnRate");
const windStrengthInput = document.getElementById("windStrength");
const heatMapToggle = document.getElementById("heatMapToggle");
const organizeTextInput = document.getElementById("organizeText");
const organizeBtn = document.getElementById("organizeBtn");
const freezeBtn = document.getElementById("freezeBtn");
const brushSizeValue = document.getElementById("brushSizeValue");
const spawnRateValue = document.getElementById("spawnRateValue");
const windStrengthValue = document.getElementById("windStrengthValue");
const clearBtn = document.getElementById("clearBtn");
const stats = document.getElementById("stats");

const MAX_PARTICLES = 18000;
const GRID_SIZE = 6;
const COLLISION_NEIGHBOR_OFFSETS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1]
];
const particles = [];

const MATERIALS = {
  sand: {
    color: [214, 188, 95],
    drag: 0.994,
    gravity: 0.18,
    randomDrift: 0.03,
    friction: 0.82,
    lift: 0,
    spread: 0.03,
    maxSpeed: 5.4
  },
  water: {
    color: [80, 172, 232],
    drag: 0.989,
    gravity: 0.11,
    randomDrift: 0.13,
    friction: 0.9,
    lift: 0,
    spread: 0.19,
    maxSpeed: 4.6
  },
  gas: {
    color: [192, 228, 250],
    drag: 0.976,
    gravity: 0.012,
    randomDrift: 0.23,
    friction: 0.95,
    lift: 0.12,
    spread: 0.28,
    maxSpeed: 4.2
  }
};

const pointer = {
  x: 0,
  y: 0,
  down: false
};

let dpr = Math.max(1, window.devicePixelRatio || 1);
let width = 0;
let height = 0;
let lastTime = performance.now();
let collisionCount = 0;

const organization = {
  active: false,
  targets: [],
  assignment: []
};

const audioState = {
  context: null,
  masterGain: null,
  lastSoundTime: 0
};

const simState = {
  wind: 0,
  heatMapEnabled: false,
  timeFrozen: false,
  rebirthPoint: { x: 0, y: 0 },
  lastDensity: null,
  maxDensity: 0
};

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  width = Math.floor(rect.width);
  height = Math.floor(rect.height);
  dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRgbString(r, g, b) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function ensureAudio() {
  if (audioState.context) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const context = new AudioCtx();
  const masterGain = context.createGain();
  masterGain.gain.value = 0.22;
  masterGain.connect(context.destination);

  audioState.context = context;
  audioState.masterGain = masterGain;
}

function playCollisionSound(intensity, materialA, materialB) {
  const context = audioState.context;
  const masterGain = audioState.masterGain;
  if (!context || !masterGain) return;

  const nowMs = performance.now();
  if (nowMs - audioState.lastSoundTime < 38) return;
  audioState.lastSoundTime = nowMs;

  const now = context.currentTime;
  const duration = 0.04 + Math.min(intensity * 0.02, 0.08);
  const hitType = (materialA === "sand" || materialB === "sand") ? "crunch" : "tick";

  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.05 + Math.min(intensity * 0.02, 0.08), now + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  gainNode.connect(masterGain);

  if (hitType === "crunch") {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = context.createBufferSource();
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1600 + Math.random() * 1200;
    filter.Q.value = 1.8;
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(gainNode);
    src.start(now);
    src.stop(now + duration);
  } else {
    const osc = context.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(260 + Math.random() * 220, now);
    osc.frequency.exponentialRampToValueAtTime(120 + Math.random() * 50, now + duration);
    osc.connect(gainNode);
    osc.start(now);
    osc.stop(now + duration);
  }
}

function spawnParticle(x, y, material, initialKick = true) {
  if (particles.length >= MAX_PARTICLES) {
    particles.splice(0, particles.length - MAX_PARTICLES + 1);
  }

  const m = MATERIALS[material];
  const p = {
    x,
    y,
    vx: initialKick ? (Math.random() - 0.5) * 1.8 : 0,
    vy: initialKick ? (Math.random() - 1.1) * 1.2 : 0,
    material,
    age: 0,
    life: 10,
    radius: material === "sand" ? 1.35 : material === "water" ? 1.18 : 1.05,
    r: m.color[0],
    g: m.color[1],
    b: m.color[2],
    color: toRgbString(m.color[0], m.color[1], m.color[2])
  };

  particles.push(p);
}

function respawnParticle(particle) {
  const material = particle.material;
  const m = MATERIALS[material];
  const jitter = 10;
  particle.x = clamp(simState.rebirthPoint.x + (Math.random() - 0.5) * jitter, particle.radius, width - particle.radius);
  particle.y = clamp(simState.rebirthPoint.y + (Math.random() - 0.5) * jitter, particle.radius, height - particle.radius);
  particle.vx = (Math.random() - 0.5) * 1.1;
  particle.vy = (Math.random() - 0.8) * 1.1;
  particle.age = 0;
  particle.life = 10;
  particle.r = m.color[0];
  particle.g = m.color[1];
  particle.b = m.color[2];
  particle.color = toRgbString(particle.r, particle.g, particle.b);
}

function applyBrush(dt) {
  if (!pointer.down) return;

  const brushSize = Number(brushSizeInput.value);
  const spawnRate = Number(spawnRateInput.value);
  const mode = brushModeSelect.value;
  const material = materialSelect.value;
  const spawnCount = Math.max(1, Math.floor(spawnRate * dt * 60 * 0.33));

  for (let i = 0; i < spawnCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * brushSize;
    const x = pointer.x + Math.cos(angle) * r;
    const y = pointer.y + Math.sin(angle) * r;

    if (x < 0 || x > width || y < 0 || y > height) continue;

    spawnParticle(x, y, material, mode === "repel");
  }

  const forceSign = mode === "attract" ? 1 : -1;
  const forceBase = mode === "attract" ? 0.21 : 0.34;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const dx = pointer.x - p.x;
    const dy = pointer.y - p.y;
    const distSq = dx * dx + dy * dy;
    const range = brushSize * brushSize * 3.8;

    if (distSq < 16 || distSq > range) continue;

    const invDist = 1 / Math.sqrt(distSq);
    const power = (1 - distSq / range) * forceBase;

    p.vx += dx * invDist * power * forceSign;
    p.vy += dy * invDist * power * forceSign;
  }
}

function blendColors(p, q, amount) {
  const targetR = (p.r + q.r) * 0.5;
  const targetG = (p.g + q.g) * 0.5;
  const targetB = (p.b + q.b) * 0.5;

  p.r += (targetR - p.r) * amount;
  p.g += (targetG - p.g) * amount;
  p.b += (targetB - p.b) * amount;

  q.r += (targetR - q.r) * amount;
  q.g += (targetG - q.g) * amount;
  q.b += (targetB - q.b) * amount;

  p.color = toRgbString(p.r, p.g, p.b);
  q.color = toRgbString(q.r, q.g, q.b);
}

function resolveCollisions() {
  collisionCount = 0;
  const buckets = new Map();

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const cx = Math.floor(p.x / GRID_SIZE);
    const cy = Math.floor(p.y / GRID_SIZE);
    const key = `${cx},${cy}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const cx = Math.floor(p.x / GRID_SIZE);
    const cy = Math.floor(p.y / GRID_SIZE);

    for (let k = 0; k < COLLISION_NEIGHBOR_OFFSETS.length; k++) {
      const offset = COLLISION_NEIGHBOR_OFFSETS[k];
      const key = `${cx + offset[0]},${cy + offset[1]}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;

      for (let n = 0; n < bucket.length; n++) {
        const j = bucket[n];
        if (j <= i) continue;

        const q = particles[j];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const minDist = p.radius + q.radius;
        const distSq = dx * dx + dy * dy;
        if (distSq === 0 || distSq > minDist * minDist) continue;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        p.x -= nx * overlap * 0.5;
        p.y -= ny * overlap * 0.5;
        q.x += nx * overlap * 0.5;
        q.y += ny * overlap * 0.5;

        const rvx = q.vx - p.vx;
        const rvy = q.vy - p.vy;
        const relVel = rvx * nx + rvy * ny;

        if (relVel < 0) {
          const impulse = -(1 + 0.3) * relVel * 0.5;
          p.vx -= impulse * nx;
          p.vy -= impulse * ny;
          q.vx += impulse * nx;
          q.vy += impulse * ny;

          const colorDiff = Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b);
          if (colorDiff > 8) {
            blendColors(p, q, 0.14);
          }

          if (Math.abs(relVel) > 1.6 && Math.random() < 0.14) {
            playCollisionSound(Math.abs(relVel), p.material, q.material);
          }
          collisionCount++;
        }
      }
    }
  }
}

function updateDensityField() {
  if (!simState.heatMapEnabled) {
    simState.lastDensity = null;
    simState.maxDensity = 0;
    return;
  }

  const cell = 18;
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const density = new Uint16Array(cols * rows);
  let max = 0;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const cx = clamp(Math.floor(p.x / cell), 0, cols - 1);
    const cy = clamp(Math.floor(p.y / cell), 0, rows - 1);
    const index = cy * cols + cx;
    density[index] += 1;
    if (density[index] > max) max = density[index];
  }

  simState.lastDensity = { density, cols, rows, cell };
  simState.maxDensity = max;
}

function buildOrganizationTargets(text) {
  const value = (text || "SAND").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
  const safeText = value.length > 0 ? value : "SAND";
  organizeTextInput.value = safeText;

  const temp = document.createElement("canvas");
  temp.width = Math.max(220, Math.floor(width * 0.84));
  temp.height = Math.max(100, Math.floor(height * 0.36));
  const tctx = temp.getContext("2d");

  tctx.clearRect(0, 0, temp.width, temp.height);
  tctx.fillStyle = "#ffffff";
  tctx.textAlign = "center";
  tctx.textBaseline = "middle";
  tctx.font = `700 ${Math.floor(temp.height * 0.68)}px Space Grotesk, sans-serif`;
  tctx.fillText(safeText, temp.width / 2, temp.height / 2);

  const image = tctx.getImageData(0, 0, temp.width, temp.height).data;
  const targets = [];
  const step = Math.max(3, Math.floor(Math.min(width, height) / 190));
  const offsetX = (width - temp.width) * 0.5;
  const offsetY = (height - temp.height) * 0.5;

  for (let y = 0; y < temp.height; y += step) {
    for (let x = 0; x < temp.width; x += step) {
      const alpha = image[(y * temp.width + x) * 4 + 3];
      if (alpha > 40) {
        targets.push({ x: offsetX + x, y: offsetY + y });
      }
    }
  }

  return targets;
}

function startOrganization() {
  const targets = buildOrganizationTargets(organizeTextInput.value);
  if (targets.length === 0) return;

  const needed = Math.min(targets.length, MAX_PARTICLES);
  while (particles.length < needed) {
    spawnParticle(Math.random() * width, height * (0.2 + Math.random() * 0.6), materialSelect.value, false);
  }

  organization.targets = targets.slice(0, particles.length);
  organization.assignment = Array.from({ length: organization.targets.length }, (_, i) => i);
  for (let i = organization.assignment.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = organization.assignment[i];
    organization.assignment[i] = organization.assignment[j];
    organization.assignment[j] = tmp;
  }

  organization.active = true;
  organizeBtn.textContent = "Return Chaos";
}

function stopOrganization() {
  organization.active = false;
  organization.targets = [];
  organization.assignment = [];
  organizeBtn.textContent = "Arrange as Word";
}

function applyOrganization(dt) {
  if (!organization.active || organization.targets.length === 0) return;

  const count = Math.min(organization.targets.length, particles.length);
  for (let i = 0; i < count; i++) {
    const particleIndex = organization.assignment[i] ?? i;
    const p = particles[particleIndex];
    if (!p) continue;
    const target = organization.targets[i];

    const dx = target.x - p.x;
    const dy = target.y - p.y;
    p.vx += dx * 0.0028 * dt * 60;
    p.vy += dy * 0.0028 * dt * 60;

    // Make arranged particles calmer so letters stay readable.
    p.vx *= 0.95;
    p.vy *= 0.95;
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const m = MATERIALS[p.material];

    p.age += dt;
    if (p.age >= p.life) {
      respawnParticle(p);
    }

    p.vx += simState.wind * dt * 60;
    p.vy += m.gravity * dt * 60;
    p.vy -= m.lift * dt * 60;
    p.vx += (Math.random() - 0.5) * m.randomDrift * dt * 60;

    if (p.material === "water") {
      p.vx += (Math.random() - 0.5) * m.spread * dt * 60;
    } else if (p.material === "gas") {
      p.vx += (Math.random() - 0.5) * m.spread * dt * 60;
      p.vy += (Math.random() - 0.5) * 0.08 * dt * 60;
    }

    p.vx *= m.drag;
    p.vy *= m.drag;

    p.vx = clamp(p.vx, -m.maxSpeed, m.maxSpeed);
    p.vy = clamp(p.vy, -m.maxSpeed, m.maxSpeed);

    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;

    if (p.x < p.radius) {
      p.x = p.radius;
      p.vx = Math.abs(p.vx) * m.friction;
    } else if (p.x > width - p.radius) {
      p.x = width - p.radius;
      p.vx = -Math.abs(p.vx) * m.friction;
    }

    if (p.y > height - p.radius) {
      p.y = height - p.radius;
      if (p.material === "water") {
        p.vy *= -0.25;
        p.vx += (Math.random() - 0.5) * 0.2;
      } else if (p.material === "sand") {
        p.vy *= -0.05;
        p.vx *= 0.9;
      } else {
        p.vy *= -0.12;
      }
    } else if (p.y < p.radius) {
      p.y = p.radius;
      p.vy = Math.abs(p.vy) * m.friction;
    }
  }
}

function drawHeatMap() {
  if (!simState.heatMapEnabled || !simState.lastDensity || simState.maxDensity <= 0) return;

  const { density, cols, rows, cell } = simState.lastDensity;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const value = density[y * cols + x];
      if (value < 2) continue;
      const t = value / simState.maxDensity;
      const r = Math.floor(255 * clamp((t - 0.28) * 1.5, 0, 1));
      const g = Math.floor(255 * clamp((1 - Math.abs(t - 0.5) * 2) * 0.9, 0, 1));
      const b = Math.floor(255 * clamp((0.6 - t) * 1.6, 0, 1));
      const alpha = 0.08 + t * 0.24;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

function render() {
  ctx.fillStyle = "rgba(10, 19, 28, 0.22)";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHeatMap();

  if (pointer.down) {
    const size = Number(brushSizeInput.value);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, size, 0, Math.PI * 2);
    ctx.stroke();
  }

  const orgLabel = organization.active ? " | shape: ON" : "";
  const freezeLabel = simState.timeFrozen ? " | freeze: ON" : "";
  stats.textContent = `Particles: ${particles.length} | collisions: ${collisionCount} | wind: ${simState.wind.toFixed(2)}${orgLabel}${freezeLabel}`;
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  if (!simState.timeFrozen) {
    applyBrush(dt);
    applyOrganization(dt);
    updateParticles(dt);
    resolveCollisions();
    updateDensityField();
  }
  render();

  requestAnimationFrame(frame);
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
}

canvas.addEventListener("pointerdown", (event) => {
  ensureAudio();
  if (audioState.context && audioState.context.state === "suspended") {
    audioState.context.resume();
  }
  pointer.down = true;
  updatePointer(event);
  simState.rebirthPoint.x = pointer.x;
  simState.rebirthPoint.y = pointer.y;
});

window.addEventListener("pointerup", () => {
  pointer.down = false;
});

canvas.addEventListener("pointermove", (event) => {
  updatePointer(event);
});

clearBtn.addEventListener("click", () => {
  particles.length = 0;
  stopOrganization();
  ctx.clearRect(0, 0, width, height);
});

organizeBtn.addEventListener("click", () => {
  ensureAudio();
  if (organization.active) {
    stopOrganization();
  } else {
    startOrganization();
  }
});

freezeBtn.addEventListener("click", () => {
  simState.timeFrozen = !simState.timeFrozen;
  freezeBtn.textContent = simState.timeFrozen ? "Unfreeze Time" : "Freeze Time";
});

windStrengthInput.addEventListener("input", () => {
  simState.wind = Number(windStrengthInput.value);
  windStrengthValue.textContent = simState.wind.toFixed(2);
});

heatMapToggle.addEventListener("change", () => {
  simState.heatMapEnabled = heatMapToggle.checked;
  if (!simState.heatMapEnabled) {
    simState.lastDensity = null;
    simState.maxDensity = 0;
  }
});

organizeTextInput.addEventListener("input", () => {
  organizeTextInput.value = organizeTextInput.value.toUpperCase();
  if (organization.active) {
    startOrganization();
  }
});

brushSizeInput.addEventListener("input", () => {
  brushSizeValue.textContent = brushSizeInput.value;
});

spawnRateInput.addEventListener("input", () => {
  spawnRateValue.textContent = spawnRateInput.value;
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("resize", () => {
  if (organization.active) {
    startOrganization();
  }
  simState.rebirthPoint.x = width * 0.5;
  simState.rebirthPoint.y = height * 0.5;
  updateDensityField();
});

resizeCanvas();
simState.rebirthPoint.x = width * 0.5;
simState.rebirthPoint.y = height * 0.5;
simState.wind = Number(windStrengthInput.value);
windStrengthValue.textContent = simState.wind.toFixed(2);
ctx.fillStyle = "#0f1d29";
ctx.fillRect(0, 0, width, height);
requestAnimationFrame(frame);

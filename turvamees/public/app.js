const startButton = document.getElementById('startButton');
const statusLabel = document.getElementById('status');
const movementLabel = document.getElementById('lastMovement');
const video = document.getElementById('camera');
const overlay = document.getElementById('overlay');
const overlayCtx = overlay.getContext('2d');

const analysisCanvas = document.createElement('canvas');
const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });

const ANALYSIS_WIDTH = 160;
const ANALYSIS_HEIGHT = 120;
analysisCanvas.width = ANALYSIS_WIDTH;
analysisCanvas.height = ANALYSIS_HEIGHT;

let audioContext;
let previousGrayFrame = null;
let previousCentroid = null;
let previousArea = 0;
let lastTriggerTime = 0;

const TRIGGER_COOLDOWN_MS = 550;
const MOTION_THRESHOLD = 26;
const MIN_ACTIVE_PIXELS = 160;

const movementTextMap = {
  left: 'влево',
  right: 'вправо',
  up: 'вверх',
  down: 'вниз',
  forward: 'вперед (к камере)',
  backward: 'назад (от камеры)'
};

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  statusLabel.textContent = 'Статус: запрашиваю доступ к камере...';

  try {
    await setupAudio();
    await setupCamera();
    statusLabel.textContent = 'Статус: камера активна, идет анализ движения';
    requestAnimationFrame(processFrame);
  } catch (error) {
    statusLabel.textContent = `Ошибка: ${error.message}`;
    startButton.disabled = false;
  }
});

async function setupAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
}

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user'
    },
    audio: false
  });

  video.srcObject = stream;
  await video.play();

  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

function processFrame() {
  if (!video.videoWidth || !video.videoHeight) {
    requestAnimationFrame(processFrame);
    return;
  }

  analysisCtx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
  const frame = analysisCtx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
  const gray = toGray(frame.data);

  if (!previousGrayFrame) {
    previousGrayFrame = gray;
    requestAnimationFrame(processFrame);
    return;
  }

  const motionInfo = extractMotionInfo(gray, previousGrayFrame);
  previousGrayFrame = gray;

  drawOverlay(motionInfo);

  if (motionInfo.activePixels < MIN_ACTIVE_PIXELS) {
    requestAnimationFrame(processFrame);
    return;
  }

  const direction = detectDirection(motionInfo);
  if (direction) {
    const now = Date.now();
    if (now - lastTriggerTime > TRIGGER_COOLDOWN_MS) {
      lastTriggerTime = now;
      movementLabel.textContent = `Последнее движение: ${movementTextMap[direction]}`;
      playMovementSound(direction);
    }
  }

  previousCentroid = motionInfo.centroid;
  previousArea = motionInfo.activePixels;

  requestAnimationFrame(processFrame);
}

function toGray(rgba) {
  const result = new Uint8ClampedArray(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
    result[j] = (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114) | 0;
  }
  return result;
}

function extractMotionInfo(current, previous) {
  let sumX = 0;
  let sumY = 0;
  let activePixels = 0;

  for (let y = 0; y < ANALYSIS_HEIGHT; y += 1) {
    for (let x = 0; x < ANALYSIS_WIDTH; x += 1) {
      const idx = y * ANALYSIS_WIDTH + x;
      const delta = Math.abs(current[idx] - previous[idx]);
      if (delta > MOTION_THRESHOLD) {
        sumX += x;
        sumY += y;
        activePixels += 1;
      }
    }
  }

  const centroid = activePixels
    ? {
        x: sumX / activePixels,
        y: sumY / activePixels
      }
    : null;

  return { centroid, activePixels };
}

function detectDirection(motionInfo) {
  if (!previousCentroid || !motionInfo.centroid) {
    return null;
  }

  const dx = motionInfo.centroid.x - previousCentroid.x;
  const dy = motionInfo.centroid.y - previousCentroid.y;
  const areaDelta = motionInfo.activePixels - previousArea;

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const absArea = Math.abs(areaDelta);

  if (absArea > 220 && absArea > absDx * 70 && absArea > absDy * 70) {
    return areaDelta > 0 ? 'forward' : 'backward';
  }

  if (absDx < 1.6 && absDy < 1.6) {
    return null;
  }

  if (absDx > absDy) {
    return dx > 0 ? 'right' : 'left';
  }

  return dy > 0 ? 'down' : 'up';
}

function drawOverlay(motionInfo) {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  if (!motionInfo.centroid || motionInfo.activePixels < MIN_ACTIVE_PIXELS) {
    return;
  }

  const sx = overlay.width / ANALYSIS_WIDTH;
  const sy = overlay.height / ANALYSIS_HEIGHT;
  const x = motionInfo.centroid.x * sx;
  const y = motionInfo.centroid.y * sy;
  const radius = Math.min(38, Math.max(12, motionInfo.activePixels / 35));

  overlayCtx.beginPath();
  overlayCtx.arc(x, y, radius, 0, Math.PI * 2);
  overlayCtx.lineWidth = 3;
  overlayCtx.strokeStyle = '#ea580c';
  overlayCtx.shadowColor = 'rgba(234, 88, 12, 0.45)';
  overlayCtx.shadowBlur = 10;
  overlayCtx.stroke();
}

function playMovementSound(direction) {
  if (!audioContext) {
    return;
  }

  const patterns = {
    left: [
      { note: 76, duration: 0.07, volume: 0.1 },
      { note: 72, duration: 0.08, volume: 0.1 },
      { note: 69, duration: 0.1, volume: 0.11 }
    ],
    right: [
      { note: 69, duration: 0.07, volume: 0.1 },
      { note: 72, duration: 0.08, volume: 0.1 },
      { note: 76, duration: 0.1, volume: 0.11 }
    ],
    up: [
      { note: 72, duration: 0.06, volume: 0.1 },
      { note: 76, duration: 0.06, volume: 0.1 },
      { note: 79, duration: 0.12, volume: 0.12 }
    ],
    down: [
      { note: 74, duration: 0.06, volume: 0.1 },
      { note: 71, duration: 0.06, volume: 0.1 },
      { note: 67, duration: 0.12, volume: 0.11 }
    ]
  };

  if (direction === 'backward') {
    playBackwardAlarm8Bit();
    return;
  }

  if (direction === 'forward') {
    playLaserSweep8Bit(440, 1040, 0.22);
    return;
  }

  playPattern8Bit(patterns[direction]);
}

function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playPattern8Bit(pattern) {
  let offset = 0;
  for (const step of pattern) {
    playNote8Bit(midiToFrequency(step.note), step.duration, offset, step.volume || 0.13);
    offset += step.duration * 0.88;
  }
}

function playNote8Bit(frequency, duration, delaySeconds, volume) {
  const now = audioContext.currentTime + delaySeconds;
  const oscA = audioContext.createOscillator();
  const oscB = audioContext.createOscillator();
  const mix = audioContext.createGain();
  const gain = audioContext.createGain();

  oscA.type = 'square';
  oscB.type = 'triangle';
  oscA.frequency.setValueAtTime(frequency, now);
  oscB.frequency.setValueAtTime(frequency * 2, now);

  mix.gain.setValueAtTime(0.55, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscA.connect(mix);
  oscB.connect(mix);
  mix.connect(gain);
  gain.connect(audioContext.destination);

  oscA.start(now);
  oscB.start(now);
  oscA.stop(now + duration + 0.02);
  oscB.stop(now + duration + 0.02);
}

function playLaserSweep8Bit(startFreq, endFreq, duration) {
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration * 0.7);
  osc.frequency.exponentialRampToValueAtTime(endFreq * 0.78, now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.start(now);
  osc.stop(now + duration + 0.01);
}

function playBackwardAlarm8Bit() {
  playNote8Bit(midiToFrequency(79), 0.06, 0.0, 0.11);
  playNote8Bit(midiToFrequency(76), 0.06, 0.08, 0.11);
  playNote8Bit(midiToFrequency(72), 0.09, 0.16, 0.12);
  playNote8Bit(midiToFrequency(67), 0.12, 0.25, 0.11);
}

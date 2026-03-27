const canvas = document.querySelector('#paint-surface');
const context = canvas.getContext('2d');
const audioToggle = document.querySelector('#audio-toggle');
const recordButton = document.querySelector('#record-button');
const clearButton = document.querySelector('#clear-button');
const symmetryToggle = document.querySelector('#symmetry-toggle');
const magnetToggle = document.querySelector('#magnet-toggle');
const instrumentStatus = document.querySelector('#instrument-status');
const pitchStatus = document.querySelector('#pitch-status');
const speedStatus = document.querySelector('#speed-status');
const magnetStatus = document.querySelector('#magnet-status');
const loopStatus = document.querySelector('#loop-status');
const atmosphereStatus = document.querySelector('#atmosphere-status');
const modeStatus = document.querySelector('#mode-status');
const swatches = [...document.querySelectorAll('.swatch')];

const instruments = {
  red: {
    label: 'Red Bass',
    stroke: '#e74c3c',
    shadow: 'rgba(231, 76, 60, 0.35)',
    trailLife: 2800,
    synth: createBassVoice,
    ambientFrequency: 54,
  },
  blue: {
    label: 'Blue Piano',
    stroke: '#2979ff',
    shadow: 'rgba(41, 121, 255, 0.28)',
    trailLife: 3200,
    synth: createPianoVoice,
    ambientFrequency: 196,
  },
  yellow: {
    label: 'Yellow Synth',
    stroke: '#ffb703',
    shadow: 'rgba(255, 183, 3, 0.30)',
    trailLife: 3600,
    synth: createSynthVoice,
    ambientFrequency: 392,
  },
};

let activeColor = 'red';
let drawingPointerId = null;
let lastPoint = null;
let lastMoveAt = 0;
let audioContext = null;
let masterGain = null;
let activeSegments = [];
let magneticPoints = [];
let sparks = [];
let ambientLayer = null;
let lastNoteAt = 0;
let lastFrameAt = performance.now();
let isSymmetryMode = false;
let isMagnetMode = false;
let motionPermissionHandled = false;
let lastShakeAt = 0;

const looper = {
  duration: 5000,
  isRecording: false,
  isPlaying: false,
  startAt: 0,
  playbackStartAt: 0,
  eventIndex: 0,
  events: [],
};

setupCanvas();
attachEvents();
renderFrame();
updateInstrumentStatus();
updateMagnetStatus();
updateModeStatus();
updateLoopStatus();
updateAtmosphereStatus(0);

function setupCanvas() {
  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.floor(bounds.width * ratio);
    canvas.height = Math.floor(bounds.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  resize();
  window.addEventListener('resize', resize);
}

function attachEvents() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  swatches.forEach((button) => {
    button.addEventListener('click', () => {
      activeColor = button.dataset.color;
      swatches.forEach((item) => item.classList.toggle('is-active', item === button));
      updateInstrumentStatus();
    });
  });

  audioToggle.addEventListener('click', async () => {
    await activateAudio();
  });

  recordButton.addEventListener('click', async () => {
    await activateAudio();
    toggleLoopRecording();
  });

  clearButton.addEventListener('click', async () => {
    await activateAudio();
    shatterCanvas('button');
  });

  symmetryToggle.addEventListener('click', () => {
    isSymmetryMode = !isSymmetryMode;
    symmetryToggle.classList.toggle('is-active', isSymmetryMode);
    updateModeStatus();
  });

  magnetToggle.addEventListener('click', () => {
    isMagnetMode = !isMagnetMode;
    magnetToggle.classList.toggle('is-active', isMagnetMode);
    updateModeStatus();
  });

  window.addEventListener('devicemotion', onDeviceMotion);
}

async function onPointerDown(event) {
  await activateAudio();

  const point = getCanvasPoint(event);
  updatePitchStatus(point.y);

  if (isMagnetMode) {
    addMagneticPoint(point);
    speedStatus.textContent = 'Gesture: magnet placed';
    return;
  }

  drawingPointerId = event.pointerId;
  lastPoint = point;
  lastMoveAt = performance.now();
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (drawingPointerId !== event.pointerId || !lastPoint) {
    return;
  }

  const now = performance.now();
  const nextPoint = getCanvasPoint(event);
  const dx = nextPoint.x - lastPoint.x;
  const dy = nextPoint.y - lastPoint.y;
  const distance = Math.hypot(dx, dy);
  const elapsed = Math.max(now - lastMoveAt, 16);

  if (distance < 2) {
    updatePitchStatus(nextPoint.y);
    return;
  }

  const instrumentKey = activeColor;
  const motion = calculateMotion(distance, elapsed);
  const width = getStrokeWidth(instrumentKey, motion);
  const segmentPairs = getSegmentPairs(lastPoint, nextPoint);

  addStrokeSegments(segmentPairs, instrumentKey, width, motion, now);
  playStrokeChord(segmentPairs.map((pair) => pair.to), instrumentKey, distance, motion);
  recordStrokeEvent(segmentPairs, instrumentKey, width, motion, distance, now);

  updatePitchStatus(nextPoint.y);
  updateSpeedStatus(distance, elapsed);
  lastPoint = nextPoint;
  lastMoveAt = now;
}

function onPointerUp(event) {
  if (drawingPointerId !== event.pointerId) {
    return;
  }

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  drawingPointerId = null;
  lastPoint = null;
}

function onDeviceMotion(event) {
  const acceleration = event.accelerationIncludingGravity;

  if (!acceleration) {
    return;
  }

  const magnitude = Math.abs(acceleration.x || 0) + Math.abs(acceleration.y || 0) + Math.abs(acceleration.z || 0);
  const now = performance.now();

  if (magnitude > 34 && now - lastShakeAt > 1100) {
    lastShakeAt = now;
    shatterCanvas('shake');
  }
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function updateInstrumentStatus() {
  instrumentStatus.textContent = `Instrument: ${instruments[activeColor].label}`;
}

function updateMagnetStatus() {
  magnetStatus.textContent = `Magnets: ${magneticPoints.length}`;
}

function updateLoopStatus() {
  if (looper.isRecording) {
    const elapsed = performance.now() - looper.startAt;
    const remaining = Math.max(0, looper.duration - elapsed);
    const seconds = (remaining / 1000).toFixed(1);
    loopStatus.textContent = `Looper: recording ${seconds}s`;
    recordButton.textContent = `Recording ${seconds}s`;
    recordButton.classList.add('is-recording');
    recordButton.classList.remove('is-active-loop');
    return;
  }

  if (looper.isPlaying) {
    loopStatus.textContent = `Looper: ${looper.events.length} gesture cycle`;
    recordButton.textContent = 'Re-record loop';
    recordButton.classList.remove('is-recording');
    recordButton.classList.add('is-active-loop');
    return;
  }

  loopStatus.textContent = 'Looper: idle';
  recordButton.textContent = 'Record 5s loop';
  recordButton.classList.remove('is-recording', 'is-active-loop');
}

function updateModeStatus() {
  const modeLabel = isMagnetMode ? 'magnet points' : 'drawing';
  const symmetryLabel = isSymmetryMode ? ' + symmetry x4' : '';
  modeStatus.textContent = `Mode: ${modeLabel}${symmetryLabel}`;
}

function updatePitchStatus(y) {
  const frequency = mapYToFrequency(y);
  pitchStatus.textContent = `Pitch: ${Math.round(frequency)} Hz`;
}

function updateSpeedStatus(distance, elapsed) {
  const pixelsPerSecond = Math.round((distance / elapsed) * 1000);
  const descriptor = describeSpeed(pixelsPerSecond);
  speedStatus.textContent = `Gesture: ${descriptor} · ${pixelsPerSecond} px/s`;
}

function updateAtmosphereStatus(totalDensity) {
  const descriptor = describeAtmosphere(totalDensity);
  atmosphereStatus.textContent = `Atmosphere: ${descriptor}`;
}

function mapYToFrequency(y) {
  const drawableHeight = canvas.clientHeight || 1;
  const normalized = 1 - clamp(y / drawableHeight, 0, 1);
  const minFrequency = 82.41;
  const maxFrequency = 987.77;

  return minFrequency * Math.pow(maxFrequency / minFrequency, normalized);
}

async function ensureAudio() {
  if (audioContext) {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(audioContext.destination);
  ambientLayer = createAmbientLayer();
}

async function requestMotionPermissionIfNeeded() {
  if (motionPermissionHandled) {
    return;
  }

  motionPermissionHandled = true;

  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      await DeviceMotionEvent.requestPermission();
    } catch {
      motionPermissionHandled = true;
    }
  }
}

async function activateAudio() {
  await ensureAudio();
  await requestMotionPermissionIfNeeded();

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  audioToggle.textContent = 'Sound enabled';
}

function createAmbientLayer() {
  const master = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const redGain = audioContext.createGain();
  const blueGain = audioContext.createGain();
  const yellowGain = audioContext.createGain();
  const redOsc = audioContext.createOscillator();
  const blueOsc = audioContext.createOscillator();
  const yellowOsc = audioContext.createOscillator();
  const lfo = audioContext.createOscillator();
  const lfoDepth = audioContext.createGain();

  master.gain.value = 0.04;
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.7;
  redGain.gain.value = 0.01;
  blueGain.gain.value = 0.01;
  yellowGain.gain.value = 0.01;

  redOsc.type = 'sawtooth';
  blueOsc.type = 'sine';
  yellowOsc.type = 'triangle';
  lfo.type = 'sine';

  redOsc.frequency.value = instruments.red.ambientFrequency;
  blueOsc.frequency.value = instruments.blue.ambientFrequency;
  yellowOsc.frequency.value = instruments.yellow.ambientFrequency;
  lfo.frequency.value = 0.08;
  lfoDepth.gain.value = 110;

  redOsc.connect(redGain);
  blueOsc.connect(blueGain);
  yellowOsc.connect(yellowGain);
  redGain.connect(filter);
  blueGain.connect(filter);
  yellowGain.connect(filter);
  lfo.connect(lfoDepth);
  lfoDepth.connect(filter.frequency);
  filter.connect(master);
  master.connect(masterGain);

  redOsc.start();
  blueOsc.start();
  yellowOsc.start();
  lfo.start();

  return {
    master,
    filter,
    redGain,
    blueGain,
    yellowGain,
    redOsc,
    blueOsc,
    yellowOsc,
  };
}

function playStrokeChord(points, instrumentKey, distance, motion) {
  if (!audioContext || audioContext.state !== 'running') {
    return;
  }

  const now = audioContext.currentTime;

  if (now - lastNoteAt < 0.045) {
    return;
  }

  const instrument = instruments[instrumentKey];
  const intensity = clamp(distance / 24, 0.22, 1) * clamp(0.72 + motion * 0.38, 0.72, 1.2);

  points.forEach((point, index) => {
    const frequency = mapYToFrequency(point.y);
    instrument.synth(
      frequency,
      clamp(intensity - index * 0.05, 0.18, 1.15),
      instrument.trailLife / 1000,
      clamp(motion + index * 0.08, 0.2, 1.35),
      index * 0.016,
    );
  });

  lastNoteAt = now;
}

function createBassVoice(frequency, intensity, trailSeconds, motion = 0.5, timeOffset = 0) {
  const now = audioContext.currentTime + timeOffset;
  const duration = 0.28 - motion * 0.06 + intensity * 0.08;
  const voiceGain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const drive = audioContext.createWaveShaper();
  const dryGain = audioContext.createGain();
  const delay = audioContext.createDelay(0.6);
  const feedback = audioContext.createGain();
  const wetGain = audioContext.createGain();
  const oscA = audioContext.createOscillator();
  const oscB = audioContext.createOscillator();

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(320 + intensity * 140 + motion * 420, now);
  filter.Q.value = 1.2 + motion * 0.8;

  drive.curve = createDriveCurve(70 + motion * 55);
  drive.oversample = '4x';

  delay.delayTime.setValueAtTime(0.18, now);
  feedback.gain.setValueAtTime(0.24, now);
  feedback.gain.exponentialRampToValueAtTime(0.001, now + trailSeconds);
  wetGain.gain.setValueAtTime(0.18, now);
  wetGain.gain.exponentialRampToValueAtTime(0.001, now + trailSeconds);

  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.exponentialRampToValueAtTime((0.46 + motion * 0.34) * intensity, now + 0.012);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  dryGain.gain.value = 0.9;

  oscA.type = 'sawtooth';
  oscA.frequency.setValueAtTime(frequency * 0.5, now);
  oscB.type = 'square';
  oscB.frequency.setValueAtTime(frequency * 0.502, now);

  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(drive);
  drive.connect(voiceGain);
  voiceGain.connect(dryGain);
  dryGain.connect(masterGain);

  voiceGain.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(masterGain);

  oscA.start(now);
  oscB.start(now);
  oscA.stop(now + duration + trailSeconds);
  oscB.stop(now + duration + trailSeconds);
}

function createPianoVoice(frequency, intensity, trailSeconds, motion = 0.5, timeOffset = 0) {
  const now = audioContext.currentTime + timeOffset;
  const duration = 0.42 - motion * 0.08 + intensity * 0.1;
  const carrier = audioContext.createOscillator();
  const overtone = audioContext.createOscillator();
  const attackGain = audioContext.createGain();
  const highpass = audioContext.createBiquadFilter();
  const toneFilter = audioContext.createBiquadFilter();
  const delay = audioContext.createDelay(0.7);
  const feedback = audioContext.createGain();
  const wetGain = audioContext.createGain();

  carrier.type = 'triangle';
  overtone.type = 'sine';
  carrier.frequency.setValueAtTime(frequency, now);
  overtone.frequency.setValueAtTime(frequency * 2, now);

  highpass.type = 'highpass';
  highpass.frequency.value = 110;
  highpass.Q.value = 0.7;

  toneFilter.type = 'lowpass';
  toneFilter.frequency.setValueAtTime(1700 + motion * 1800, now);
  toneFilter.Q.value = 0.5 + motion * 1.2;

  attackGain.gain.setValueAtTime(0.0001, now);
  attackGain.gain.linearRampToValueAtTime((0.34 + motion * 0.24) * intensity, now + Math.max(0.006, 0.018 - motion * 0.008));
  attackGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  delay.delayTime.setValueAtTime(0.28, now);
  feedback.gain.setValueAtTime(0.18, now);
  feedback.gain.exponentialRampToValueAtTime(0.001, now + trailSeconds);
  wetGain.gain.setValueAtTime(0.16, now);
  wetGain.gain.exponentialRampToValueAtTime(0.001, now + trailSeconds);

  carrier.connect(attackGain);
  overtone.connect(attackGain);
  attackGain.connect(highpass);
  highpass.connect(toneFilter);
  toneFilter.connect(masterGain);

  toneFilter.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(masterGain);

  carrier.start(now);
  overtone.start(now);
  carrier.stop(now + duration + trailSeconds);
  overtone.stop(now + duration + trailSeconds);
}

function createSynthVoice(frequency, intensity, trailSeconds, motion = 0.5, timeOffset = 0) {
  const now = audioContext.currentTime + timeOffset;
  const duration = 0.34 - motion * 0.06 + intensity * 0.08;
  const oscA = audioContext.createOscillator();
  const oscB = audioContext.createOscillator();
  const filter = audioContext.createBiquadFilter();
  const voiceGain = audioContext.createGain();
  const delay = audioContext.createDelay(0.8);
  const feedback = audioContext.createGain();
  const wetGain = audioContext.createGain();

  oscA.type = 'sawtooth';
  oscB.type = 'triangle';
  oscA.frequency.setValueAtTime(frequency, now);
  oscB.frequency.setValueAtTime(frequency * 1.5, now);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(Math.max(240, frequency * (1.3 + motion * 0.7)), now);
  filter.Q.value = 2.8 + motion * 1.6;

  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.18 + intensity * 0.16 + motion * 0.12, now + Math.max(0.014, 0.04 - motion * 0.012));
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  delay.delayTime.setValueAtTime(0.24, now);
  feedback.gain.setValueAtTime(0.26, now);
  feedback.gain.exponentialRampToValueAtTime(0.001, now + trailSeconds);
  wetGain.gain.setValueAtTime(0.2, now);
  wetGain.gain.exponentialRampToValueAtTime(0.001, now + trailSeconds);

  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(voiceGain);
  voiceGain.connect(masterGain);

  voiceGain.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(masterGain);

  oscA.start(now);
  oscB.start(now);
  oscA.stop(now + duration + trailSeconds);
  oscB.stop(now + duration + trailSeconds);
}

function createDriveCurve(amount) {
  const samples = 256;
  const curve = new Float32Array(samples);

  for (let index = 0; index < samples; index += 1) {
    const sample = (index * 2) / samples - 1;
    curve[index] = ((Math.PI + amount) * sample) / (Math.PI + amount * Math.abs(sample));
  }

  return curve;
}

function renderFrame() {
  const now = performance.now();
  const delta = now - lastFrameAt;
  lastFrameAt = now;

  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  updateLooper(now);
  updateMagneticPoints(now, delta);
  updateSparks(delta);

  activeSegments = activeSegments.filter((segment) => now - segment.createdAt < segment.life);
  sparks = sparks.filter((spark) => spark.life > 0);

  const density = calculateColorDensity(now);
  updateAtmosphere(density);
  updateAtmosphereStatus(density.total);

  renderMagneticPoints(now);
  renderSegments(now);
  renderSparks();

  requestAnimationFrame(renderFrame);
}

function renderSegments(now) {
  activeSegments.forEach((segment) => {
    const age = now - segment.createdAt;
    const alpha = 1 - age / segment.life;
    drawWaveSegment(segment, alpha, now);
  });
}

function drawWaveSegment(segment, alpha, now) {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const normalX = -dy / length;
  const normalY = dx / length;
  const steps = Math.max(10, Math.ceil(length / 8));

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = segment.width * 0.78;
  context.strokeStyle = withAlpha(segment.color, alpha);
  context.shadowBlur = 18;
  context.shadowColor = withAlpha(segment.shadow, alpha * 0.9);
  context.beginPath();

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const baseX = segment.from.x + dx * t;
    const baseY = segment.from.y + dy * t;
    const envelope = Math.sin(Math.PI * t);
    const wave = Math.sin(segment.wavePhase + t * ((length / segment.waveLength) * Math.PI * 2) + now * segment.waveRate);
    const offset = wave * segment.waveAmplitude * envelope;
    const x = baseX + normalX * offset;
    const y = baseY + normalY * offset;

    if (step === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
  context.restore();
}

function updateMagneticPoints(now, delta) {
  magneticPoints.forEach((magnet) => {
    magnet.pulse = Math.max(0, magnet.pulse - delta * 0.0022);

    magnet.particles.forEach((particle) => {
      particle.angle += particle.angularVelocity * (delta / 1000);

      if (now >= particle.nextTriggerAt) {
        const position = getParticlePosition(magnet, particle);
        playMagneticParticle(magnet, particle, position);
        particle.nextTriggerAt = now + particle.interval;
        magnet.pulse = 1;
      }
    });
  });
}

function renderMagneticPoints(now) {
  magneticPoints.forEach((magnet) => {
    const pulseRadius = 16 + magnet.pulse * 12;

    context.save();
    context.strokeStyle = withAlpha(magnet.shadow, 0.35);
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(magnet.x, magnet.y, pulseRadius, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = withAlpha(magnet.color, 0.9);
    context.shadowBlur = 18;
    context.shadowColor = withAlpha(magnet.shadow, 0.7);
    context.beginPath();
    context.arc(magnet.x, magnet.y, 6 + magnet.pulse * 2, 0, Math.PI * 2);
    context.fill();
    context.restore();

    magnet.particles.forEach((particle) => {
      const position = getParticlePosition(magnet, particle);
      const shimmer = 0.45 + 0.25 * Math.sin(now * 0.008 + particle.phase);

      context.save();
      context.strokeStyle = withAlpha(magnet.shadow, 0.16);
      context.lineWidth = 0.8;
      context.beginPath();
      context.arc(magnet.x, magnet.y, particle.radius, 0, Math.PI * 2);
      context.stroke();

      context.fillStyle = withAlpha(magnet.color, shimmer + magnet.pulse * 0.12);
      context.shadowBlur = 12;
      context.shadowColor = withAlpha(magnet.shadow, 0.6);
      context.beginPath();
      context.arc(position.x, position.y, particle.size, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
  });
}

function addMagneticPoint(point) {
  const instrumentKey = activeColor;
  const instrument = instruments[instrumentKey];
  const now = performance.now();

  magneticPoints.push({
    x: point.x,
    y: point.y,
    colorKey: instrumentKey,
    color: instrument.stroke,
    shadow: instrument.shadow,
    instrument,
    pulse: 1,
    particles: createMagneticParticles(now),
  });

  updateMagnetStatus();
}

function createMagneticParticles(now) {
  return [0, 1, 2].map((index) => ({
    angle: Math.random() * Math.PI * 2,
    angularVelocity: (index % 2 === 0 ? 1 : -1) * (0.8 + index * 0.34),
    radius: 26 + index * 16 + Math.random() * 10,
    size: 3.8 + index * 0.8,
    interval: 320 + index * 110,
    nextTriggerAt: now + 180 + index * 120,
    phase: Math.random() * Math.PI * 2,
  }));
}

function playMagneticParticle(magnet, particle, position) {
  if (!audioContext || audioContext.state !== 'running') {
    return;
  }

  const frequency = mapYToFrequency(position.y);
  const orbitMotion = clamp(0.55 + Math.abs(particle.angularVelocity) * 0.25, 0.55, 1.15);
  const orbitIntensity = clamp(0.3 + particle.radius / 120, 0.28, 0.72);

  magnet.instrument.synth(frequency, orbitIntensity, 1.4, orbitMotion, 0);
}

function getParticlePosition(magnet, particle) {
  return {
    x: magnet.x + Math.cos(particle.angle) * particle.radius,
    y: magnet.y + Math.sin(particle.angle) * particle.radius,
  };
}

function addStrokeSegments(segmentPairs, instrumentKey, width, motion, createdAt) {
  const instrument = instruments[instrumentKey];

  segmentPairs.forEach((pair, index) => {
    const frequency = mapYToFrequency(pair.to.y);
    const frequencyFactor = clamp((frequency - 82.41) / 905.36, 0, 1);

    activeSegments.push({
      from: clonePoint(pair.from),
      to: clonePoint(pair.to),
      colorKey: instrumentKey,
      color: instrument.stroke,
      shadow: instrument.shadow,
      width,
      createdAt,
      life: instrument.trailLife,
      waveAmplitude: 1.8 + motion * 4.8 + frequencyFactor * 1.8,
      waveLength: 18 + (1 - frequencyFactor) * 22 + index * 2,
      wavePhase: Math.random() * Math.PI * 2,
      waveRate: 0.008 + motion * 0.02 + frequencyFactor * 0.018,
    });
  });
}

function recordStrokeEvent(segmentPairs, instrumentKey, width, motion, distance, now) {
  if (!looper.isRecording) {
    return;
  }

  const relativeTime = now - looper.startAt;

  if (relativeTime > looper.duration) {
    return;
  }

  looper.events.push({
    type: 'stroke',
    time: relativeTime,
    instrumentKey,
    width,
    motion,
    distance,
    pairs: segmentPairs.map((pair) => ({
      from: clonePoint(pair.from),
      to: clonePoint(pair.to),
    })),
  });
}

function toggleLoopRecording() {
  if (looper.isRecording) {
    stopLoopRecording(true);
    return;
  }

  looper.isRecording = true;
  looper.isPlaying = false;
  looper.events = [];
  looper.startAt = performance.now();
  looper.playbackStartAt = 0;
  looper.eventIndex = 0;
  updateLoopStatus();
}

function stopLoopRecording(cancelled = false) {
  looper.isRecording = false;

  if (cancelled || looper.events.length === 0) {
    looper.isPlaying = false;
    if (cancelled) {
      looper.events = [];
    }
    updateLoopStatus();
    return;
  }

  looper.isPlaying = true;
  looper.playbackStartAt = performance.now();
  looper.eventIndex = 0;
  updateLoopStatus();
}

function updateLooper(now) {
  if (looper.isRecording) {
    updateLoopStatus();

    if (now - looper.startAt >= looper.duration) {
      stopLoopRecording(false);
    }
  }

  if (!looper.isPlaying || looper.events.length === 0) {
    return;
  }

  while (now - looper.playbackStartAt >= looper.duration) {
    looper.playbackStartAt += looper.duration;
    looper.eventIndex = 0;
  }

  while (looper.eventIndex < looper.events.length && now - looper.playbackStartAt >= looper.events[looper.eventIndex].time) {
    playLoopEvent(looper.events[looper.eventIndex]);
    looper.eventIndex += 1;
  }
}

function playLoopEvent(event) {
  if (event.type !== 'stroke') {
    return;
  }

  addStrokeSegments(event.pairs, event.instrumentKey, event.width, event.motion, performance.now());
  playStrokeChord(event.pairs.map((pair) => pair.to), event.instrumentKey, event.distance, event.motion);
}

function shatterCanvas(source) {
  if (activeSegments.length === 0 && magneticPoints.length === 0 && looper.events.length === 0) {
    speedStatus.textContent = source === 'shake' ? 'Gesture: shake with no trails' : 'Gesture: canvas already clear';
    return;
  }

  createSparksFromScene();
  activeSegments = [];
  magneticPoints = [];
  looper.isRecording = false;
  looper.isPlaying = false;
  looper.events = [];
  looper.eventIndex = 0;
  pitchStatus.textContent = 'Pitch: trails shattered';
  speedStatus.textContent = source === 'shake' ? 'Gesture: shake' : 'Gesture: cleared with sparks';
  updateMagnetStatus();
  updateLoopStatus();
  fadeAllAudio();
}

function createSparksFromScene() {
  const segmentSample = activeSegments.slice(-36);

  segmentSample.forEach((segment) => {
    const pivot = {
      x: (segment.from.x + segment.to.x) / 2,
      y: (segment.from.y + segment.to.y) / 2,
    };

    pushSparkBurst(pivot, segment.color, segment.shadow, 3);
  });

  magneticPoints.forEach((magnet) => {
    pushSparkBurst({ x: magnet.x, y: magnet.y }, magnet.color, magnet.shadow, 10);
  });
}

function pushSparkBurst(origin, color, shadow, count) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.5;
    const velocity = 80 + Math.random() * 220;

    sparks.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      color,
      shadow,
      size: 1.8 + Math.random() * 2.6,
      life: 650 + Math.random() * 550,
      maxLife: 650 + Math.random() * 550,
    });
  }
}

function updateSparks(delta) {
  const deltaSeconds = delta / 1000;

  sparks.forEach((spark) => {
    spark.x += spark.vx * deltaSeconds;
    spark.y += spark.vy * deltaSeconds;
    spark.vx *= 0.985;
    spark.vy = spark.vy * 0.985 + 260 * deltaSeconds;
    spark.life -= delta;
  });
}

function renderSparks() {
  sparks.forEach((spark) => {
    const alpha = clamp(spark.life / spark.maxLife, 0, 1);

    context.save();
    context.fillStyle = withAlpha(spark.color, alpha);
    context.shadowBlur = 10;
    context.shadowColor = withAlpha(spark.shadow, alpha);
    context.beginPath();
    context.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
}

function fadeAllAudio() {
  if (!audioContext || !masterGain) {
    return;
  }

  const now = audioContext.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.001), now);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
  masterGain.gain.linearRampToValueAtTime(0.9, now + 1.05);
}

function calculateColorDensity(now) {
  const density = { red: 0, blue: 0, yellow: 0, total: 0 };

  activeSegments.forEach((segment) => {
    const alpha = 1 - (now - segment.createdAt) / segment.life;
    const energy = Math.max(alpha, 0) * segment.width * 0.55;
    density[segment.colorKey] += energy;
  });

  magneticPoints.forEach((magnet) => {
    density[magnet.colorKey] += 18 + magnet.pulse * 10;
  });

  density.total = clamp((density.red + density.blue + density.yellow) / 180, 0, 2.2);
  return density;
}

function updateAtmosphere(density) {
  if (!ambientLayer || !audioContext || audioContext.state !== 'running') {
    return;
  }

  const now = audioContext.currentTime;
  const redLevel = clamp(density.red / 90, 0, 1.2);
  const blueLevel = clamp(density.blue / 90, 0, 1.2);
  const yellowLevel = clamp(density.yellow / 90, 0, 1.2);
  const total = density.total;

  ambientLayer.redGain.gain.setTargetAtTime(0.008 + redLevel * 0.035, now, 0.45);
  ambientLayer.blueGain.gain.setTargetAtTime(0.008 + blueLevel * 0.03, now, 0.45);
  ambientLayer.yellowGain.gain.setTargetAtTime(0.005 + yellowLevel * 0.025, now, 0.45);
  ambientLayer.master.gain.setTargetAtTime(0.025 + total * 0.06, now, 0.5);
  ambientLayer.filter.frequency.setTargetAtTime(260 + total * 620 + yellowLevel * 420, now, 0.6);
  ambientLayer.redOsc.frequency.setTargetAtTime(instruments.red.ambientFrequency + redLevel * 10, now, 0.6);
  ambientLayer.blueOsc.frequency.setTargetAtTime(instruments.blue.ambientFrequency + blueLevel * 28, now, 0.6);
  ambientLayer.yellowOsc.frequency.setTargetAtTime(instruments.yellow.ambientFrequency + yellowLevel * 54, now, 0.6);
}

function getSegmentPairs(from, to) {
  if (!isSymmetryMode) {
    return [{ from, to }];
  }

  const fromPoints = getSymmetryPoints(from);
  const toPoints = getSymmetryPoints(to);

  return toPoints.map((point, index) => ({
    from: fromPoints[index],
    to: point,
  }));
}

function getSymmetryPoints(point) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  return dedupePoints([
    point,
    { x: width - point.x, y: point.y },
    { x: point.x, y: height - point.y },
    { x: width - point.x, y: height - point.y },
  ]);
}

function dedupePoints(points) {
  const seen = new Set();

  return points.map((point) => ({
    x: clamp(point.x, 0, canvas.clientWidth),
    y: clamp(point.y, 0, canvas.clientHeight),
  })).filter((point) => {
    const key = `${Math.round(point.x)}:${Math.round(point.y)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function calculateMotion(distance, elapsed) {
  return clamp(distance / elapsed / 1.15, 0.18, 1.25);
}

function getStrokeWidth(color, motion) {
  const baseWidth = color === 'red' ? 9 : color === 'blue' ? 6 : 7.5;
  return baseWidth + motion * 3.2;
}

function describeSpeed(pixelsPerSecond) {
  if (pixelsPerSecond < 260) {
    return 'calm';
  }

  if (pixelsPerSecond < 620) {
    return 'bouncy';
  }

  if (pixelsPerSecond < 980) {
    return 'energetic';
  }

  return 'fierce';
}

function describeAtmosphere(totalDensity) {
  if (totalDensity < 0.18) {
    return 'barely audible';
  }

  if (totalDensity < 0.6) {
    return 'airy drone';
  }

  if (totalDensity < 1.1) {
    return 'dense shimmer';
  }

  return 'tense haze';
}

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function withAlpha(color, alpha) {
  if (color.startsWith('rgba')) {
    return color.replace(/rgba\(([^)]+),\s*[^,]+\)$/, (_match, rgb) => `rgba(${rgb}, ${alpha})`);
  }

  const hex = color.replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

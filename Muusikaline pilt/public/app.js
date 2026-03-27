/*
  Photo-to-Music client logic (extended feature edition)
  -------------------------------------------------------
  This script now implements the complete creative workflow:
  1) Analyze uploaded photo colors + objects.
  2) Pick instrument set based on color temperature (warm vs cold).
  3) Build a visual sequencer where each pixel-derived cell is a note.
  4) Real-time playback controls: Play / Pause / Stop / Loop.
  5) Settings editor: tempo, genre, and composition complexity.
  6) Export generated track to WAV / MP3 / MIDI.
  7) Save to gallery with local share links, likes, and comments.

  All logic runs in the browser for fast experimentation and privacy.
*/

const imageInput = document.getElementById('imageInput');
const previewImage = document.getElementById('previewImage');
const analyzeButton = document.getElementById('analyzeButton');
const playButton = document.getElementById('playButton');
const pauseButton = document.getElementById('pauseButton');
const stopButton = document.getElementById('stopButton');
const loopToggle = document.getElementById('loopToggle');

const tempoInput = document.getElementById('tempoInput');
const tempoValue = document.getElementById('tempoValue');
const genreSelect = document.getElementById('genreSelect');
const complexityInput = document.getElementById('complexityInput');
const complexityValue = document.getElementById('complexityValue');

const statusText = document.getElementById('statusText');
const colorPalette = document.getElementById('colorPalette');
const colorSummary = document.getElementById('colorSummary');
const objectList = document.getElementById('objectList');
const mappingList = document.getElementById('mappingList');

const sequencerGrid = document.getElementById('sequencerGrid');
const sequencerSummary = document.getElementById('sequencerSummary');

const exportWavButton = document.getElementById('exportWavButton');
const exportMp3Button = document.getElementById('exportMp3Button');
const exportMidiButton = document.getElementById('exportMidiButton');
const saveGalleryButton = document.getElementById('saveGalleryButton');
const exportStatus = document.getElementById('exportStatus');

const galleryList = document.getElementById('galleryList');

let model;
let currentImageDataUrl = null;
let currentAnalysis = null;
let currentComposition = null;

const sequencerState = {
  rows: 8,
  cols: 16,
  grid: []
};

const activeMusic = {
  parts: [],
  synths: []
};

const MAJOR_SCALE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const MINOR_SCALE = ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'];
const GALLERY_KEY = 'photoMusicStudio.gallery.v1';

const OBJECT_TO_INSTRUMENT_HINT = {
  person: 'lead',
  people: 'lead',
  face: 'lead',
  dog: 'rhythm',
  cat: 'rhythm',
  bird: 'chime',
  car: 'bass',
  bus: 'bass',
  train: 'bass',
  bicycle: 'pluck',
  flower: 'chime',
  forest: 'pad',
  tree: 'pad',
  mountain: 'pad',
  ocean: 'pad',
  sea: 'pad',
  food: 'pluck'
};

initModel();
restoreTrackFromShareLink();
renderGallery();

imageInput.addEventListener('change', handleImageSelection);
analyzeButton.addEventListener('click', analyzeAndCompose);

playButton.addEventListener('click', playMusic);
pauseButton.addEventListener('click', pauseMusic);
stopButton.addEventListener('click', stopMusic);
loopToggle.addEventListener('change', updateLoopMode);

tempoInput.addEventListener('input', () => {
  tempoValue.textContent = tempoInput.value;
  if (currentComposition) {
    currentComposition.tempo = Number(tempoInput.value);
    Tone.Transport.bpm.rampTo(currentComposition.tempo, 0.1);
  }
});

genreSelect.addEventListener('change', () => {
  if (currentAnalysis) rebuildCompositionFromCurrentState({ resumeIfPlaying: true });
});

complexityInput.addEventListener('input', () => {
  complexityValue.textContent = complexityInput.value;
  if (currentAnalysis) rebuildCompositionFromCurrentState({ resumeIfPlaying: true });
});

exportWavButton.addEventListener('click', exportWav);
exportMp3Button.addEventListener('click', exportMp3);
exportMidiButton.addEventListener('click', exportMidi);
saveGalleryButton.addEventListener('click', saveCurrentTrackToGallery);

async function initModel() {
  setStatus('Loading AI model (MobileNet)...');

  try {
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
    setStatus('Model is ready. Upload a photo and compose your track.');
  } catch (error) {
    console.error(error);
    setStatus('Failed to load model. Check your internet connection and refresh.');
  }
}

function handleImageSelection(event) {
  const [file] = event.target.files;

  if (!file) {
    currentImageDataUrl = null;
    previewImage.style.display = 'none';
    analyzeButton.disabled = true;
    setStatus('No image selected.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    currentImageDataUrl = reader.result;
    previewImage.src = currentImageDataUrl;
    previewImage.style.display = 'block';
    analyzeButton.disabled = false;
    setStatus('Image loaded. Click "Analyze & Compose".');
  };

  reader.readAsDataURL(file);
}

async function analyzeAndCompose() {
  if (!currentImageDataUrl) {
    setStatus('Please upload an image first.');
    return;
  }

  if (!model) {
    setStatus('The AI model is still loading. Try again in a moment.');
    return;
  }

  analyzeButton.disabled = true;

  try {
    setStatus('Analyzing colors and objects...');

    const colors = extractDominantColors(previewImage, 5);
    const objects = await detectObjects(previewImage, 6);

    currentAnalysis = { colors, objects };

    renderColors(colors);
    renderObjects(objects);

    buildSequencerFromImage(previewImage, sequencerState.rows, sequencerState.cols);
    renderSequencer();

    await rebuildCompositionFromCurrentState();
    setStatus('Track generated. Press Play to hear it (or it starts automatically).');

    await playMusic();
  } catch (error) {
    console.error(error);
    setStatus('Analysis failed. Try another image or refresh the page.');
  } finally {
    analyzeButton.disabled = false;
  }
}

async function rebuildCompositionFromCurrentState(options = {}) {
  if (!currentAnalysis) return;

  const { resumeIfPlaying = false } = options;
  const shouldResume = resumeIfPlaying && Tone.Transport.state === 'started';

  const settings = getSettings();
  currentComposition = mapImageToMusic(currentAnalysis.colors, currentAnalysis.objects, settings, sequencerState.grid);

  renderMapping(currentComposition.mappingNotes);
  loadCompositionToEngine(currentComposition);
  updateTransportButtonsState(true);
  enableExportActions(true);

  if (shouldResume) {
    await playMusic();
  }
}

function getSettings() {
  return {
    tempo: Number(tempoInput.value),
    genre: genreSelect.value,
    complexity: Number(complexityInput.value)
  };
}

function extractDominantColors(imgElement, colorCount) {
  const size = 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  canvas.width = size;
  canvas.height = size;
  ctx.drawImage(imgElement, 0, 0, size, size);

  const { data } = ctx.getImageData(0, 0, size, size);
  const bucketMap = new Map();

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 10) continue;

    const r = Math.floor(data[i] / 32) * 32;
    const g = Math.floor(data[i + 1] / 32) * 32;
    const b = Math.floor(data[i + 2] / 32) * 32;
    const key = `${r},${g},${b}`;

    bucketMap.set(key, (bucketMap.get(key) || 0) + 1);
  }

  return [...bucketMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, colorCount)
    .map(([rgb, count]) => {
      const [r, g, b] = rgb.split(',').map(Number);
      return {
        r,
        g,
        b,
        hex: rgbToHex(r, g, b),
        count,
        hsl: rgbToHsl(r, g, b)
      };
    });
}

async function detectObjects(imgElement, maxResults) {
  const predictions = await model.classify(imgElement, maxResults);

  return predictions.map((prediction) => ({
    label: prediction.className.split(',')[0].trim().toLowerCase(),
    confidence: prediction.probability
  }));
}

function buildSequencerFromImage(imgElement, rows, cols) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  canvas.width = cols;
  canvas.height = rows;
  ctx.drawImage(imgElement, 0, 0, cols, rows);

  const { data } = ctx.getImageData(0, 0, cols, rows);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const idx = (y * cols + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      grid[y][x] = luminance > 0.58;
    }
  }

  sequencerState.grid = grid;
}

function renderSequencer() {
  sequencerGrid.innerHTML = '';
  sequencerGrid.style.setProperty('--cols', String(sequencerState.cols));

  let activeCount = 0;

  for (let row = 0; row < sequencerState.rows; row += 1) {
    for (let col = 0; col < sequencerState.cols; col += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'seq-cell';
      cell.disabled = true;
      cell.tabIndex = -1;
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);

      if (sequencerState.grid[row][col]) {
        cell.classList.add('active');
        activeCount += 1;
      }

      sequencerGrid.appendChild(cell);
    }
  }

  sequencerSummary.textContent = `Sequencer ready: ${sequencerState.rows} x ${sequencerState.cols}, active notes: ${activeCount}`;
}

function mapImageToMusic(colors, objects, settings, sequencerGridState) {
  const averageBrightness = average(colors.map((c) => c.hsl.l));
  const averageSaturation = average(colors.map((c) => c.hsl.s));
  const warmRatio = computeWarmRatio(colors);

  const isMinorMood = warmRatio < 0.45;
  const scale = isMinorMood ? MINOR_SCALE : MAJOR_SCALE;
  const root = pickRootFromHue(colors[0]?.hsl.h ?? 0);

  const tempo = settings.tempo;
  const octave = averageBrightness > 0.58 ? 5 : 4;
  const densityFromComplexity = 4 + settings.complexity * 2;
  const dominantRole = pickDominantRole(objects);
  const instrumentProfile = warmRatio >= 0.5 ? 'warm' : 'cold';

  const notePool = scale.map((note) => `${transposeNoteToRoot(note, root)}${octave}`);
  const bassPool = [
    `${root}${Math.max(2, octave - 2)}`,
    `${transposeNoteToRoot(scale[4], root)}${Math.max(2, octave - 2)}`,
    `${transposeNoteToRoot(scale[5], root)}${Math.max(2, octave - 2)}`
  ];

  const melody = buildMelodyFromSequencer(sequencerGridState, notePool, densityFromComplexity);
  const bassLine = buildBassLine(bassPool, settings.genre, densityFromComplexity);
  const rhythmPattern = buildRhythmPattern(settings.genre, densityFromComplexity, dominantRole);

  return {
    tempo,
    mood: isMinorMood ? 'minor / cinematic' : 'major / bright',
    dominantRole,
    instrumentProfile,
    genre: settings.genre,
    complexity: settings.complexity,
    root,
    octave,
    mappingNotes: [
      `Palette warmth: ${(warmRatio * 100).toFixed(0)}% warm -> instrument profile: ${instrumentProfile}`,
      'Warm colors => guitar/piano textures, cold colors => synth/pad textures',
      `Mood mode: ${isMinorMood ? 'minor' : 'major'}`,
      `Settings override tempo: ${tempo} BPM, genre: ${settings.genre}, complexity: ${settings.complexity}`,
      `Average saturation ${(averageSaturation * 100).toFixed(0)}% impacts melody density`,
      `Detected object role emphasis: ${dominantRole}`,
      `Root note selected from dominant hue: ${root}`
    ],
    sequences: {
      melody,
      bassLine,
      rhythmPattern
    },
    timbre: {
      leadType: averageSaturation > 0.55 ? 'triangle' : 'sine',
      padType: averageBrightness > 0.6 ? 'sawtooth' : 'triangle'
    }
  };
}

function loadCompositionToEngine(composition) {
  stopMusic();

  Tone.Transport.cancel(0);
  Tone.Transport.bpm.value = composition.tempo;

  const lead = createLeadSynth(composition);
  const harmony = createHarmonySynth(composition);
  const bass = createBassSynth(composition);
  const drum = createDrumSynth();

  const leadPart = new Tone.Sequence(
    (time, note) => {
      if (note) triggerLeadNote(lead, note, time);
    },
    composition.sequences.melody,
    '8n'
  );

  const padPart = new Tone.Sequence(
    (time, note) => {
      if (note) harmony.triggerAttackRelease([note, shiftOctave(note, 1)], '4n', time);
    },
    sparseFromDense(composition.sequences.melody),
    '4n'
  );

  const bassPart = new Tone.Sequence(
    (time, note) => {
      if (note) bass.triggerAttackRelease(note, '8n', time);
    },
    composition.sequences.bassLine,
    '8n'
  );

  const drumPart = new Tone.Sequence(
    (time, hit) => {
      if (hit) drum.triggerAttackRelease('C2', '16n', time);
    },
    composition.sequences.rhythmPattern,
    '8n'
  );

  [leadPart, padPart, bassPart, drumPart].forEach((part) => part.start(0));

  activeMusic.parts = [leadPart, padPart, bassPart, drumPart];
  activeMusic.synths = [lead, harmony, bass, drum];

  updateLoopMode();
}

function createLeadSynth(composition) {
  if (composition.instrumentProfile === 'warm') {
    return new Tone.PluckSynth({
      attackNoise: 0.8,
      dampening: 3800,
      resonance: 0.92,
      volume: -9
    }).toDestination();
  }

  return new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.03, decay: 0.18, sustain: 0.2, release: 0.6 },
    volume: -8
  }).toDestination();
}

function createHarmonySynth(composition) {
  if (composition.instrumentProfile === 'warm') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.12, release: 1.0 },
      volume: -11
    }).toDestination();
  }

  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: composition.timbre.padType },
    envelope: { attack: 0.35, decay: 0.4, sustain: 0.65, release: 1.8 },
    volume: -12
  }).toDestination();
}

function createBassSynth(composition) {
  if (composition.genre === 'lofi') {
    return new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.03, decay: 0.2, sustain: 0.45, release: 0.6 },
      volume: -10
    }).toDestination();
  }

  return new Tone.MonoSynth({
    oscillator: { type: composition.genre === 'electronic' ? 'sawtooth' : 'square' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.35, release: 0.5 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.4 },
    volume: -9
  }).toDestination();
}

function createDrumSynth() {
  return new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 5,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.2 },
    volume: -13
  }).toDestination();
}

function triggerLeadNote(leadSynth, note, time) {
  // PluckSynth does not provide triggerAttackRelease like standard synths.
  if (typeof leadSynth.triggerAttackRelease === 'function') {
    leadSynth.triggerAttackRelease(note, '8n', time);
    return;
  }

  if (typeof leadSynth.triggerAttack === 'function') {
    leadSynth.triggerAttack(note, time);
  }
}

async function playMusic() {
  if (!currentComposition) return;

  await Tone.start();
  Tone.Transport.bpm.rampTo(currentComposition.tempo, 0.05);
  Tone.Transport.start('+0.01');

  playButton.disabled = true;
  pauseButton.disabled = false;
  stopButton.disabled = false;

  setStatus('Playback started. You can pause, stop, or loop the generated sequencer.');
}

function pauseMusic() {
  Tone.Transport.pause();
  playButton.disabled = false;
  pauseButton.disabled = true;
  setStatus('Playback paused. Press Play to resume.');
}

function stopMusic() {
  Tone.Transport.stop();

  activeMusic.parts.forEach((part) => part.dispose());
  activeMusic.synths.forEach((synth) => synth.dispose());

  activeMusic.parts = [];
  activeMusic.synths = [];

  playButton.disabled = !currentComposition;
  pauseButton.disabled = true;
  stopButton.disabled = !currentComposition;
}

function updateLoopMode() {
  Tone.Transport.loop = loopToggle.checked;
  Tone.Transport.loopStart = 0;
  Tone.Transport.loopEnd = '2m';
}

function updateTransportButtonsState(enabled) {
  playButton.disabled = !enabled;
  pauseButton.disabled = true;
  stopButton.disabled = !enabled;
}

function enableExportActions(enabled) {
  exportWavButton.disabled = !enabled;
  exportMp3Button.disabled = !enabled;
  exportMidiButton.disabled = !enabled;
  saveGalleryButton.disabled = !enabled;
}

function renderColors(colors) {
  colorPalette.innerHTML = '';

  colors.forEach((color) => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = color.hex;
    swatch.title = color.hex;
    colorPalette.appendChild(swatch);
  });

  colorSummary.textContent = colors.map((c) => c.hex).join(', ');
}

function renderObjects(objects) {
  objectList.innerHTML = '';

  if (!objects.length) {
    const item = document.createElement('li');
    item.textContent = 'No confident object predictions.';
    objectList.appendChild(item);
    return;
  }

  objects.forEach((obj) => {
    const item = document.createElement('li');
    item.textContent = `${obj.label} (${(obj.confidence * 100).toFixed(1)}%)`;
    objectList.appendChild(item);
  });
}

function renderMapping(mappingNotes) {
  mappingList.innerHTML = '';

  mappingNotes.forEach((note) => {
    const item = document.createElement('li');
    item.textContent = note;
    mappingList.appendChild(item);
  });
}

function buildMelodyFromSequencer(grid, notePool, density) {
  const cols = grid[0]?.length || 16;
  const rows = grid.length || 8;
  const melody = Array(cols).fill(null);

  for (let col = 0; col < cols; col += 1) {
    const activeRows = [];

    for (let row = 0; row < rows; row += 1) {
      if (grid[row][col]) activeRows.push(row);
    }

    if (!activeRows.length) continue;

    const selectedRow = activeRows[0];
    const noteIndex = Math.floor((selectedRow / Math.max(1, rows - 1)) * (notePool.length - 1));

    if (col % Math.max(1, Math.floor(16 / density)) === 0 || Math.random() < 0.2) {
      melody[col] = notePool[notePool.length - 1 - noteIndex];
    }
  }

  return melody;
}

function buildBassLine(bassPool, genre, density) {
  const length = 16;
  const bassLine = [];

  for (let i = 0; i < length; i += 1) {
    let gate = i % 4 === 0;

    if (genre === 'electronic') gate = i % 2 === 0;
    if (genre === 'ambient') gate = i % 8 === 0;
    if (density >= 9) gate = gate || i % 3 === 0;

    bassLine.push(gate ? bassPool[i % bassPool.length] : null);
  }

  return bassLine;
}

function buildRhythmPattern(genre, density, dominantRole) {
  const length = 16;
  const pattern = [];

  for (let i = 0; i < length; i += 1) {
    let hit = i % 4 === 0;

    if (genre === 'electronic') hit = i % 2 === 0 || i % 4 === 0;
    if (genre === 'lofi') hit = i % 4 === 0 || i % 8 === 6;
    if (genre === 'ambient') hit = i % 8 === 0;

    if (dominantRole === 'rhythm') hit = hit || i % 2 === 0;
    if (density >= 9) hit = hit || i % 3 === 0;

    pattern.push(hit);
  }

  return pattern;
}

function sparseFromDense(sequence) {
  return sequence.filter((_, index) => index % 2 === 0);
}

function exportWav() {
  if (!currentComposition) return;

  exportStatus.textContent = 'Rendering WAV...';

  const durationSeconds = 12;
  const sampleRate = 44100;
  const pcm = renderTrackSamples(currentComposition, durationSeconds, sampleRate);
  const wavBlob = pcmToWavBlob(pcm, sampleRate);

  downloadBlob(wavBlob, `photo-track-${Date.now()}.wav`);
  exportStatus.textContent = 'WAV export complete.';
}

function exportMp3() {
  if (!currentComposition) return;

  if (typeof lamejs === 'undefined') {
    exportStatus.textContent = 'MP3 library not loaded. Please refresh and try again.';
    return;
  }

  exportStatus.textContent = 'Rendering MP3...';

  const durationSeconds = 12;
  const sampleRate = 44100;
  const pcm = renderTrackSamples(currentComposition, durationSeconds, sampleRate);
  const mp3Blob = pcmToMp3Blob(pcm, sampleRate, 128);

  downloadBlob(mp3Blob, `photo-track-${Date.now()}.mp3`);
  exportStatus.textContent = 'MP3 export complete.';
}

function exportMidi() {
  if (!currentComposition) return;

  const midiBytes = compositionToMidiBytes(currentComposition);
  const midiBlob = new Blob([new Uint8Array(midiBytes)], { type: 'audio/midi' });
  downloadBlob(midiBlob, `photo-track-${Date.now()}.mid`);

  exportStatus.textContent = 'MIDI export complete.';
}

function renderTrackSamples(composition, durationSeconds, sampleRate) {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const buffer = new Float32Array(totalSamples);

  const stepDurationSec = 60 / composition.tempo / 2;
  const melody = composition.sequences.melody;
  const bass = composition.sequences.bassLine;
  const rhythm = composition.sequences.rhythmPattern;

  for (let step = 0; step < 32; step += 1) {
    const time = step * stepDurationSec;
    const sampleIndex = Math.floor(time * sampleRate);

    if (sampleIndex >= totalSamples) break;

    const melodyNote = melody[step % melody.length];
    if (melodyNote) {
      mixNote(buffer, sampleRate, sampleIndex, noteToFrequency(melodyNote), 0.18, 0.9, composition.instrumentProfile === 'warm' ? 'pluck' : 'sine');
    }

    const bassNote = bass[step % bass.length];
    if (bassNote) {
      mixNote(buffer, sampleRate, sampleIndex, noteToFrequency(bassNote), 0.28, 0.65, 'saw');
    }

    const drumHit = rhythm[step % rhythm.length];
    if (drumHit) {
      mixKick(buffer, sampleRate, sampleIndex, 0.2);
    }
  }

  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = Math.max(-1, Math.min(1, buffer[i] * 0.9));
  }

  return buffer;
}

function mixNote(buffer, sampleRate, startSample, frequency, durationSec, gain, waveform) {
  const length = Math.floor(durationSec * sampleRate);

  for (let i = 0; i < length; i += 1) {
    const idx = startSample + i;
    if (idx >= buffer.length) break;

    const t = i / sampleRate;
    const env = Math.exp(-6 * t / durationSec);

    let wave = 0;
    if (waveform === 'pluck') {
      wave = Math.sin(2 * Math.PI * frequency * t) * 0.7 + Math.sin(2 * Math.PI * frequency * 2 * t) * 0.3;
    } else if (waveform === 'saw') {
      wave = 2 * ((frequency * t) % 1) - 1;
    } else {
      wave = Math.sin(2 * Math.PI * frequency * t);
    }

    buffer[idx] += wave * env * gain;
  }
}

function mixKick(buffer, sampleRate, startSample, gain) {
  const length = Math.floor(0.18 * sampleRate);

  for (let i = 0; i < length; i += 1) {
    const idx = startSample + i;
    if (idx >= buffer.length) break;

    const t = i / sampleRate;
    const freq = 140 * Math.exp(-22 * t) + 40;
    const env = Math.exp(-18 * t);
    const wave = Math.sin(2 * Math.PI * freq * t);

    buffer[idx] += wave * env * gain;
  }
}

function pcmToWavBlob(float32Buffer, sampleRate) {
  const int16 = floatTo16BitPCM(float32Buffer);
  const wavBytes = encodeWav(int16, sampleRate, 1);
  return new Blob([wavBytes], { type: 'audio/wav' });
}

function pcmToMp3Blob(float32Buffer, sampleRate, kbps) {
  const pcm16 = floatTo16BitPCM(float32Buffer);
  const encoder = new lamejs.Mp3Encoder(1, sampleRate, kbps);
  const blockSize = 1152;
  const mp3Data = [];

  for (let i = 0; i < pcm16.length; i += blockSize) {
    const chunk = pcm16.subarray(i, i + blockSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) mp3Data.push(new Int8Array(mp3buf));
  }

  const end = encoder.flush();
  if (end.length > 0) mp3Data.push(new Int8Array(end));

  return new Blob(mp3Data, { type: 'audio/mpeg' });
}

function floatTo16BitPCM(float32Buffer) {
  const out = new Int16Array(float32Buffer.length);

  for (let i = 0; i < float32Buffer.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32Buffer[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return out;
}

function encodeWav(samples, sampleRate, channels) {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return buffer;
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function compositionToMidiBytes(composition) {
  const ticksPerQuarter = 480;
  const events = [];
  const tempoMicro = Math.floor(60000000 / composition.tempo);

  events.push(...varLen(0), 0xff, 0x51, 0x03, (tempoMicro >> 16) & 0xff, (tempoMicro >> 8) & 0xff, tempoMicro & 0xff);

  const stepTicks = 240;
  let lastTick = 0;

  for (let i = 0; i < composition.sequences.melody.length; i += 1) {
    const note = composition.sequences.melody[i];
    if (!note) continue;

    const tick = i * stepTicks;
    const deltaOn = tick - lastTick;
    const midiNote = noteNameToMidi(note);

    events.push(...varLen(deltaOn), 0x90, midiNote, 0x64);
    events.push(...varLen(stepTicks), 0x80, midiNote, 0x40);

    lastTick = tick + stepTicks;
  }

  events.push(...varLen(0), 0xff, 0x2f, 0x00);

  const trackLength = events.length;

  const header = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff
  ];

  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (trackLength >> 24) & 0xff,
    (trackLength >> 16) & 0xff,
    (trackLength >> 8) & 0xff,
    trackLength & 0xff
  ];

  return [...header, ...trackHeader, ...events];
}

function varLen(value) {
  let buffer = value & 0x7f;
  const bytes = [];

  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }

  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }

  return bytes;
}

function noteNameToMidi(note) {
  const match = note.match(/^([A-G])([b#]?)(\d)$/);
  if (!match) return 60;

  const [, base, accidental, octaveText] = match;
  const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  let value = semitones[base] + (Number(octaveText) + 1) * 12;
  if (accidental === 'b') value -= 1;
  if (accidental === '#') value += 1;

  return Math.max(0, Math.min(127, value));
}

function noteToFrequency(note) {
  const midi = noteNameToMidi(note);
  return 440 * 2 ** ((midi - 69) / 12);
}

function saveCurrentTrackToGallery() {
  if (!currentComposition || !currentAnalysis || !currentImageDataUrl) return;

  const items = loadGallery();
  const id = `trk-${Date.now()}`;

  items.unshift({
    id,
    createdAt: new Date().toISOString(),
    title: `${currentComposition.genre} • ${currentComposition.instrumentProfile}`,
    imageDataUrl: currentImageDataUrl,
    composition: currentComposition,
    analysis: {
      colors: currentAnalysis.colors,
      objects: currentAnalysis.objects
    },
    likes: 0,
    comments: []
  });

  saveGallery(items);
  renderGallery();

  exportStatus.textContent = 'Track saved to gallery.';
}

function renderGallery() {
  const items = loadGallery();
  galleryList.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'status';
    empty.textContent = 'Gallery is empty. Save your first track.';
    galleryList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'gallery-card';

    const title = document.createElement('h3');
    title.textContent = item.title;

    const meta = document.createElement('p');
    meta.className = 'status';
    meta.textContent = new Date(item.createdAt).toLocaleString();

    const thumb = document.createElement('img');
    thumb.src = item.imageDataUrl;
    thumb.alt = 'Track source image';
    thumb.className = 'gallery-thumb';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.textContent = 'Load & Play';
    loadBtn.addEventListener('click', async () => {
      loadGalleryTrack(item.id);
      await playMusic();
    });

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.textContent = 'Share Link';
    shareBtn.addEventListener('click', async () => {
      const shareUrl = `${location.origin}${location.pathname}#track=${item.id}`;
      await navigator.clipboard.writeText(shareUrl);
      exportStatus.textContent = 'Share link copied to clipboard.';
    });

    const likeBtn = document.createElement('button');
    likeBtn.type = 'button';
    likeBtn.textContent = `Like (${item.likes || 0})`;
    likeBtn.addEventListener('click', () => {
      updateGalleryItem(item.id, (draft) => {
        draft.likes = (draft.likes || 0) + 1;
      });
      renderGallery();
    });

    actions.appendChild(loadBtn);
    actions.appendChild(shareBtn);
    actions.appendChild(likeBtn);

    const commentsList = document.createElement('ul');
    commentsList.className = 'object-list';

    (item.comments || []).forEach((comment) => {
      const li = document.createElement('li');
      li.textContent = comment;
      commentsList.appendChild(li);
    });

    const commentWrap = document.createElement('div');
    commentWrap.className = 'comment-wrap';

    const commentInput = document.createElement('input');
    commentInput.type = 'text';
    commentInput.placeholder = 'Write a comment';

    const commentBtn = document.createElement('button');
    commentBtn.type = 'button';
    commentBtn.textContent = 'Add Comment';
    commentBtn.addEventListener('click', () => {
      const text = commentInput.value.trim();
      if (!text) return;

      updateGalleryItem(item.id, (draft) => {
        draft.comments = draft.comments || [];
        draft.comments.push(text);
      });

      renderGallery();
    });

    commentWrap.appendChild(commentInput);
    commentWrap.appendChild(commentBtn);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(thumb);
    card.appendChild(actions);
    card.appendChild(commentsList);
    card.appendChild(commentWrap);

    galleryList.appendChild(card);
  });
}

function loadGalleryTrack(trackId) {
  const items = loadGallery();
  const item = items.find((entry) => entry.id === trackId);
  if (!item) return;

  currentImageDataUrl = item.imageDataUrl;
  previewImage.src = item.imageDataUrl;
  previewImage.style.display = 'block';

  currentAnalysis = item.analysis;
  currentComposition = item.composition;

  renderColors(currentAnalysis.colors);
  renderObjects(currentAnalysis.objects);
  renderMapping(currentComposition.mappingNotes || []);

  tempoInput.value = String(currentComposition.tempo || 110);
  tempoValue.textContent = tempoInput.value;
  genreSelect.value = currentComposition.genre || 'ambient';
  complexityInput.value = String(currentComposition.complexity || 2);
  complexityValue.textContent = complexityInput.value;

  if (!sequencerState.grid.length) {
    sequencerState.grid = buildEmptyGrid(sequencerState.rows, sequencerState.cols);
  }

  loadCompositionToEngine(currentComposition);
  updateTransportButtonsState(true);
  enableExportActions(true);
  setStatus('Track loaded from gallery.');
}

function restoreTrackFromShareLink() {
  const hash = location.hash || '';
  const match = hash.match(/track=([\w-]+)/);
  if (!match) return;

  loadGalleryTrack(match[1]);
}

function loadGallery() {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveGallery(items) {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
}

function updateGalleryItem(trackId, updater) {
  const items = loadGallery();
  const idx = items.findIndex((item) => item.id === trackId);
  if (idx < 0) return;

  updater(items[idx]);
  saveGallery(items);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildEmptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(false));
}

function pickDominantRole(objects) {
  if (!objects.length) return 'balanced';

  for (const obj of objects) {
    const words = obj.label.split(' ');

    for (const word of words) {
      if (OBJECT_TO_INSTRUMENT_HINT[word]) return OBJECT_TO_INSTRUMENT_HINT[word];
    }
  }

  return 'balanced';
}

function pickRootFromHue(hue) {
  const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const segment = 360 / roots.length;
  const index = Math.floor(hue / segment) % roots.length;
  return roots[index];
}

function transposeNoteToRoot(note, root) {
  const cScale = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const rootIndex = cScale.indexOf(root);
  const noteIndex = cScale.indexOf(note.replace('b', ''));

  if (noteIndex < 0 || rootIndex < 0) return note;

  const shifted = cScale[(noteIndex + rootIndex) % cScale.length];
  return note.includes('b') ? `${shifted}b` : shifted;
}

function shiftOctave(note, delta) {
  const match = note.match(/^([A-G]b?)(\d)$/);
  if (!match) return note;

  const [, pitch, octaveStr] = match;
  const octave = Number(octaveStr);
  return `${pitch}${octave + delta}`;
}

function computeWarmRatio(colors) {
  if (!colors.length) return 0.5;

  const warm = colors.filter((color) => {
    const h = color.hsl.h;
    return (h >= 0 && h < 80) || (h >= 300 && h <= 360);
  }).length;

  return warm / colors.length;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;

    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s, l };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function setStatus(message) {
  statusText.textContent = message;
}

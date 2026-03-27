const stage = document.getElementById("stage");
const ctx = stage.getContext("2d", { willReadFrequently: true });

const cameraFeed = document.getElementById("cameraFeed");
const uploadedImage = document.getElementById("uploadedImage");
const startCameraBtn = document.getElementById("startCameraBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const startMicBtn = document.getElementById("startMicBtn");
const stopMicBtn = document.getElementById("stopMicBtn");
const freezeCaptureBtn = document.getElementById("freezeCaptureBtn");
const freezeClearBtn = document.getElementById("freezeClearBtn");
const chaosSaveBtn = document.getElementById("chaosSaveBtn");
const uploadInput = document.getElementById("uploadInput");

const rgbEnabled = document.getElementById("rgbEnabled");
const rgbPower = document.getElementById("rgbPower");
const moshEnabled = document.getElementById("moshEnabled");
const moshPower = document.getElementById("moshPower");
const sortEnabled = document.getElementById("sortEnabled");
const sortArea = document.getElementById("sortArea");
const audioReactiveEnabled = document.getElementById("audioReactiveEnabled");
const audioSensitivity = document.getElementById("audioSensitivity");
const scanlineEnabled = document.getElementById("scanlineEnabled");
const scanlinePower = document.getElementById("scanlinePower");
const noiseEnabled = document.getElementById("noiseEnabled");
const noisePower = document.getElementById("noisePower");
const mirrorSectors = document.getElementById("mirrorSectors");
const freezeEnabled = document.getElementById("freezeEnabled");
const freezeSize = document.getElementById("freezeSize");
const asciiEnabled = document.getElementById("asciiEnabled");
const asciiCell = document.getElementById("asciiCell");

const mirrorCanvas = document.createElement("canvas");
const mirrorCtx = mirrorCanvas.getContext("2d");

const state = {
  sourceType: "none",
  stream: null,
  micStream: null,
  audioContext: null,
  analyser: null,
  audioData: null,
  audioLevel: 0,
  prevFrame: null,
  frozenRegion: null,
  freezeArmed: false,
  mouseX: 0,
  mouseY: 0,
  mouseVX: 0,
  mouseVY: 0,
  glitchImpulse: 0,
  lastMouseX: 0,
  lastMouseY: 0,
  width: 960,
  height: 540,
};

function resizeStage() {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.floor(width * 9 / 16);
  stage.width = width;
  stage.height = height;
  state.width = width;
  state.height = height;
  mirrorCanvas.width = width;
  mirrorCanvas.height = height;
  state.frozenRegion = null;
}

window.addEventListener("resize", resizeStage);
resizeStage();

function decayImpulse() {
  state.glitchImpulse *= 0.92;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateAudioLevel() {
  if (!state.analyser || !state.audioData) {
    state.audioLevel *= 0.88;
    return;
  }

  state.analyser.getByteTimeDomainData(state.audioData);
  let sum = 0;
  for (let i = 0; i < state.audioData.length; i += 1) {
    const centered = (state.audioData[i] - 128) / 128;
    sum += centered * centered;
  }

  const rms = Math.sqrt(sum / state.audioData.length);
  const gain = Number(audioSensitivity.value);
  const amplified = clamp(rms * gain * 4.5, 0, 1);
  state.audioLevel = state.audioLevel * 0.72 + amplified * 0.28;
}

function showCameraError(error) {
  if (!window.isSecureContext) {
    alert("Камера недоступна: откройте приложение через https:// или http://localhost (а не напрямую как file://).");
    return;
  }

  if (error && error.name === "NotAllowedError") {
    alert("Доступ к камере отклонен. Разрешите доступ к камере в браузере и попробуйте снова.");
    return;
  }

  if (error && error.name === "NotFoundError") {
    alert("Камера не найдена. Проверьте подключение устройства и настройки системы.");
    return;
  }

  if (error && error.name === "NotReadableError") {
    alert("Камера занята другим приложением. Закройте его и повторите попытку.");
    return;
  }

  alert("Не удалось запустить камеру. Проверьте разрешения браузера и перезагрузите страницу.");
}

function getCurrentSource() {
  if (state.sourceType === "camera" && cameraFeed.readyState >= 2) {
    return cameraFeed;
  }
  if (state.sourceType === "image" && uploadedImage.complete) {
    return uploadedImage;
  }
  return null;
}

function drawSource(source) {
  const sw = source.videoWidth || source.naturalWidth;
  const sh = source.videoHeight || source.naturalHeight;
  if (!sw || !sh) {
    return false;
  }

  const scale = Math.max(stage.width / sw, stage.height / sh);
  const drawW = sw * scale;
  const drawH = sh * scale;
  const dx = (stage.width - drawW) * 0.5;
  const dy = (stage.height - drawH) * 0.5;

  ctx.drawImage(source, dx, dy, drawW, drawH);
  return true;
}

function sampleChannel(data, x, y, channel, width, height) {
  const clampedX = Math.min(width - 1, Math.max(0, x));
  const clampedY = Math.min(height - 1, Math.max(0, y));
  const idx = (clampedY * width + clampedX) * 4;
  return data[idx + channel];
}

function applyRgbSplit(frame) {
  if (!rgbEnabled.checked) {
    return;
  }

  const width = frame.width;
  const height = frame.height;
  const data = frame.data;
  const copy = new Uint8ClampedArray(data);

  const power = Number(rgbPower.value);
  const motion = Math.min(1.8, Math.hypot(state.mouseVX, state.mouseVY) / 40);
  const audioBoost = audioReactiveEnabled.checked ? (1 + state.audioLevel * 2.4) : 1;
  const baseShift = Math.floor(power * (0.4 + motion) * audioBoost);

  const shiftRX = Math.round(baseShift + state.mouseX * 0.012);
  const shiftRY = Math.round(baseShift * 0.4 + state.mouseY * 0.01);
  const shiftGX = Math.round(-baseShift * 0.7);
  const shiftGY = Math.round(baseShift * 0.2);
  const shiftBX = Math.round(baseShift * 0.3 - state.mouseX * 0.008);
  const shiftBY = Math.round(-baseShift * 0.6);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = sampleChannel(copy, x + shiftRX, y + shiftRY, 0, width, height);
      data[i + 1] = sampleChannel(copy, x + shiftGX, y + shiftGY, 1, width, height);
      data[i + 2] = sampleChannel(copy, x + shiftBX, y + shiftBY, 2, width, height);
    }
  }
}

function applyDatamoshLite(frame) {
  if (!moshEnabled.checked || !state.prevFrame) {
    return;
  }

  const width = frame.width;
  const height = frame.height;
  const data = frame.data;
  const prev = state.prevFrame;

  const audioFactor = audioReactiveEnabled.checked ? state.audioLevel : 0;
  const amount = clamp(Number(moshPower.value) + audioFactor * 0.35, 0, 0.95);
  const driftX = Math.round((state.mouseVX * 0.35) + (state.glitchImpulse * 14) + (audioFactor * 22));
  const driftY = Math.round((state.mouseVY * 0.25) - (state.glitchImpulse * 8) + ((Math.random() - 0.5) * audioFactor * 14));

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const srcX = Math.min(width - 1, Math.max(0, x - driftX));
      const srcY = Math.min(height - 1, Math.max(0, y - driftY));
      const i = (y * width + x) * 4;
      const pi = (srcY * width + srcX) * 4;

      data[i] = data[i] * (1 - amount) + prev[pi] * amount;
      data[i + 1] = data[i + 1] * (1 - amount) + prev[pi + 1] * amount;
      data[i + 2] = data[i + 2] * (1 - amount) + prev[pi + 2] * amount;
    }
  }
}

function luminanceAt(data, index) {
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function findBrightRegion(frame) {
  const width = frame.width;
  const height = frame.height;
  const data = frame.data;

  let bestX = Math.floor(width * 0.5);
  let bestY = Math.floor(height * 0.5);
  let bestL = -1;

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const l = luminanceAt(data, i);
      if (l > bestL) {
        bestL = l;
        bestX = x;
        bestY = y;
      }
    }
  }

  return { x: bestX, y: bestY };
}

function applyPixelSorting(frame) {
  if (!sortEnabled.checked) {
    return;
  }

  const width = frame.width;
  const height = frame.height;
  const data = frame.data;
  const areaBoost = audioReactiveEnabled.checked ? (1 + state.audioLevel * 1.4) : 1;
  const area = clamp(Math.floor(Number(sortArea.value) * areaBoost), 40, 360);

  const center = findBrightRegion(frame);
  const half = Math.floor(area * 0.5);

  const x0 = Math.max(0, center.x - half);
  const y0 = Math.max(0, center.y - half);
  const x1 = Math.min(width - 1, center.x + half);
  const y1 = Math.min(height - 1, center.y + half);

  for (let y = y0; y <= y1; y += 1) {
    const row = [];

    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 4;
      row.push({
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
        a: data[i + 3],
        l: luminanceAt(data, i),
      });
    }

    row.sort((a, b) => a.l - b.l);

    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 4;
      const px = row[x - x0];
      data[i] = px.r;
      data[i + 1] = px.g;
      data[i + 2] = px.b;
      data[i + 3] = px.a;
    }
  }

  ctx.save();
  ctx.strokeStyle = "rgba(91,252,198,0.35)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

function applyScanlineOverlay() {
  if (!scanlineEnabled.checked) {
    return;
  }

  const base = Number(scanlinePower.value);
  const audioFactor = audioReactiveEnabled.checked ? state.audioLevel : 0;
  const intensity = clamp(base + audioFactor * 0.45, 0, 1);
  const band = 2 + Math.floor(audioFactor * 3);
  const phase = performance.now() * 0.06;

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let y = 0; y < stage.height; y += band + 2) {
    const flicker = 0.3 + 0.7 * Math.abs(Math.sin((y * 0.07) + phase));
    ctx.fillStyle = `rgba(0, 0, 0, ${0.07 + intensity * 0.22 * flicker})`;
    ctx.fillRect(0, y, stage.width, band);
  }

  ctx.globalCompositeOperation = "screen";
  for (let y = 1; y < stage.height; y += 12) {
    ctx.fillStyle = `rgba(91, 252, 198, ${0.015 + intensity * 0.05})`;
    ctx.fillRect(0, y, stage.width, 1);
  }
  ctx.restore();
}

function applyVhsNoise() {
  if (!noiseEnabled.checked) {
    return;
  }

  const base = Number(noisePower.value);
  const audioFactor = audioReactiveEnabled.checked ? state.audioLevel : 0;
  const intensity = clamp(base + audioFactor * 0.55, 0, 1);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const speckCount = Math.floor(stage.width * stage.height * (0.00012 + intensity * 0.0012));
  for (let i = 0; i < speckCount; i += 1) {
    const x = Math.random() * stage.width;
    const y = Math.random() * stage.height;
    const a = 0.03 + Math.random() * 0.28 * intensity;
    const c = Math.floor(170 + Math.random() * 85);
    ctx.fillStyle = `rgba(${c}, ${c}, ${c}, ${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const tearCount = 1 + Math.floor(intensity * 5);
  for (let i = 0; i < tearCount; i += 1) {
    const y = Math.random() * stage.height;
    const h = 1 + Math.random() * 2;
    const alpha = 0.06 + Math.random() * intensity * 0.2;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(0, y, stage.width, h);
  }
  ctx.restore();
}

function applyMirrorDimension() {
  const sectors = Number(mirrorSectors.value);
  if (sectors !== 4 && sectors !== 8) {
    return;
  }

  mirrorCtx.clearRect(0, 0, stage.width, stage.height);
  mirrorCtx.drawImage(stage, 0, 0, stage.width, stage.height);

  const radius = Math.hypot(stage.width, stage.height);
  const angle = (Math.PI * 2) / sectors;

  ctx.clearRect(0, 0, stage.width, stage.height);
  ctx.save();
  ctx.translate(stage.width * 0.5, stage.height * 0.5);

  for (let i = 0; i < sectors; i += 1) {
    ctx.save();
    ctx.rotate(i * angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-angle * 0.5) * radius, Math.sin(-angle * 0.5) * radius);
    ctx.lineTo(Math.cos(angle * 0.5) * radius, Math.sin(angle * 0.5) * radius);
    ctx.closePath();
    ctx.clip();

    if (i % 2 === 1) {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(mirrorCanvas, -stage.width * 0.5, -stage.height * 0.5, stage.width, stage.height);
    ctx.restore();
  }
  ctx.restore();
}

function captureFrozenRegion(x, y) {
  const size = Number(freezeSize.value);
  const half = Math.floor(size * 0.5);
  const sx = clamp(Math.round(x - half), 0, stage.width - size);
  const sy = clamp(Math.round(y - half), 0, stage.height - size);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const cctx = canvas.getContext("2d");
  cctx.drawImage(stage, sx, sy, size, size, 0, 0, size, size);

  state.frozenRegion = { sx, sy, size, canvas };
}

function applyFrameFreeze() {
  if (!freezeEnabled.checked || !state.frozenRegion) {
    return;
  }

  const { sx, sy, size, canvas } = state.frozenRegion;
  const cx = sx + size * 0.5;
  const cy = sy + size * 0.5;
  const radius = size * 0.5;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(canvas, sx, sy, size, size);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 90, 84, 0.75)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function applyAsciiMode() {
  if (!asciiEnabled.checked) {
    return;
  }

  const step = Number(asciiCell.value);
  const w = stage.width;
  const h = stage.height;
  const chars = " .:-=+*#%@";
  const image = ctx.getImageData(0, 0, w, h).data;

  ctx.save();
  ctx.fillStyle = "rgba(2, 8, 5, 0.92)";
  ctx.fillRect(0, 0, w, h);
  ctx.font = `${step}px monospace`;
  ctx.textBaseline = "top";

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const luma = image[idx] * 0.299 + image[idx + 1] * 0.587 + image[idx + 2] * 0.114;
      const cidx = Math.min(chars.length - 1, Math.floor((luma / 255) * chars.length));
      const ch = chars[cidx];
      const alpha = 0.28 + (luma / 255) * 0.72;
      const blueShift = Math.floor((1 - luma / 255) * 60);
      ctx.fillStyle = `rgba(${70 + blueShift}, 255, ${140 + blueShift}, ${alpha})`;
      ctx.fillText(ch, x, y);
    }
  }
  ctx.restore();
}

function applyRandomSaveArtifact(targetCtx, width, height) {
  const variant = Math.floor(Math.random() * 4);

  if (variant === 0) {
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const sctx = scratch.getContext("2d");
    sctx.drawImage(targetCtx.canvas, 0, 0, width, height);

    const slices = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < slices; i += 1) {
      const y = Math.floor(Math.random() * height);
      const sliceH = 8 + Math.floor(Math.random() * 34);
      const shift = Math.floor((Math.random() - 0.5) * width * 0.16);
      targetCtx.drawImage(scratch, 0, y, width, sliceH, shift, y, width, sliceH);
    }
    return;
  }

  if (variant === 1) {
    const x = Math.random() * width * 0.7;
    const y = Math.random() * height * 0.7;
    const w = width * (0.2 + Math.random() * 0.25);
    const h = height * (0.15 + Math.random() * 0.25);
    targetCtx.save();
    targetCtx.globalCompositeOperation = "screen";
    targetCtx.fillStyle = `rgba(${180 + Math.random() * 70}, ${20 + Math.random() * 40}, ${20 + Math.random() * 40}, 0.18)`;
    targetCtx.fillRect(x, y, w, h);
    targetCtx.restore();
    return;
  }

  if (variant === 2) {
    const count = Math.floor(width * height * 0.0009);
    for (let i = 0; i < count; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      targetCtx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
      targetCtx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    return;
  }

  targetCtx.save();
  targetCtx.globalCompositeOperation = "overlay";
  const grad = targetCtx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "rgba(91,252,198,0.16)");
  grad.addColorStop(0.5, "rgba(255,90,84,0.2)");
  grad.addColorStop(1, "rgba(61,152,255,0.17)");
  targetCtx.fillStyle = grad;
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.restore();
}

function chaosSaveCurrentFrame() {
  const out = document.createElement("canvas");
  out.width = stage.width;
  out.height = stage.height;
  const outCtx = out.getContext("2d");

  outCtx.drawImage(stage, 0, 0, out.width, out.height);
  applyRandomSaveArtifact(outCtx, out.width, out.height);

  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.download = `digital-nightmare-chaos-${stamp}.png`;
  link.href = out.toDataURL("image/png");
  link.click();
}

function render() {
  ctx.clearRect(0, 0, stage.width, stage.height);
  updateAudioLevel();
  const source = getCurrentSource();

  if (!source) {
    ctx.fillStyle = "#0e1012";
    ctx.fillRect(0, 0, stage.width, stage.height);
    ctx.fillStyle = "#8aa5b3";
    ctx.font = "600 20px Space Grotesk";
    ctx.fillText("Включите камеру или загрузите изображение", 24, 44);
    requestAnimationFrame(render);
    return;
  }

  const drawn = drawSource(source);
  if (!drawn) {
    requestAnimationFrame(render);
    return;
  }

  const frame = ctx.getImageData(0, 0, stage.width, stage.height);

  applyDatamoshLite(frame);
  applyRgbSplit(frame);
  applyPixelSorting(frame);

  ctx.putImageData(frame, 0, 0);
  applyFrameFreeze();
  applyMirrorDimension();
  applyScanlineOverlay();
  applyVhsNoise();
  applyAsciiMode();
  state.prevFrame = new Uint8ClampedArray(frame.data);

  decayImpulse();
  requestAnimationFrame(render);
}

stage.addEventListener("mousemove", (event) => {
  const rect = stage.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  state.mouseVX = x - state.lastMouseX;
  state.mouseVY = y - state.lastMouseY;
  state.lastMouseX = x;
  state.lastMouseY = y;
  state.mouseX = x;
  state.mouseY = y;
});

stage.addEventListener("mouseleave", () => {
  state.mouseVX *= 0.3;
  state.mouseVY *= 0.3;
});

stage.addEventListener("click", (event) => {
  const rect = stage.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  state.glitchImpulse = 1 + Math.random() * 0.8;

  if (freezeEnabled.checked && state.freezeArmed) {
    captureFrozenRegion(x, y);
    state.freezeArmed = false;
    freezeCaptureBtn.textContent = "Заморозить область";
  }
});

startCameraBtn.addEventListener("click", async () => {
  try {
    if (state.stream) {
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Ваш браузер не поддерживает доступ к камере через getUserMedia.");
      return;
    }

    if (!window.isSecureContext) {
      showCameraError(new Error("InsecureContext"));
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
      },
      audio: false,
    });

    cameraFeed.srcObject = stream;
    await cameraFeed.play();
    state.stream = stream;
    state.sourceType = "camera";
    state.prevFrame = null;
    state.frozenRegion = null;
    state.freezeArmed = false;
    freezeCaptureBtn.textContent = "Заморозить область";
  } catch (error) {
    console.error(error);
    showCameraError(error);
  }
});

startMicBtn.addEventListener("click", async () => {
  try {
    if (state.micStream) {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    state.micStream = stream;
    state.audioContext = audioContext;
    state.analyser = analyser;
    state.audioData = new Uint8Array(analyser.frequencyBinCount);
    state.audioLevel = 0;
  } catch (error) {
    console.error(error);
    alert("Не удалось получить доступ к микрофону. Проверьте разрешения браузера.");
  }
});

stopMicBtn.addEventListener("click", async () => {
  if (state.micStream) {
    for (const track of state.micStream.getTracks()) {
      track.stop();
    }
  }

  if (state.audioContext) {
    await state.audioContext.close();
  }

  state.micStream = null;
  state.audioContext = null;
  state.analyser = null;
  state.audioData = null;
  state.audioLevel = 0;
});

freezeCaptureBtn.addEventListener("click", () => {
  if (!freezeEnabled.checked) {
    freezeEnabled.checked = true;
  }
  state.freezeArmed = true;
  freezeCaptureBtn.textContent = "Кликни по кадру...";
});

freezeClearBtn.addEventListener("click", () => {
  state.frozenRegion = null;
  state.freezeArmed = false;
  freezeCaptureBtn.textContent = "Заморозить область";
});

freezeEnabled.addEventListener("change", () => {
  if (!freezeEnabled.checked) {
    state.freezeArmed = false;
    freezeCaptureBtn.textContent = "Заморозить область";
  }
});

chaosSaveBtn.addEventListener("click", () => {
  chaosSaveCurrentFrame();
});

stopCameraBtn.addEventListener("click", () => {
  if (state.stream) {
    for (const track of state.stream.getTracks()) {
      track.stop();
    }
  }

  cameraFeed.srcObject = null;
  state.stream = null;
  if (state.sourceType === "camera") {
    state.sourceType = "none";
  }
});

uploadInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const url = URL.createObjectURL(file);
  uploadedImage.onload = () => {
    state.sourceType = "image";
    state.prevFrame = null;
    state.frozenRegion = null;
    URL.revokeObjectURL(url);
  };
  uploadedImage.src = url;

  if (state.stream) {
    for (const track of state.stream.getTracks()) {
      track.stop();
    }
    state.stream = null;
    cameraFeed.srcObject = null;
  }
});

render();

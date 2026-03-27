const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const emotionLabel = document.getElementById("emotionLabel");
const confidenceLabel = document.getElementById("confidenceLabel");
const cameraState = document.getElementById("cameraState");
const emotionIcon = document.getElementById("emotionIcon");
const videoContainer = document.querySelector(".video-container");

// Remote URL containing pre-trained face-api.js model files.
// In production, you can host these models locally for faster loading and offline use.
const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

// Interval (ms) between emotion inference runs.
// Lower values increase responsiveness but also increase CPU usage.
const DETECTION_MS = 650;

// Stores the active interval ID so it can be safely replaced on re-start.
let detectTimer = null;

// The detector can output several expressions.
// This map normalizes them into app-supported mood categories.
const emotionMap = {
  happy: "happy",
  sad: "sad",
  neutral: "neutral",
  angry: "angry",
  disgusted: "angry",
  fearful: "sad",
  surprised: "surprised",
};

// Human-readable labels for UI.
const emotionLabels = {
  happy: "Happy",
  sad: "Sad",
  neutral: "Neutral",
  angry: "Angry",
  surprised: "Surprised",
};

// Keeps resolved icon URLs (real file path or generated fallback) for each emotion.
const emotionIconSources = {
  happy: null,
  sad: null,
  neutral: null,
  angry: null,
  surprised: null,
};

// Tracks the currently rendered icon to avoid reassigning the same src each cycle.
let currentIconSource = "";

// Stores the latest detected face box so we can re-render icon position on resize.
let lastFaceBox = null;

// Generates an inline SVG icon as a safe fallback when PNG files are missing.
function createFallbackIcon(emotion) {
  const label = emotionLabels[emotion] || "Neutral";
  const colors = {
    happy: "#e3a800",
    sad: "#4b7fb8",
    neutral: "#4c6c70",
    angry: "#be4b49",
    surprised: "#7f6ad6",
  };
  const textColor = colors[emotion] || colors.neutral;

  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><text x='120' y='128' text-anchor='middle' fill='${textColor}' font-family='Arial, sans-serif' font-size='24'>${label}</text></svg>`
  )}`;
}

// Checks whether a given image path can be loaded by the browser.
function canLoadImage(path) {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(true);
    probe.onerror = () => resolve(false);
    probe.src = path;
  });
}

// Tries several likely locations for emotion images and stores the first available path.
// If no file exists, it stores a generated fallback icon to avoid 404 spam.
async function resolveEmotionIconSources() {
  const emotions = ["happy", "sad", "neutral", "angry", "surprised"];

  for (const emotion of emotions) {
    const fileNames = emotion === "surprised"
      ? ["suprise.png", "surprised.png"]
      : [`${emotion}.png`];

    const candidates = fileNames.flatMap((fileName) => [
      `assets/emotions/${fileName}`,
      `assets/${fileName}`,
      fileName,
    ]);

    let resolved = null;

    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await canLoadImage(candidate)) {
        resolved = candidate;
        break;
      }
    }

    emotionIconSources[emotion] = resolved || createFallbackIcon(emotion);
  }
}

// Applies icon update only when the source actually changed.
function setEmotionIcon(emotion) {
  const resolvedEmotion = emotionIconSources[emotion] ? emotion : "neutral";
  const nextSource = emotionIconSources[resolvedEmotion] || createFallbackIcon("neutral");

  if (nextSource !== currentIconSource) {
    emotionIcon.src = nextSource;
    currentIconSource = nextSource;
  }
}

// Calculates how the source video frame is rendered inside the container when object-fit: cover is used.
function getRenderedVideoMetrics() {
  const containerRect = videoContainer.getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;
  const sourceWidth = video.videoWidth || 1;
  const sourceHeight = video.videoHeight || 1;

  const coverScale = Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const renderedWidth = sourceWidth * coverScale;
  const renderedHeight = sourceHeight * coverScale;
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;

  return {
    containerWidth,
    containerHeight,
    coverScale,
    offsetX,
    offsetY,
  };
}

// Positions icon next to detected face and mirrors X coordinate to match the mirrored selfie view.
function positionIconNearFace(faceBox, emotion = "neutral") {
  if (!faceBox || !video.videoWidth || !video.videoHeight) {
    return;
  }

  const metrics = getRenderedVideoMetrics();
  const renderedX = metrics.offsetX + faceBox.x * metrics.coverScale;
  const renderedY = metrics.offsetY + faceBox.y * metrics.coverScale;
  const renderedW = faceBox.width * metrics.coverScale;
  const renderedH = faceBox.height * metrics.coverScale;

  // Video is mirrored with CSS (scaleX(-1)), so we mirror the detected face X position too.
  const mirroredX = metrics.containerWidth - (renderedX + renderedW);

  const iconSize = Math.max(44, Math.min(96, renderedW * 0.45));
  const isSad = emotion === "sad";
  const finalIconSize = isSad ? Math.max(36, Math.round(iconSize * 0.82)) : iconSize;
  const gap = 8;

  let left = mirroredX + renderedW + gap;
  let top = renderedY + renderedH * 0.02 - 8;

  // Sad icon should feel lighter in composition: smaller and slightly higher.
  if (isSad) {
    top -= 14;
  }

  // If there is not enough space on the right side, place icon on the left side of face.
  if (left + finalIconSize > metrics.containerWidth - 6) {
    left = mirroredX - finalIconSize - gap;
  }

  // Keep icon inside container bounds.
  left = Math.max(6, Math.min(left, metrics.containerWidth - finalIconSize - 6));
  top = Math.max(6, Math.min(top, metrics.containerHeight - finalIconSize - 6));

  emotionIcon.style.width = `${finalIconSize}px`;
  emotionIcon.style.height = `${finalIconSize}px`;
  emotionIcon.style.left = `${left}px`;
  emotionIcon.style.top = `${top}px`;
  emotionIcon.style.opacity = "0.96";
}

function hideFaceIcon() {
  emotionIcon.style.opacity = "0";
}

// Loads only the two required networks:
// 1) tiny face detector (fast face localization)
// 2) expression net (emotion probabilities)
async function loadModels() {
  cameraState.textContent = "Loading emotion models...";

  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
  ]);
}

// Requests the front camera stream and binds it to the <video> element.
// If permissions are denied, this function throws and is handled by boot().
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();
  cameraState.textContent = "Camera is active";
}

// Chooses the most probable expression returned by the model
// and normalizes it to one of the required 4 emotions.
function pickEmotion(expressions) {
  const [bestRaw, confidence] = Object.entries(expressions).sort((a, b) => b[1] - a[1])[0] || ["neutral", 0];
  const normalized = emotionMap[bestRaw] || "neutral";
  return { emotion: normalized, confidence };
}

// Runs one full detection step:
// 1) detect a face
// 2) infer expression probabilities
// 3) update UI labels and global background mood theme
async function detectEmotion() {
  if (video.readyState < 2) {
    // No frame data yet; skip this cycle.
    return;
  }

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceExpressions();

  if (!detection) {
    // If no face is visible, keep a calm default state.
    document.body.dataset.emotion = "neutral";
    emotionLabel.textContent = "Face not found";
    confidenceLabel.textContent = "0%";
    cameraState.textContent = "Please center your face in the frame";
    setEmotionIcon("neutral");
    lastFaceBox = null;
    hideFaceIcon();
    return;
  }

  const { emotion, confidence } = pickEmotion(detection.expressions);

  // The data-emotion attribute is consumed by CSS selectors to swap the full-page theme.
  document.body.dataset.emotion = emotion;
  emotionLabel.textContent = emotionLabels[emotion] || "Neutral";
  confidenceLabel.textContent = `${Math.round(confidence * 100)}%`;
  cameraState.textContent = "Detecting emotion in real time";

  // Update the emotion icon image to match the current detected emotion.
  setEmotionIcon(emotion);
  lastFaceBox = detection.detection.box;
  positionIconNearFace(lastFaceBox, emotion);
}

// Starts or replaces the periodic inference loop.
function startDetectionLoop() {
  if (detectTimer) {
    clearInterval(detectTimer);
  }

  detectTimer = setInterval(() => {
    detectEmotion().catch((error) => {
      cameraState.textContent = `Detection error: ${error.message}`;
    });
  }, DETECTION_MS);
}

// Entry point triggered by the "Start Camera" button.
// It verifies browser support, then executes the startup pipeline.
async function boot() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraState.textContent = "Your browser does not support camera access";
    startBtn.disabled = true;
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = "Preparing...";

  try {
    await resolveEmotionIconSources();
    setEmotionIcon("neutral");
    hideFaceIcon();
    await loadModels();
    await startCamera();
    startDetectionLoop();
    startBtn.textContent = "Camera Running";
  } catch (error) {
    startBtn.disabled = false;
    startBtn.textContent = "Try Again";
    cameraState.textContent = `Startup failed: ${error.message}`;
  }
}

startBtn.addEventListener("click", () => {
  boot();
});

window.addEventListener("resize", () => {
  if (lastFaceBox) {
    positionIconNearFace(lastFaceBox, document.body.dataset.emotion || "neutral");
  }
});

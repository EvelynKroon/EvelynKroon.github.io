# Photo to Music Studio

A JavaScript + Node.js web application where a user uploads a photo, the app analyzes image colors and detected objects, and then turns the result into a unique musical composition.

## Features

- Upload any image from your device.
- Dominant color extraction from the image.
- Object recognition in the browser using MobileNet (TensorFlow.js).
- Automatic music generation with Tone.js (melody, bass, rhythm, pad/texture).
- Instrument profile mapping from color temperature:
  - Warm colors -> guitar-like pluck + piano-like harmony.
  - Cold colors -> synth lead + sustained pads.
- Visual sequencer grid where image pixels become note triggers.
- Manual cell editing in sequencer to reshape the melody.
- Real-time player controls: Play / Pause / Stop / Loop.
- Settings editor for tempo, genre, and composition complexity.
- Export to WAV, MP3, and MIDI.
- Local gallery with saved tracks, share links, likes, and comments.
- Human-readable mapping report that explains how image features were converted into music.

## Tech Stack

- Node.js + Express (server)
- Vanilla JavaScript (frontend)
- TensorFlow.js + MobileNet (object detection)
- Tone.js (audio synthesis and sequencing)
- LameJS (client-side MP3 encoding)

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm start
```

3. Open in browser:

```text
http://localhost:3000
```

## How It Works (Detailed)

1. User uploads an image in the browser.
2. The image is previewed and passed to two analysis pipelines:
   - Color analysis:
     - Image is downscaled to a small canvas (`64x64`) for speed.
     - Pixels are quantized into color buckets.
     - Most frequent buckets become the dominant palette.
   - Object analysis:
     - MobileNet predicts top classes from the image (for example `dog`, `car`, `forest`).
3. The app converts visual features into music parameters:
  - Warm/cool palette ratio chooses instrument profile (warm vs cold).
  - Hue chooses the root note.
  - Brightness influences octave.
  - Saturation and complexity influence event density.
  - Object labels influence role emphasis.
4. The app creates a visual sequencer matrix from resized image pixels.
5. User can manually edit sequencer cells, then the composition is rebuilt instantly.
6. Real-time engine plays the loop with Play / Pause / Stop and Loop mode.
7. Export module renders audio to WAV/MP3 and writes a MIDI file.
8. Gallery stores tracks in localStorage and supports share links, likes, and comments.

## Notes

- The object model is loaded from CDN, so internet is required at first load.
- Audio playback requires user interaction (browser policy), which is satisfied by clicking `Analyze & Compose`.

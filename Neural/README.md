# Neural Canvas

An interactive audio-visual canvas: you draw with lines, and the app turns gestures into short musical phrases.

## Features

- Y-axis position controls pitch: higher cursor, higher note.
- Movement speed controls loudness and attack sharpness: faster lines sound more aggressive.
- The wave brush draws a living oscillogram instead of a straight line, tied to the current sound.
- Brush color selects an instrument:
  - red: aggressive bass;
  - blue: soft piano;
  - yellow: bright synth.
- Trails on the canvas fade gradually, and their sound decays into echo.
- Magnetic points create orbital sound particles and an endless rhythmic pattern.
- Symmetry mode mirrors each stroke in 4 directions, building complex visual and sonic chords.
- A looper records 5 seconds of gestures and plays them back in a loop.
- Phone shake or the clear button explodes visuals into sparks and fades the sound.
- Background atmosphere is generated from color density on the canvas and changes as it fills.

## Run

The easiest way is to open `index.html` in your browser.

You can enable sound with the button or just start drawing: the browser activates Web Audio on the first user gesture.

If you want a local server, use any static server, for example:

```powershell
python -m http.server 8080
```

After launch, open `http://localhost:8080`.

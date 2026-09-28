# voicemod-v2

A lightweight browser-based Voicemod-style prototype with:

- Preset voice changers (`Clean`, `Radio`, `Demon`, `Robot`, `Cave`)
- Soundboard buttons with real audio uploads (`Airhorn`, `Beep Beep`, `Applause`)
- Settings for `Master gain`, `Monitor gain`, and `Soundboard gain`
- Mixed output stream that combines your processed voice + soundboard audio

## Prerequisites

- Node.js 18+ (for build command)
- Python 3 (for local dev server command)

## Run (dev)

Because this uses microphone access, run it from a local web server (not `file://`).

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2
npm run dev
```

Then open <http://localhost:8080> and:

1. Click **Enable Microphone**.
2. Pick a voice preset.
3. (Optional) Upload real audio files for each soundboard button.
4. Press soundboard buttons to inject sounds into the same output path.
5. Adjust settings as needed; settings are persisted in browser local storage.

## Build

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2
npm run build
```

This creates a deployable static bundle in:

- `/home/runner/work/voicemod-v2/voicemod-v2/dist`

## Virtual mic output

The app exposes the processed stream at:

```js
window.voicemodOutputStream
```

Use that stream where a microphone `MediaStream` is accepted (for example, WebRTC integrations).

## Notes

- Works in modern Chromium/Firefox with Web Audio + `getUserMedia` support.
- Uploaded soundboard files are decoded in-browser and are not sent to a server.
- This is a browser clone/prototype, so device-level virtual-driver routing is not included.

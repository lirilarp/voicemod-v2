# voicemod-v2

A lightweight browser-based Voicemod-style prototype with:

- Preset voice changers (`Clean`, `Radio`, `Demon`, `Robot`, `Cave`)
- Soundboard buttons (`Airhorn`, `Beep Beep`, `Applause`)
- Mixed output stream that combines your processed voice + soundboard audio

## Run

Because this uses microphone access, run it from a local web server (not `file://`).

```bash
cd /home/runner/work/voicemod-v2/voicemod-v2
python3 -m http.server 8080
```

Then open <http://localhost:8080> and:

1. Click **Enable Microphone**.
2. Pick a voice preset.
3. Press soundboard buttons to inject sounds into the same output path.

## Virtual mic output

The app exposes the processed stream at:

```js
window.voicemodOutputStream
```

Use that stream where a microphone `MediaStream` is accepted (for example, WebRTC integrations).

## Notes

- Works in modern Chromium/Firefox with Web Audio + `getUserMedia` support.
- This is a browser clone/prototype, so device-level virtual-driver routing is not included.

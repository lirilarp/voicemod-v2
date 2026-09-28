const startButton = document.getElementById('startButton');
const presetSelect = document.getElementById('presetSelect');
const soundButtons = Array.from(document.querySelectorAll('[data-sound]'));
const statusLabel = document.getElementById('status');

let audioContext;
let initialized = false;
let soundboardBus;
let virtualMicDestination;
let nodes;

const presets = {
  clean: { hp: 70, lp: 12000, p1Freq: 1400, p1Gain: 0, p2Freq: 3200, p2Gain: 0, distortion: 0, delayMix: 0, delayTime: 0.1, feedback: 0.1, tremoloRate: 0, tremoloDepth: 0 },
  radio: { hp: 350, lp: 3200, p1Freq: 1800, p1Gain: 6, p2Freq: 900, p2Gain: -4, distortion: 16, delayMix: 0, delayTime: 0.08, feedback: 0.1, tremoloRate: 0, tremoloDepth: 0 },
  demon: { hp: 80, lp: 2600, p1Freq: 220, p1Gain: 10, p2Freq: 1800, p2Gain: -7, distortion: 52, delayMix: 0.15, delayTime: 0.17, feedback: 0.3, tremoloRate: 0, tremoloDepth: 0 },
  robot: { hp: 120, lp: 5000, p1Freq: 700, p1Gain: 5, p2Freq: 2400, p2Gain: -3, distortion: 24, delayMix: 0.2, delayTime: 0.08, feedback: 0.35, tremoloRate: 35, tremoloDepth: 0.35 },
  cave: { hp: 80, lp: 8500, p1Freq: 950, p1Gain: 2, p2Freq: 3100, p2Gain: -2, distortion: 8, delayMix: 0.5, delayTime: 0.24, feedback: 0.45, tremoloRate: 0, tremoloDepth: 0 },
};

function setStatus(message) {
  statusLabel.textContent = `Status: ${message}`;
}

function makeDistortionCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const k = typeof amount === 'number' ? amount : 0;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 10 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function applyPreset(name) {
  const preset = presets[name] ?? presets.clean;
  const now = audioContext.currentTime;

  nodes.highpass.frequency.setTargetAtTime(preset.hp, now, 0.02);
  nodes.lowpass.frequency.setTargetAtTime(preset.lp, now, 0.02);
  nodes.peaking1.frequency.setTargetAtTime(preset.p1Freq, now, 0.02);
  nodes.peaking1.gain.setTargetAtTime(preset.p1Gain, now, 0.02);
  nodes.peaking2.frequency.setTargetAtTime(preset.p2Freq, now, 0.02);
  nodes.peaking2.gain.setTargetAtTime(preset.p2Gain, now, 0.02);

  nodes.distortion.curve = makeDistortionCurve(preset.distortion);
  nodes.delay.delayTime.setTargetAtTime(preset.delayTime, now, 0.02);
  nodes.feedback.gain.setTargetAtTime(preset.feedback, now, 0.02);
  nodes.delayMix.gain.setTargetAtTime(preset.delayMix, now, 0.02);
  nodes.dryMix.gain.setTargetAtTime(1 - Math.min(preset.delayMix * 0.5, 0.45), now, 0.02);

  if (preset.tremoloDepth > 0 && preset.tremoloRate > 0) {
    nodes.tremoloOsc.frequency.setTargetAtTime(preset.tremoloRate, now, 0.02);
    nodes.tremoloDepth.gain.setTargetAtTime(preset.tremoloDepth, now, 0.02);
  } else {
    nodes.tremoloDepth.gain.setTargetAtTime(0, now, 0.02);
  }

  setStatus(`voice effect preset: ${name}`);
}

async function initialize() {
  if (initialized) {
    return;
  }

  const input = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();

  const mic = audioContext.createMediaStreamSource(input);
  const highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass';

  const lowpass = audioContext.createBiquadFilter();
  lowpass.type = 'lowpass';

  const peaking1 = audioContext.createBiquadFilter();
  peaking1.type = 'peaking';
  peaking1.Q.value = 1;

  const peaking2 = audioContext.createBiquadFilter();
  peaking2.type = 'peaking';
  peaking2.Q.value = 1;

  const distortion = audioContext.createWaveShaper();
  distortion.oversample = '4x';

  const dryMix = audioContext.createGain();
  const delayMix = audioContext.createGain();
  const delay = audioContext.createDelay(0.5);
  const feedback = audioContext.createGain();
  const master = audioContext.createGain();
  master.gain.value = 0.9;

  const tremoloCarrier = audioContext.createGain();
  tremoloCarrier.gain.value = 1;
  const tremoloDepth = audioContext.createGain();
  const tremoloConstant = audioContext.createConstantSource();
  const tremoloOsc = audioContext.createOscillator();

  tremoloConstant.offset.value = 1;
  tremoloOsc.type = 'sine';

  soundboardBus = audioContext.createGain();
  soundboardBus.gain.value = 0.8;

  virtualMicDestination = audioContext.createMediaStreamDestination();
  window.voicemodOutputStream = virtualMicDestination.stream;

  mic.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(peaking1);
  peaking1.connect(peaking2);

  peaking2.connect(dryMix);
  peaking2.connect(distortion);
  distortion.connect(dryMix);

  peaking2.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(delayMix);

  dryMix.connect(tremoloCarrier);
  delayMix.connect(tremoloCarrier);
  soundboardBus.connect(tremoloCarrier);

  tremoloCarrier.connect(master);
  master.connect(virtualMicDestination);

  // Low-volume local monitor so users can hear effect without feedback loops.
  const monitor = audioContext.createGain();
  monitor.gain.value = 0.12;
  master.connect(monitor);
  monitor.connect(audioContext.destination);

  tremoloConstant.connect(tremoloCarrier.gain);
  tremoloOsc.connect(tremoloDepth);
  tremoloDepth.connect(tremoloCarrier.gain);

  tremoloConstant.start();
  tremoloOsc.start();

  nodes = {
    highpass,
    lowpass,
    peaking1,
    peaking2,
    distortion,
    delay,
    feedback,
    delayMix,
    dryMix,
    tremoloOsc,
    tremoloDepth,
  };

  applyPreset('clean');

  initialized = true;
  presetSelect.disabled = false;
  soundButtons.forEach((button) => {
    button.disabled = false;
  });

  setStatus('microphone connected; output stream ready on window.voicemodOutputStream');
}

function addEnvelope(node, attack, release, total) {
  const now = audioContext.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(0.0001, now);
  node.gain.exponentialRampToValueAtTime(1, now + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, now + total + release);
}

function playAirhorn() {
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  osc.type = 'sawtooth';
  filter.type = 'lowpass';
  filter.frequency.value = 1200;

  const now = audioContext.currentTime;
  osc.frequency.setValueAtTime(750, now);
  osc.frequency.exponentialRampToValueAtTime(280, now + 0.6);

  addEnvelope(gain, 0.01, 0.05, 0.55);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(soundboardBus);

  osc.start();
  osc.stop(now + 0.65);
}

function playBeep() {
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = 'square';

  const now = audioContext.currentTime;
  osc.frequency.setValueAtTime(920, now);

  gain.gain.setValueAtTime(0.0001, now);
  for (let i = 0; i < 3; i += 1) {
    const start = now + i * 0.18;
    gain.gain.exponentialRampToValueAtTime(0.9, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
  }

  osc.connect(gain);
  gain.connect(soundboardBus);

  osc.start();
  osc.stop(now + 0.62);
}

function playApplause() {
  const bufferSize = audioContext.sampleRate * 0.8;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  filter.type = 'bandpass';
  filter.frequency.value = 2400;
  filter.Q.value = 0.7;

  source.buffer = buffer;
  addEnvelope(gain, 0.02, 0.08, 0.72);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(soundboardBus);

  source.start();
}

function playSound(name) {
  if (!initialized) {
    return;
  }

  if (name === 'airhorn') playAirhorn();
  if (name === 'beep') playBeep();
  if (name === 'applause') playApplause();
}

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  setStatus('requesting microphone permission...');

  try {
    await initialize();
  } catch (error) {
    startButton.disabled = false;
    setStatus(`microphone access failed (${error.message})`);
  }
});

presetSelect.addEventListener('change', (event) => {
  applyPreset(event.target.value);
});

soundButtons.forEach((button) => {
  button.addEventListener('click', () => {
    playSound(button.dataset.sound);
  });
});

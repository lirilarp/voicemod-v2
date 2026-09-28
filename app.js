import { APP_VERSION } from './app-version.js';

const startButton = document.getElementById('startButton');
const stopAllButton = document.getElementById('stopAllButton');
const presetSelect = document.getElementById('presetSelect');
const soundButtons = Array.from(document.querySelectorAll('[data-sound]'));
const statusLabel = document.getElementById('status');
const uploadSummary = document.getElementById('uploadSummary');
const appVersionLabel = document.getElementById('appVersionLabel');
const latestVersionLabel = document.getElementById('latestVersionLabel');
const updateBanner = document.getElementById('updateBanner');
const updateVersionText = document.getElementById('updateVersionText');
const reloadNowButton = document.getElementById('reloadNowButton');
const checkUpdateButton = document.getElementById('checkUpdateButton');

const uploadInputs = {
  airhorn: document.getElementById('upload-airhorn'),
  beep: document.getElementById('upload-beep'),
  applause: document.getElementById('upload-applause'),
};

const settingsInputs = {
  masterGain: document.getElementById('masterGain'),
  monitorGain: document.getElementById('monitorGain'),
  soundboardGain: document.getElementById('soundboardGain'),
  autoUpdateEnabled: document.getElementById('autoUpdateEnabled'),
};

const settingsValues = {
  masterGain: document.getElementById('masterGainValue'),
  monitorGain: document.getElementById('monitorGainValue'),
  soundboardGain: document.getElementById('soundboardGainValue'),
};

let audioContext;
let initialized = false;
let soundboardBus;
let virtualMicDestination;
let nodes;
let masterNode;
let monitorNode;
let isReloading = false;

const activeSources = new Set();
const settingsStorageKey = 'voicemod-v2-settings';
const updateCheckIntervalMs = 60_000;

const defaultSettings = {
  masterGain: 0.9,
  monitorGain: 0.12,
  soundboardGain: 0.8,
  autoUpdateEnabled: true,
};

const settings = {
  ...defaultSettings,
};

const uploadedBuffers = {
  airhorn: null,
  beep: null,
  applause: null,
};

const uploadedFileNames = {
  airhorn: null,
  beep: null,
  applause: null,
};

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStoredSettings() {
  try {
    const raw = localStorage.getItem(settingsStorageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.masterGain === 'number') settings.masterGain = clamp(parsed.masterGain, 0, 1.5);
    if (typeof parsed.monitorGain === 'number') settings.monitorGain = clamp(parsed.monitorGain, 0, 0.6);
    if (typeof parsed.soundboardGain === 'number') settings.soundboardGain = clamp(parsed.soundboardGain, 0, 1.5);
    if (typeof parsed.autoUpdateEnabled === 'boolean') settings.autoUpdateEnabled = parsed.autoUpdateEnabled;
  } catch {
    localStorage.removeItem(settingsStorageKey);
  }
}

function writeSettings() {
  localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
}

function refreshSettingUI() {
  settingsInputs.masterGain.value = String(Math.round(settings.masterGain * 100));
  settingsInputs.monitorGain.value = String(Math.round(settings.monitorGain * 100));
  settingsInputs.soundboardGain.value = String(Math.round(settings.soundboardGain * 100));
  settingsInputs.autoUpdateEnabled.checked = settings.autoUpdateEnabled;

  settingsValues.masterGain.textContent = `${Math.round(settings.masterGain * 100)}%`;
  settingsValues.monitorGain.textContent = `${Math.round(settings.monitorGain * 100)}%`;
  settingsValues.soundboardGain.textContent = `${Math.round(settings.soundboardGain * 100)}%`;
}

function applySettingsToGraph() {
  if (!audioContext) return;
  if (masterNode) {
    masterNode.gain.setTargetAtTime(settings.masterGain, audioContext.currentTime, 0.02);
  }
  if (monitorNode) {
    monitorNode.gain.setTargetAtTime(settings.monitorGain, audioContext.currentTime, 0.02);
  }
  if (soundboardBus) {
    soundboardBus.gain.setTargetAtTime(settings.soundboardGain, audioContext.currentTime, 0.02);
  }
}

function updateSetting(key, rawValue) {
  if (key === 'autoUpdateEnabled') {
    settings.autoUpdateEnabled = Boolean(rawValue);
    if (settings.autoUpdateEnabled) {
      hideUpdateBanner();
    }
  } else {
    const asNumber = Number(rawValue);
    if (Number.isNaN(asNumber)) return;
    if (key === 'masterGain') settings.masterGain = clamp(asNumber / 100, 0, 1.5);
    if (key === 'monitorGain') settings.monitorGain = clamp(asNumber / 100, 0, 0.6);
    if (key === 'soundboardGain') settings.soundboardGain = clamp(asNumber / 100, 0, 1.5);
  }

  refreshSettingUI();
  writeSettings();
  if (initialized) applySettingsToGraph();
}

function updateUploadSummary() {
  const entries = Object.entries(uploadedFileNames)
    .filter(([, value]) => value)
    .map(([slot, value]) => `${slot}: ${value}`);
  uploadSummary.textContent = entries.length ? `Uploaded: ${entries.join(' • ')}` : 'Uploaded: none';
}

function registerSource(source) {
  activeSources.add(source);
  source.onended = () => activeSources.delete(source);
  return source;
}

function stopAllSounds() {
  for (const source of Array.from(activeSources)) {
    try {
      source.stop(0);
    } catch {
      // no-op
    }
    activeSources.delete(source);
  }
  setStatus('all currently playing sounds stopped');
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
  masterNode = audioContext.createGain();

  const tremoloCarrier = audioContext.createGain();
  tremoloCarrier.gain.value = 1;
  const tremoloDepth = audioContext.createGain();
  const tremoloConstant = audioContext.createConstantSource();
  const tremoloOsc = audioContext.createOscillator();

  tremoloConstant.offset.value = 1;
  tremoloOsc.type = 'sine';

  soundboardBus = audioContext.createGain();

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

  tremoloCarrier.connect(masterNode);
  masterNode.connect(virtualMicDestination);

  monitorNode = audioContext.createGain();
  masterNode.connect(monitorNode);
  monitorNode.connect(audioContext.destination);

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
  applySettingsToGraph();

  initialized = true;
  stopAllButton.disabled = false;
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
  const osc = registerSource(audioContext.createOscillator());
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
  const osc = registerSource(audioContext.createOscillator());
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

  const source = registerSource(audioContext.createBufferSource());
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

function playUploadedBuffer(buffer) {
  const source = registerSource(audioContext.createBufferSource());
  source.buffer = buffer;
  source.connect(soundboardBus);
  source.start();
}

function playSound(name) {
  if (!initialized) {
    return;
  }

  const uploaded = uploadedBuffers[name];
  if (uploaded) {
    playUploadedBuffer(uploaded);
    return;
  }

  if (name === 'airhorn') playAirhorn();
  if (name === 'beep') playBeep();
  if (name === 'applause') playApplause();
}

async function handleUpload(name, file) {
  if (!file) return;

  if (!audioContext) {
    setStatus('enable microphone before uploading soundboard files');
    return;
  }

  try {
    const bufferData = await file.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(bufferData.slice(0));
    uploadedBuffers[name] = decoded;
    uploadedFileNames[name] = file.name;
    updateUploadSummary();
    setStatus(`uploaded sound for ${name}: ${file.name}`);
  } catch {
    setStatus(`failed to decode uploaded file for ${name}`);
  }
}

function hideUpdateBanner() {
  updateBanner.classList.add('hidden');
}

function showUpdateBanner(version) {
  updateVersionText.textContent = version ? `Latest: ${version}` : '';
  updateBanner.classList.remove('hidden');
}

function refreshVersionBadges(current, latest) {
  appVersionLabel.textContent = `Version: ${current}`;
  latestVersionLabel.textContent = `Latest: ${latest || 'unknown'}`;
}

async function fetchVersionMeta() {
  const response = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('version metadata unavailable');
  }
  return response.json();
}

async function checkForUpdates({ manual = false } = {}) {
  try {
    const meta = await fetchVersionMeta();
    const latest = typeof meta?.version === 'string' ? meta.version : null;
    refreshVersionBadges(APP_VERSION, latest);

    if (!latest || latest === APP_VERSION) {
      hideUpdateBanner();
      if (manual) setStatus('no new updates found');
      return;
    }

    if (settings.autoUpdateEnabled) {
      if (!isReloading) {
        isReloading = true;
        setStatus(`new version detected (${latest}), reloading...`);
        setTimeout(() => window.location.reload(), 700);
      }
      return;
    }

    showUpdateBanner(latest);
    if (manual) setStatus(`update available: ${latest}`);
  } catch {
    refreshVersionBadges(APP_VERSION, null);
    if (manual) setStatus('unable to check for updates right now');
  }
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

stopAllButton.addEventListener('click', stopAllSounds);

reloadNowButton.addEventListener('click', () => {
  window.location.reload();
});

checkUpdateButton.addEventListener('click', () => {
  checkForUpdates({ manual: true });
});

presetSelect.addEventListener('change', (event) => {
  applyPreset(event.target.value);
});

soundButtons.forEach((button) => {
  button.addEventListener('click', () => {
    playSound(button.dataset.sound);
  });
});

Object.entries(uploadInputs).forEach(([name, input]) => {
  input.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    handleUpload(name, file);
  });
});

settingsInputs.masterGain.addEventListener('input', (event) => updateSetting('masterGain', event.target.value));
settingsInputs.monitorGain.addEventListener('input', (event) => updateSetting('monitorGain', event.target.value));
settingsInputs.soundboardGain.addEventListener('input', (event) => updateSetting('soundboardGain', event.target.value));
settingsInputs.autoUpdateEnabled.addEventListener('change', (event) => {
  updateSetting('autoUpdateEnabled', event.target.checked);
});

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === '1') playSound('airhorn');
  if (event.key === '2') playSound('beep');
  if (event.key === '3') playSound('applause');
  if (event.key.toLowerCase() === 'x') stopAllSounds();
});

readStoredSettings();
refreshSettingUI();
updateUploadSummary();
refreshVersionBadges(APP_VERSION, null);

checkForUpdates();
setInterval(() => {
  checkForUpdates();
}, updateCheckIntervalMs);

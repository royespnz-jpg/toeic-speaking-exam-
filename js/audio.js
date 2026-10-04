// Sound in and out: the beep, the spoken directions, the microphone and the
// recordings.

let ctx = null;
function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Called from a click, so the browser lets the page make sound later.
export function unlockAudio() {
  audioContext();
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

// The beep before speaking: a short 1 kHz tone, like the test's.
export function beep(seconds = 0.45) {
  const ac = audioContext();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = 1000;
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(0.35, ac.currentTime + 0.02);
  gain.gain.setValueAtTime(0.35, ac.currentTime + seconds - 0.05);
  gain.gain.linearRampToValueAtTime(0, ac.currentTime + seconds);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + seconds);
  return new Promise((r) => setTimeout(r, seconds * 1000 + 150));
}

// ─── spoken directions (the browser's own voice) ────────────────────────────

let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  const en = voices.filter((v) => /^en[-_]US/i.test(v.lang));
  return (
    en.find((v) => /natural|neural|google|samantha|aria|jenny/i.test(v.name)) ||
    en[0] ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}
if ('speechSynthesis' in window) {
  voice = pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', () => (voice = pickVoice()));
}

export const canSpeak = () => 'speechSynthesis' in window;

// Resolves when the text has been read. If the browser has no voice (or never
// says it finished), it resolves after about the time reading would take.
export function speak(text, { rate = 0.95 } = {}) {
  const words = String(text).split(/\s+/).length;
  const expected = (words / (2.6 * rate)) * 1000 + 800;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, expected + 4000);
    if (!canSpeak() || !text) return setTimeout(finish, Math.min(expected, 1500));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = rate;
    if (voice) u.voice = voice;
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
    // Some browsers pause long speech; keep it going.
    const keepAlive = setInterval(() => {
      if (done) return clearInterval(keepAlive);
      if (speechSynthesis.paused) speechSynthesis.resume();
    }, 5000);
  });
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}

// ─── microphone ─────────────────────────────────────────────────────────────

let stream = null;

// Asks once; the same stream is used for every answer, so the browser doesn't
// ask again in the middle of the exam.
export async function openMicrophone() {
  if (stream && stream.getAudioTracks().some((t) => t.readyState === 'live')) return stream;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot record audio. Use Chrome, Edge, Firefox or Safari.');
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    throw new Error(
      err.name === 'NotAllowedError'
        ? 'The microphone is blocked. Allow it in the address bar (the lock or camera icon) and try again.'
        : `The microphone could not start (${err.message}).`,
    );
  }
  return stream;
}

export function closeMicrophone() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

// Calls onLevel(0…1) about 20 times a second while the meter runs.
export function levelMeter(onLevel) {
  if (!stream) return () => {};
  const ac = audioContext();
  const src = ac.createMediaStreamSource(stream);
  const an = ac.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const data = new Uint8Array(an.fftSize);
  let raf = 0;
  let last = 0;
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 50) return;
    last = now;
    an.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    src.disconnect();
  };
}

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
export const recordingType = () => TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';

// Starts recording now; stop() resolves with { blob, seconds }.
export function startRecording() {
  if (!stream) throw new Error('The microphone is not on.');
  const type = recordingType();
  const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : undefined);
  const chunks = [];
  const started = performance.now();
  rec.addEventListener('dataavailable', (e) => e.data.size && chunks.push(e.data));
  rec.start(1000);
  return {
    stop: () =>
      new Promise((resolve) => {
        const seconds = (performance.now() - started) / 1000;
        rec.addEventListener('stop', () => resolve({ blob: new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }), seconds }), { once: true });
        if (rec.state !== 'inactive') rec.stop();
        else resolve({ blob: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), seconds });
      }),
  };
}

// Talks to the teacher's Google Apps Script (google-apps-script/Code.gs).
// A text/plain POST avoids a CORS preflight; the script answers with JSON.

import { SCRIPT_URL } from './config.js';
import { allRecordings, saveRecording } from './store.js';

const URL_RE = /^https:\/\/script\.google\.com\/(?:a\/[^/\s]+\/)?macros\/s\/[\w-]+\/(?:exec|dev)$/;
const KEY = 'exam.script';

export const isScriptUrl = (url) => URL_RE.test(String(url || '').trim());

export function scriptUrl() {
  try {
    const fromLink = new URLSearchParams(location.search).get('s');
    if (isScriptUrl(fromLink)) localStorage.setItem(KEY, fromLink);
    const saved = localStorage.getItem(KEY);
    if (isScriptUrl(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return isScriptUrl(SCRIPT_URL) ? SCRIPT_URL : '';
}

export function saveScriptUrl(url) {
  try {
    if (url) localStorage.setItem(KEY, url.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

async function readJson(res) {
  if (!res.ok) throw new Error(`Google Script error ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('The Google Script did not answer with data. Is it deployed for “Anyone”?');
  }
  if (!data.ok) throw new Error(data.error || 'The Google Script rejected the request.');
  return data;
}

export async function ping(url = scriptUrl()) {
  if (!isScriptUrl(url)) throw new Error('That is not an Apps Script web app URL (it ends in /exec).');
  return readJson(await fetch(url.trim(), { redirect: 'follow' }));
}

export async function post(payload, url = scriptUrl()) {
  if (!isScriptUrl(url)) throw new Error('No Google Script is connected.');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  return readJson(res);
}

// Events the teacher's sheet keeps (start / finish); a failure doesn't stop the exam.
export function report(payload) {
  if (!scriptUrl()) return Promise.resolve(null);
  return post(payload).catch(() => null);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ─── the upload queue ───────────────────────────────────────────────────────
// One recording at a time; a failed one is tried again (2 s, 5 s, 15 s, 30 s…).

const listeners = new Set();
const queue = [];
let busy = false;
const WAITS = [2000, 5000, 15000, 30000];

export const onUpload = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (rec, status, extra = {}) => listeners.forEach((fn) => fn({ key: rec.key, qid: rec.qid, status, ...extra }));

export function enqueue(rec) {
  if (!queue.some((r) => r.key === rec.key)) queue.push(rec);
  emit(rec, 'waiting');
  run();
}

export const pendingUploads = () => queue.length + (busy ? 1 : 0);

async function run() {
  if (busy || !queue.length) return;
  if (!scriptUrl()) {
    queue.forEach((r) => emit(r, 'local'));
    return;
  }
  busy = true;
  const rec = queue.shift();
  let tries = 0;
  for (;;) {
    emit(rec, 'sending');
    try {
      const res = await post({
        type: 'recording',
        attempt: rec.attempt,
        student: rec.student,
        group: rec.group,
        speaker: rec.speaker,
        qid: rec.qid,
        label: rec.label,
        prompt: rec.prompt,
        durationSec: Math.round(rec.seconds * 10) / 10,
        mime: rec.blob.type,
        audio: await blobToBase64(rec.blob),
        recordedAt: rec.recordedAt,
      });
      await saveRecording({ ...rec, uploaded: true, url: res.url || '' });
      emit(rec, 'sent', { url: res.url });
      break;
    } catch (err) {
      emit(rec, 'retrying', { error: err.message });
      await new Promise((r) => setTimeout(r, WAITS[Math.min(tries++, WAITS.length - 1)]));
    }
  }
  busy = false;
  run();
}

// Recordings from an earlier visit that never reached the teacher.
export async function resumeUploads() {
  for (const rec of await allRecordings()) if (!rec.uploaded && rec.blob) enqueue(rec);
}

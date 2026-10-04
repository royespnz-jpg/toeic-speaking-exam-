import { PARTS, RESPONSES, buildTimeline, timedSeconds } from './format.js';
import { clockHtml, runClock, idleClock, fmt } from './clock.js';
import { unlockAudio, beep, speak, stopSpeaking, openMicrophone, closeMicrophone, levelMeter, startRecording } from './audio.js';
import { scriptUrl, saveScriptUrl, isScriptUrl, ping, post, report, enqueue, onUpload, pendingUploads, resumeUploads } from './api.js';
import { saveRecording, allRecordings } from './store.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo') ? 0.1 : 1;
const SESSION = 'exam.session';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let S = null; // the student's exam: { student, speaker, attempt, version, steps, stepIndex, done, leftPage, resumed }

function persist() {
  if (!S) return;
  const { version, steps, ...keep } = S;
  try {
    sessionStorage.setItem(SESSION, JSON.stringify(keep));
  } catch {
    /* storage unavailable */
  }
}

function savedSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION) || 'null');
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION);
  } catch {
    /* storage unavailable */
  }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function loadManifest() {
  try {
    return await (await fetch('exam/manifest.json', { cache: 'no-cache' })).json();
  } catch {
    return { versions: Array.from({ length: 14 }, (_, i) => i + 1) };
  }
}

// A version and its picture. The picture is kept in memory, so it shows even
// if the connection drops during the exam.
async function loadVersion(n) {
  const name = `exam/v${String(n).padStart(2, '0')}`;
  const res = await fetch(`${name}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Speaking ${n} is not in this exam.`);
  const version = await res.json();
  const pic = await fetch(`exam/${version.picture}`);
  if (!pic.ok) throw new Error('The picture for this exam didn’t load. Check the connection and try again.');
  return { ...version, picture: URL.createObjectURL(await pic.blob()) };
}

// ─── 1 · start ──────────────────────────────────────────────────────────────

async function renderStart(error = '') {
  const { versions } = await loadManifest();
  const saved = S || {};
  const pre = Number(params.get('v')) || saved.speaker || '';
  app.innerHTML = `<main class="screen start">
    <section class="start-hero">
      <p class="eyebrow">Speaking Exam${DEMO < 1 ? ' · <b>demo: short clocks</b>' : ''}</p>
      <h1>Speak when the clock says so.</h1>
      <p class="lede">Seven questions in three parts, in the TOEIC® Speaking format. A clock counts down the time to
        prepare; when it reaches zero you hear a beep, your microphone turns on, and it records until the time is up.</p>
      <ol class="parts-overview">
        ${['read', 'picture', 'questions']
          .map((id) => {
            const p = PARTS[id];
            return `<li><span class="po-label">${esc(p.label)}</span><span class="po-title">${esc(p.title)}</span>
              <span class="po-time">${p.prep ? `${p.prep} s to prepare · ` : 'no preparation · '}${p.response >= 60 ? `${p.response / 60} min` : `${p.response} s`} to speak${id === 'questions' ? ' each' : ''}</span></li>`;
          })
          .join('')}
      </ol>
    </section>
    <form class="card start-form" data-start novalidate>
      <h2>Your details</h2>
      <label>Full name<input name="student" required maxlength="80" autocomplete="name" value="${esc(saved.student || '')}"></label>
      <label>Speaker
        <select name="speaker" required>
          <option value="">Choose your speaker…</option>
          ${versions.map((n) => `<option value="${n}"${Number(pre) === n ? ' selected' : ''}>Speaker ${n}</option>`).join('')}
        </select>
      </label>
      <p class="form-error" data-error role="alert">${esc(error)}</p>
      <button class="btn primary big" type="submit">Continue</button>
      <p class="muted small">${scriptUrl() ? 'Your answers go to your teacher’s Google Drive.' : 'This exam is not connected to your teacher’s sheet yet.'}
        · <a href="#teacher">Teacher</a></p>
    </form>
  </main>`;
}

async function submitStart(form) {
  const data = Object.fromEntries(new FormData(form));
  const err = form.querySelector('[data-error]');
  const button = form.querySelector('button');
  if (!data.student.trim() || !data.speaker) {
    err.textContent = 'Write your name and choose your speaker.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Opening the exam…';
  err.textContent = '';
  try {
    const version = await loadVersion(Number(data.speaker));
    S = {
      student: data.student.trim(),
      speaker: Number(data.speaker),
      attempt: newId(),
      version,
      steps: buildTimeline(version, { scale: DEMO }),
      stepIndex: 0,
      done: [],
      leftPage: 0,
      resumed: 0,
    };
    persist();
    renderCheck();
  } catch (e) {
    button.disabled = false;
    button.textContent = 'Continue';
    err.textContent = e.message;
  }
}

// ─── 2 · microphone and sound check ─────────────────────────────────────────

let stopMeter = () => {};

function meterHtml() {
  return `<div class="meter" aria-hidden="true">${'<i></i>'.repeat(14)}</div>`;
}

function showLevel(el, level) {
  const bars = el.querySelectorAll('.meter i');
  const lit = Math.round(level * bars.length);
  bars.forEach((b, i) => b.classList.toggle('on', i < lit));
}

function renderCheck(resuming = false) {
  const total = timedSeconds(S.steps);
  app.innerHTML = `<main class="screen check">
    <header class="check-head">
      <p class="eyebrow">Speaker ${S.speaker} · ${esc(S.student)}</p>
      <h1>${resuming ? 'Continue your exam' : 'Check your microphone and sound'}</h1>
      <p class="lede">${
        resuming
          ? 'Your exam was interrupted. It will continue from the question you were answering.'
          : `About ${Math.round(total / 60) + 3} minutes. Use headphones if you can, in a quiet place.`
      }</p>
    </header>
    <div class="check-grid">
      <section class="card check-step" data-mic-step>
        <span class="step-num">1</span>
        <h2>Microphone</h2>
        <p>Allow the microphone, then say something: the bars should move.</p>
        ${meterHtml()}
        <div class="row"><button type="button" class="btn" data-mic>Allow the microphone</button>
          <button type="button" class="btn ghost" data-test-rec disabled>Record a 3-second test</button></div>
        <p class="status" data-mic-status aria-live="polite"></p>
        <audio data-test-audio controls hidden></audio>
      </section>
      <section class="card check-step">
        <span class="step-num">2</span>
        <h2>Sound</h2>
        <p>You will hear the directions and the questions, and a beep before you speak.</p>
        <div class="row"><button type="button" class="btn" data-sound>Play the beep and a voice</button></div>
        <p class="status" data-sound-status aria-live="polite"></p>
      </section>
      <section class="card check-step rules">
        <span class="step-num">3</span>
        <h2>Once you start</h2>
        <ul>
          <li>The exam runs by itself. You can’t pause it or go back.</li>
          <li>When the clock says <b>Response time</b>, the microphone is recording: speak.</li>
          <li>Stay on this page until the end, when your answers are sent.</li>
        </ul>
      </section>
    </div>
    <div class="check-go">
      <button type="button" class="btn primary big" data-begin disabled>${resuming ? 'Continue the exam' : 'Start the exam'}</button>
      <button type="button" class="btn ghost" data-back>Back</button>
    </div>
  </main>`;
}

async function allowMic(button) {
  const status = app.querySelector('[data-mic-status]');
  button.disabled = true;
  try {
    await openMicrophone();
    unlockAudio();
    stopMeter();
    const card = app.querySelector('[data-mic-step]');
    stopMeter = levelMeter((l) => showLevel(card, l));
    status.textContent = '✓ The microphone is on.';
    status.className = 'status ok';
    button.textContent = 'Microphone on';
    app.querySelector('[data-test-rec]').disabled = false;
    app.querySelector('[data-begin]').disabled = false;
  } catch (e) {
    button.disabled = false;
    status.textContent = e.message;
    status.className = 'status bad';
  }
}

async function testRecording(button) {
  const status = app.querySelector('[data-mic-status]');
  button.disabled = true;
  status.textContent = 'Recording… say a sentence.';
  const rec = startRecording();
  await new Promise((r) => setTimeout(r, 3000));
  const { blob } = await rec.stop();
  const audio = app.querySelector('[data-test-audio]');
  audio.src = URL.createObjectURL(blob);
  audio.hidden = false;
  audio.play().catch(() => {});
  status.textContent = '✓ Listen to your test. If you can’t hear yourself, check the microphone.';
  status.className = 'status ok';
  button.disabled = false;
}

async function testSound(button) {
  unlockAudio();
  button.disabled = true;
  const status = app.querySelector('[data-sound-status]');
  await beep();
  await speak('This is the sound check. If you can hear this voice, your sound is working.');
  status.textContent = '✓ If you heard the beep and the voice, your sound works.';
  status.className = 'status ok';
  button.disabled = false;
}

// ─── 3 · the exam ───────────────────────────────────────────────────────────

let wakeLock = null;
async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    /* not supported */
  }
}

function examShell() {
  app.innerHTML = `<div class="stage">
    <header class="stage-top">
      <div class="brand"><span class="dot"></span>Speaking Exam</div>
      <ol class="progress" aria-label="Questions">
        ${RESPONSES.map((r) => `<li data-q="${r.id}"><span>${esc(r.short)}</span></li>`).join('')}
      </ol>
      <div class="who">Speaker ${S.speaker} · ${esc(S.student)}</div>
    </header>
    <main class="stage-main">
      <section class="task" data-task aria-live="polite"></section>
      <aside class="clock-panel">
        ${clockHtml()}
        <div class="rec" data-rec hidden><span class="rec-dot"></span><b>Recording</b>${meterHtml()}</div>
        <p class="cue" data-cue aria-live="assertive"></p>
      </aside>
    </main>
  </div>`;
  S.done.forEach((id) => app.querySelector(`[data-q="${id}"]`)?.classList.add('done'));
}

function taskHtml(step) {
  const v = S.version;
  if (step.type === 'intro') {
    return `<p class="task-label">Speaker ${S.speaker}</p><h2>Speaking test</h2>
      <p class="directions">${esc(step.say)}</p>`;
  }
  const p = PARTS[step.part];
  const head = `<p class="task-label">${esc(step.question ? `Question ${step.question}` : p.label)}</p><h2>${esc(p.title)}</h2>`;
  const directions = `<p class="directions"><b>Directions:</b> ${esc(p.directions)}</p>`;
  if (step.type === 'part') return head + directions;
  if (step.part === 'read') return `${head}<div class="reading">${esc(v.readAloud).replace(/\n/g, '<br>')}</div>`;
  if (step.part === 'picture') return `${head}<figure class="picture"><img src="${v.picture}" alt="The picture to describe"></figure>`;
  // Questions 4–7: the narrator's context, then each question.
  const narrator = `<p class="narrator"><span>Narrator</span>${esc(v.narrator)}</p>`;
  if (step.narrator) return head + narrator;
  const n = step.question;
  return `${head}${narrator}<p class="question"><span class="q-num">${n}</span>${esc(v.questions[n - 4])}</p>`;
}

function setCue(text, kind = '') {
  const cue = app.querySelector('[data-cue]');
  cue.textContent = text;
  cue.className = `cue ${kind}`;
}

let running = false;

async function runExam() {
  running = true;
  examShell();
  keepAwake();
  const clock = app.querySelector('.clock');
  const recEl = app.querySelector('[data-rec]');
  if (S.stepIndex === 0) report({ type: 'start', attempt: S.attempt, student: S.student, speaker: S.speaker, demo: DEMO < 1, startedAt: new Date().toISOString(), userAgent: navigator.userAgent });

  for (let i = S.stepIndex; i < S.steps.length; i++) {
    S.stepIndex = i;
    persist();
    const step = S.steps[i];
    const task = app.querySelector('[data-task]');
    const html = taskHtml(step);
    if (task.dataset.html !== html) {
      task.innerHTML = html;
      task.dataset.html = html;
    }
    const current = step.id || (step.question ? `q${step.question}` : RESPONSES.find((r) => r.part === step.part)?.id);
    app.querySelectorAll('.progress li').forEach((li) => li.classList.toggle('now', li.dataset.q === current));

    if (step.type === 'intro' || step.type === 'part' || step.type === 'say') {
      idleClock(clock, { phase: step.type === 'say' && step.question ? `Question ${step.question}` : 'Listen', time: '··', sub: 'Directions' });
      setCue(step.question ? 'Listen to the question.' : 'Listen to the directions.');
      await speak(step.say);
    } else if (step.type === 'prep') {
      idleClock(clock, { phase: 'Preparation time', time: fmt(step.seconds) });
      setCue(step.say);
      await speak(step.say);
      setCue('Prepare your answer.', 'prep');
      await runClock(clock, step.seconds, { mode: 'prep', phase: 'Preparation time', sub: 'Prepare' }).done;
    } else if (step.type === 'response') {
      idleClock(clock, { phase: 'Response time', time: fmt(step.seconds) });
      if (step.say) {
        setCue(step.say);
        await speak(step.say);
      }
      await beep();
      const rec = startRecording();
      recEl.hidden = false;
      const stop = levelMeter((l) => showLevel(recEl, l));
      setCue('Speak now: the microphone is recording.', 'live');
      await runClock(clock, step.seconds, { mode: 'response', phase: 'Response time', sub: 'Recording' }).done;
      const { blob, seconds } = await rec.stop();
      stop();
      recEl.hidden = true;
      setCue('Time is up.', 'done');
      const meta = RESPONSES.find((r) => r.id === step.id);
      const saved = {
        key: `${S.attempt}:${step.id}`,
        attempt: S.attempt,
        student: S.student,
        speaker: S.speaker,
        qid: step.id,
        label: meta.label,
        prompt: step.prompt,
        seconds,
        blob,
        recordedAt: new Date().toISOString(),
        uploaded: false,
      };
      await saveRecording(saved);
      enqueue(saved);
      if (!S.done.includes(step.id)) S.done.push(step.id);
      app.querySelector(`[data-q="${step.id}"]`)?.classList.add('done');
      persist();
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  running = false;
  S.stepIndex = S.steps.length;
  S.finished = true;
  persist();
  closeMicrophone();
  stopSpeaking();
  wakeLock?.release?.().catch(() => {});
  report({ type: 'finish', attempt: S.attempt, student: S.student, speaker: S.speaker, responses: S.done.length, leftPage: S.leftPage, resumed: S.resumed, finishedAt: new Date().toISOString() });
  renderDone();
}

// After a reload: start again from the question that was interrupted.
function resumeIndex(steps, done) {
  let last = -1;
  steps.forEach((s, i) => s.type === 'response' && done.includes(s.id) && (last = i));
  return last + 1;
}

// ─── 4 · the end ────────────────────────────────────────────────────────────

const STATUS = {
  waiting: 'Waiting…',
  sending: 'Sending…',
  retrying: 'Trying again…',
  sent: '✓ Sent',
  local: 'Saved on this device',
};

async function renderDone() {
  const recs = (await allRecordings()).filter((r) => r.attempt === S.attempt);
  const connected = Boolean(scriptUrl());
  app.innerHTML = `<main class="screen done">
    <p class="eyebrow">Speaker ${S.speaker} · ${esc(S.student)}</p>
    <h1 data-done-title>${connected ? 'Sending your answers…' : 'The exam is over'}</h1>
    <p class="lede" data-done-lede>${
      connected
        ? 'Keep this page open until every answer says “Sent”.'
        : 'This exam isn’t connected to your teacher’s sheet. Download your answers and send them to your teacher.'
    }</p>
    <ol class="card uploads">
      ${RESPONSES.map((r) => {
        const rec = recs.find((x) => x.qid === r.id);
        const status = !rec ? 'missing' : rec.uploaded ? 'sent' : connected ? 'waiting' : 'local';
        return `<li data-up="${r.id}" data-status="${status}">
          <span class="up-label">${esc(r.label)}</span>
          <span class="up-time">${rec ? fmt(Math.round(rec.seconds)) : '—'}</span>
          <span class="up-status">${status === 'missing' ? 'Not recorded' : STATUS[status]}</span>
          ${rec ? `<a class="btn ghost small" download="Speaker ${S.speaker} - ${esc(S.student)} - ${esc(r.label)}.${/mp4/.test(rec.blob.type) ? 'm4a' : 'webm'}" href="${URL.createObjectURL(rec.blob)}">Download</a>` : ''}
        </li>`;
      }).join('')}
    </ol>
  </main>`;
  updateDone();
}

function updateDone() {
  if (!S?.finished) return;
  const title = app.querySelector('[data-done-title]');
  if (!title || !scriptUrl()) return;
  const rows = [...app.querySelectorAll('[data-up]')];
  const recorded = rows.filter((r) => r.dataset.status !== 'missing');
  if (recorded.length && recorded.every((r) => r.dataset.status === 'sent') && !pendingUploads()) {
    title.textContent = '✓ Your answers were sent';
    app.querySelector('[data-done-lede]').textContent = 'Your teacher has your recordings. You can close this page.';
    clearSession();
  }
}

onUpload(({ qid, key, status, error }) => {
  if (S && !key.startsWith(`${S.attempt}:`)) return;
  const row = app.querySelector(`[data-up="${qid}"]`);
  if (!row) return;
  row.dataset.status = status;
  row.querySelector('.up-status').textContent = STATUS[status] || status;
  if (error) row.querySelector('.up-status').title = error;
  updateDone();
});

// ─── teacher ────────────────────────────────────────────────────────────────

async function renderTeacher(message = '') {
  const url = scriptUrl();
  const { versions } = await loadManifest();
  const base = `${location.origin}${location.pathname}`;
  const link = (extra = '') => `${base}?${url ? `s=${encodeURIComponent(url)}&` : ''}${extra}`.replace(/[?&]$/, '');
  app.innerHTML = `<main class="screen teacher">
    <p class="eyebrow">Teacher</p>
    <h1>Set up the exam</h1>
    <form class="card" data-teacher>
      <h2>1 · Your Google Script</h2>
      <p>Paste the web app URL of the exam’s Google Apps Script (it ends in <code>/exec</code>). Recordings go to your Drive and
        a row for each one to your sheet.</p>
      <div class="row"><input name="url" value="${esc(url)}" placeholder="https://script.google.com/macros/s/…/exec" spellcheck="false">
        <button class="btn" type="button" data-test-script>Test</button><button class="btn primary" type="submit">Save</button></div>
      <p class="status" data-teacher-status aria-live="polite">${esc(message)}</p>
    </form>
    <section class="card">
      <h2>2 · Links for your students</h2>
      <p>Every link carries your script, so the answers go to your sheet. Give each student their speaker number, or send the
        link that already has it.</p>
      <div class="link-row"><code>${esc(link())}</code><button class="btn small" data-copy="${esc(link())}">Copy</button></div>
      <details><summary>A link for each speaker</summary>
        <ul class="speaker-links">${versions
          .map((n) => `<li><span>Speaker ${n}</span><code>${esc(link(`v=${n}`))}</code><button class="btn small" data-copy="${esc(link(`v=${n}`))}">Copy</button></li>`)
          .join('')}</ul>
      </details>
    </section>
    <section class="card">
      <h2>3 · Try it</h2>
      <p>Students write their name, choose their speaker and start: there is no exam code. Try the whole exam with short
        clocks; your answers go to your sheet like a student’s.</p>
      <p><a class="btn ghost" href="${esc(link('demo=1'))}">Try the exam with short clocks</a></p>
    </section>
  </main>`;
}

// ─── events ─────────────────────────────────────────────────────────────────

document.addEventListener('submit', (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.matches('[data-start]')) submitStart(form);
  if (form.matches('[data-teacher]')) {
    const url = String(new FormData(form).get('url') || '').trim();
    if (url && !isScriptUrl(url)) return renderTeacher('That is not an Apps Script web app URL (it ends in /exec).');
    saveScriptUrl(url);
    renderTeacher(url ? '✓ Saved. The links below now send the answers to your sheet.' : 'Removed.');
  }
});

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.matches('[data-mic]')) allowMic(t);
  else if (t.matches('[data-test-rec]')) testRecording(t);
  else if (t.matches('[data-sound]')) testSound(t);
  else if (t.matches('[data-back]')) {
    stopMeter();
    closeMicrophone();
    renderStart();
  } else if (t.matches('[data-begin]')) {
    stopMeter();
    unlockAudio();
    runExam();
  } else if (t.matches('[data-copy]')) {
    try {
      await navigator.clipboard.writeText(t.dataset.copy);
      t.textContent = 'Copied';
    } catch {
      t.textContent = 'Select and copy';
    }
  } else if (t.matches('[data-test-script]')) {
    const status = app.querySelector('[data-teacher-status]');
    const url = app.querySelector('[name="url"]').value.trim();
    status.textContent = 'Testing…';
    try {
      const info = await ping(url);
      status.textContent = `✓ Connected to “${info.sheet}”. Press Save.`;
    } catch (err) {
      status.textContent = `Couldn’t connect: ${err.message}`;
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!running) return;
  if (document.hidden) {
    S.leftPage++;
    persist();
  } else keepAwake();
});

window.addEventListener('beforeunload', (e) => {
  if (running || (S?.finished && pendingUploads())) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ─── start ──────────────────────────────────────────────────────────────────

async function start() {
  resumeUploads();
  if (location.hash === '#teacher') return renderTeacher();
  const saved = savedSession();
  if (saved && !saved.finished) {
    try {
      const version = await loadVersion(saved.speaker);
      S = { ...saved, version, steps: buildTimeline(version, { scale: DEMO }) };
      S.stepIndex = resumeIndex(S.steps, S.done);
      S.resumed = (S.resumed || 0) + 1;
      persist();
      return renderCheck(true);
    } catch {
      clearSession();
    }
  }
  if (saved?.finished) {
    try {
      const version = await loadVersion(saved.speaker);
      S = { ...saved, version, steps: buildTimeline(version, { scale: DEMO }) };
      return renderDone();
    } catch {
      clearSession();
    }
  }
  renderStart();
}

window.addEventListener('hashchange', () => !running && start());
start();

// ── Speaking Exam · Google Apps Script ──
//
// Recibe las grabaciones del examen y las guarda en tu Google Drive, con una
// fila por respuesta en esta planilla para que pongas la nota.
//
// Instalación (una vez):
//   1. Creá una planilla nueva (sheets.new) → Extensiones → Apps Script.
//   2. Borrá lo que haya, pegá todo este archivo y guardá.
//   3. Elegí la función «setup» → ▶ Ejecutar → aceptá los permisos.
//   4. Implementar → Nueva implementación → Aplicación web · Ejecutar como: Yo ·
//      Quién tiene acceso: Cualquier persona → copiá la URL que termina en /exec.
//   5. En el examen, página Teacher (…/#teacher): pegá la URL y guardá.
// Si cambiás este código: Implementar → Administrar implementaciones → ✏ → Nueva versión.

const APP = 'Speaking Exam';
const VERSION = 1;
const ROOT_FOLDER = 'Speaking Exam — Recordings';
const QUESTIONS = ['q1-2', 'q3', 'q4', 'q5', 'q6', 'q7'];
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const SHEETS = {
  exams: {
    name: 'Exams',
    headers: ['Started', 'Student', 'Group', 'Speaker', 'Status', 'Answers', 'Finished', 'Left the page', 'Restarts', 'Total score', 'Folder', 'Attempt'],
  },
  responses: {
    name: 'Responses',
    headers: ['Recorded', 'Student', 'Group', 'Speaker', 'Question', 'Prompt', 'Seconds', 'Recording', 'Score (0–3)', 'Comments', 'Attempt'],
  },
  rubric: { name: 'Rubric', headers: ['Score', 'Questions 1–2 · Read a text aloud', 'Question 3 · Describe a picture', 'Questions 4–7 · Respond to questions'] },
};
const EX = { attempt: 12, status: 5, answers: 6, finished: 7, left: 8, restarts: 9, total: 10, folder: 11 };
const RE = { attempt: 11 };

const RUBRIC = [
  ['3', 'Clear and easy to understand; pronunciation, pausing, stress and intonation are natural; at most a few small slips.', 'Describes the main features of the picture with good vocabulary and grammar; easy to follow; well linked.', 'Answers the question fully and clearly, with reasons or details; good range of vocabulary and grammar; easy to follow.'],
  ['2', 'Mostly clear, with some problems in pronunciation, stress or intonation that make parts harder to follow.', 'Describes the picture, but with limited vocabulary, some grammar errors or hesitation; meaning mostly clear.', 'Answers the question, but with limited development, some errors or hesitation; some parts are hard to follow.'],
  ['1', 'Often hard to understand; many pronunciation, stress or intonation problems.', 'Very limited description; frequent errors or long pauses; much of it is hard to understand.', 'Little relevant content; frequent errors or long pauses; hard to understand.'],
  ['0', 'No answer, or the answer is not connected to the text.', 'No answer, or the answer is not connected to the picture.', 'No answer, or the answer is not connected to the question.'],
];

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach((k) => sheet_(k));
  const rubric = sheet_('rubric');
  if (rubric.getLastRow() < 2) rubric.getRange(2, 1, RUBRIC.length, RUBRIC[0].length).setValues(RUBRIC);
  rootFolder_();
  const msg = 'Listo: hojas Exams, Responses y Rubric, y la carpeta «' + ROOT_FOLDER + '» en tu Drive. Ahora implementá la aplicación web.';
  Logger.log(msg);
  return msg;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu(APP).addItem('Configurar (setup)', 'setup').addToUi();
}

function doGet() {
  return json_({ ok: true, app: APP, sheet: SpreadsheetApp.getActiveSpreadsheet().getName(), version: VERSION });
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.type === 'start') return json_(withLock_(() => start_(data)));
    if (data.type === 'recording') return json_(recording_(data));
    if (data.type === 'finish') return json_(withLock_(() => finish_(data)));
    throw new Error('Pedido desconocido.');
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

// ─── requests ───────────────────────────────────────────────────────────────

function start_(d) {
  const who = person_(d);
  const sheet = sheet_('exams');
  const row = findRow_(sheet, EX.attempt, who.attempt);
  if (row) return { ok: true, duplicate: true };
  const folder = studentFolder_(who);
  sheet.appendRow([
    date_(d.startedAt),
    text_(who.student),
    text_(who.group),
    who.speaker,
    d.demo ? 'demo' : 'started',
    0,
    '',
    '',
    '',
    '',
    folder.getUrl(),
    who.attempt,
  ]);
  const last = sheet.getLastRow();
  sheet.getRange(last, EX.total).setFormula('=IF(COUNTIFS(Responses!K:K,L' + last + ',Responses!I:I,"<>")=0,"",SUMIFS(Responses!I:I,Responses!K:K,L' + last + '))');
  return { ok: true };
}

function recording_(d) {
  const who = person_(d);
  if (QUESTIONS.indexOf(d.qid) < 0) throw new Error('Pregunta desconocida.');
  if (!/^audio\//.test(String(d.mime || '').split(';')[0])) throw new Error('Eso no es un audio.');
  if (!d.audio) throw new Error('No llegó el audio.');
  const bytes = Utilities.base64Decode(d.audio);
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error('La grabación es demasiado grande.');

  // A second try of the same answer (the first one did arrive) gets the same file back.
  const sheet = sheet_('responses');
  const existing = findResponse_(sheet, who.attempt, d.qid);
  if (existing) return { ok: true, duplicate: true, url: existing };

  const ext = /mp4|m4a|aac/.test(d.mime) ? 'm4a' : /ogg/.test(d.mime) ? 'ogg' : 'webm';
  const label = String(d.label || d.qid).slice(0, 40);
  const blob = Utilities.newBlob(bytes, String(d.mime).split(';')[0], label + '.' + ext);
  const file = studentFolder_(who).createFile(blob);
  file.setDescription(String(d.prompt || '').slice(0, 1000));
  const url = file.getUrl();

  withLock_(() => {
    if (findResponse_(sheet, who.attempt, d.qid)) return;
    sheet.appendRow([
      date_(d.recordedAt),
      text_(who.student),
      text_(who.group),
      who.speaker,
      label,
      text_(String(d.prompt || '').slice(0, 500)),
      Math.round(Number(d.durationSec) || 0),
      '',
      '',
      '',
      who.attempt,
    ]);
    sheet.getRange(sheet.getLastRow(), 8).setFormula('=HYPERLINK("' + url + '","▶ Listen")');
    const exams = sheet_('exams');
    const row = findRow_(exams, EX.attempt, who.attempt);
    if (row) exams.getRange(row, EX.answers).setValue(countResponses_(sheet, who.attempt));
  });
  return { ok: true, url: url, id: file.getId() };
}

function finish_(d) {
  const who = person_(d);
  const sheet = sheet_('exams');
  let row = findRow_(sheet, EX.attempt, who.attempt);
  if (!row) {
    start_(d);
    row = sheet.getLastRow();
  }
  sheet.getRange(row, EX.status).setValue('finished');
  sheet.getRange(row, EX.answers).setValue(countResponses_(sheet_('responses'), who.attempt));
  sheet.getRange(row, EX.finished).setValue(date_(d.finishedAt));
  sheet.getRange(row, EX.left).setValue(Number(d.leftPage) || 0);
  sheet.getRange(row, EX.restarts).setValue(Number(d.resumed) || 0);
  return { ok: true };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function person_(d) {
  const attempt = String(d.attempt || '');
  if (!/^[\w-]{6,40}$/.test(attempt)) throw new Error('Intento inválido.');
  const student = String(d.student || '').trim().slice(0, 80);
  if (!student) throw new Error('Falta el nombre.');
  const speaker = Number(d.speaker);
  if (!(speaker >= 1 && speaker <= 99)) throw new Error('Número de speaker inválido.');
  return { attempt: attempt, student: student, group: String(d.group || '').trim().slice(0, 40), speaker: speaker };
}

function sheet_(key) {
  const def = SHEETS[key];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(def.name);
  if (!sheet) {
    sheet = ss.insertSheet(def.name);
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRow_(sheet, col, value) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const values = sheet.getRange(2, col, last - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) if (String(values[i][0]) === value) return i + 2;
  return 0;
}

// The recording link of an answer already saved, or ''.
function findResponse_(sheet, attempt, qid) {
  const last = sheet.getLastRow();
  if (last < 2) return '';
  const label = { 'q1-2': 'Questions 1–2', q3: 'Question 3', q4: 'Question 4', q5: 'Question 5', q6: 'Question 6', q7: 'Question 7' }[qid];
  const rows = sheet.getRange(2, 1, last - 1, SHEETS.responses.headers.length).getValues();
  const formulas = sheet.getRange(2, 8, last - 1, 1).getFormulas();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][RE.attempt - 1]) === attempt && String(rows[i][4]) === label) {
      const m = String(formulas[i][0]).match(/HYPERLINK\("([^"]+)"/);
      return m ? m[1] : 'saved';
    }
  }
  return '';
}

function countResponses_(sheet, attempt) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  return sheet
    .getRange(2, RE.attempt, last - 1, 1)
    .getValues()
    .filter((r) => String(r[0]) === attempt).length;
}

function rootFolder_() {
  const it = DriveApp.getFoldersByName(ROOT_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER);
}

function childFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// Speaking Exam — Recordings / <group> / <student> · Speaker N · <attempt>
function studentFolder_(who) {
  const group = childFolder_(rootFolder_(), who.group || 'No group');
  return childFolder_(group, who.student.replace(/[\\/:*?"<>|]/g, '-') + ' · Speaker ' + who.speaker + ' · ' + who.attempt.slice(-6));
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Text that looks like a formula is kept as text.
function text_(s) {
  s = String(s || '');
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function date_(iso) {
  const d = new Date(iso);
  return isNaN(d) ? new Date() : d;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
// ── fin del archivo ──

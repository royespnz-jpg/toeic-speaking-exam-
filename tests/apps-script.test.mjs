import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readdirSync } from 'node:fs';
import { splitCode, stripMarkers, MAX_LINES, CUT } from '../scripts/split-gs.mjs';

// A small stand-in for the Google services the script uses.
// The script as one file, or as the short parts (google-apps-script/partes/).
const CODE = readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8');
const PART_DIR = new URL('../google-apps-script/partes/', import.meta.url);
const PARTS = readdirSync(PART_DIR)
  .filter((f) => f.endsWith('.gs'))
  .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))
  .map((f) => readFileSync(new URL(f, PART_DIR), 'utf8'));

function makeEnv({ parts = false } = {}) {
  const sheets = new Map();
  const makeSheet = (name) => {
    const data = [];
    const formulas = new Map(); // "r,c" → formula
    const sheet = {
      name,
      data,
      formulas,
      getLastRow: () => data.length,
      appendRow: (row) => data.push([...row]),
      setFrozenRows: () => {},
      getRange: (r, c, nr = 1, nc = 1) => ({
        setValues: (vals) => {
          vals.forEach((row, i) => row.forEach((v, j) => ((data[r - 1 + i] ??= [])[c - 1 + j] = v)));
          return { setFontWeight: () => {} };
        },
        setValue: (v) => ((data[r - 1] ??= [])[c - 1] = v),
        setFormula: (f) => formulas.set(`${r},${c}`, f),
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => data[r - 1 + i]?.[c - 1 + j] ?? '')),
        getFormulas: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => formulas.get(`${r + i},${c + j}`) ?? '')),
        setFontWeight: () => {},
      }),
    };
    return sheet;
  };
  const folders = new Map();
  const files = [];
  const makeFolder = (path) => {
    if (folders.has(path)) return folders.get(path);
    const f = {
      path,
      getUrl: () => `https://drive/${encodeURIComponent(path)}`,
      getFoldersByName: (name) => iter(folders.has(`${path}/${name}`) ? [folders.get(`${path}/${name}`)] : []),
      createFolder: (name) => makeFolder(`${path}/${name}`),
      createFile: (blob) => {
        const n = files.length;
        const file = { blob, folder: path, getUrl: () => `https://drive/file/${n}`, getId: () => `id${n}`, setDescription: (d) => (file.description = d) };
        files.push(file);
        return file;
      },
    };
    folders.set(path, f);
    return f;
  };
  const iter = (items) => {
    let i = 0;
    return { hasNext: () => i < items.length, next: () => items[i++] };
  };
  const menu = [];
  const ui = { createMenu: () => ({ addItem(label) { menu.push(label); return this; }, addToUi() {} }) };
  const ctx = {
    console,
    Logger: { log: () => {} },
    SpreadsheetApp: {
      getUi: () => ui,
      getActiveSpreadsheet: () => ({
        getName: () => 'Speaking 2026',
        getSheetByName: (n) => sheets.get(n) || null,
        insertSheet: (n) => {
          const s = makeSheet(n);
          sheets.set(n, s);
          return s;
        },
      }),
    },
    DriveApp: {
      getFoldersByName: (name) => iter(folders.has(name) ? [folders.get(name)] : []),
      createFolder: (name) => makeFolder(name),
    },
    Utilities: {
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (body) => ({ body, setMimeType() { return this; } }),
    },
  };
  vm.createContext(ctx);
  for (const src of parts ? PARTS : [CODE]) vm.runInContext(src, ctx);
  const post = (payload) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(payload) } }).body);
  return { ctx, post, sheets, files, folders, menu };
}

const who = { attempt: 'mg1abc-x7y8z9', student: 'Ana Pérez', group: '3B', speaker: 4 };
const audio = Buffer.from('fake webm').toString('base64');

test('setup makes the sheets, the rubric and the Drive folder', () => {
  const { ctx, sheets, folders } = makeEnv();
  assert.match(ctx.setup(), /Listo/);
  assert.deepEqual([...sheets.keys()], ['Exams', 'Responses', 'Rubric']);
  assert.equal(sheets.get('Rubric').data.length, 5);
  assert.ok(folders.has('Speaking Exam — Recordings'));
  assert.deepEqual(JSON.parse(ctx.doGet().body), { ok: true, app: 'Speaking Exam', sheet: 'Speaking 2026', version: 1 });
});

test('an exam: start, six recordings in the student’s folder, finish', () => {
  const { post, sheets, files } = makeEnv();
  assert.equal(post({ type: 'start', ...who, startedAt: '2026-10-04T15:00:00Z' }).ok, true);
  assert.equal(post({ type: 'start', ...who }).duplicate, true);
  for (const [qid, label] of [['q1-2', 'Questions 1–2'], ['q3', 'Question 3'], ['q4', 'Question 4'], ['q5', 'Question 5'], ['q6', 'Question 6'], ['q7', 'Question 7']]) {
    const res = post({ type: 'recording', ...who, qid, label, prompt: `${label}?`, durationSec: 59.6, mime: 'audio/webm;codecs=opus', audio, recordedAt: '2026-10-04T15:05:00Z' });
    assert.equal(res.ok, true, res.error);
    assert.match(res.url, /^https:\/\/drive\/file\//);
  }
  // The same answer sent twice (the first reply got lost) is saved once.
  const again = post({ type: 'recording', ...who, qid: 'q4', label: 'Question 4', mime: 'audio/webm', audio });
  assert.equal(again.duplicate, true);
  assert.equal(files.length, 6);
  assert.equal(files[0].folder, 'Speaking Exam — Recordings/3B/Ana Pérez · Speaker 4 · x7y8z9');
  assert.equal(files[0].blob.name, 'Questions 1–2.webm');
  const responses = sheets.get('Responses');
  assert.equal(responses.data.length, 7);
  assert.deepEqual(responses.data[1].slice(1, 7), ['Ana Pérez', '3B', 4, 'Questions 1–2', 'Questions 1–2?', 60]);
  assert.match(responses.formulas.get('2,8'), /^=HYPERLINK\("https:\/\/drive\/file\/0","▶ Listen"\)$/);

  assert.equal(post({ type: 'finish', ...who, leftPage: 1, resumed: 0, finishedAt: '2026-10-04T15:12:00Z' }).ok, true);
  const exam = sheets.get('Exams').data[1];
  assert.deepEqual([exam[1], exam[3], exam[4], exam[5], exam[7], exam[8]], ['Ana Pérez', 4, 'finished', 6, 1, 0]);
  assert.match(sheets.get('Exams').formulas.get('2,10'), /SUMIFS\(Responses!I:I,Responses!K:K,L2\)/);
});

test('bad requests are refused with a message', () => {
  const { post } = makeEnv();
  assert.match(post({ type: 'recording', ...who, qid: 'q9', mime: 'audio/webm', audio }).error, /Pregunta desconocida/);
  assert.match(post({ type: 'recording', ...who, qid: 'q3', mime: 'text/html', audio }).error, /no es un audio/);
  assert.match(post({ type: 'recording', ...who, attempt: '../x', qid: 'q3', mime: 'audio/webm', audio }).error, /Intento inválido/);
  assert.match(post({ type: 'start', ...who, student: ' ' }).error, /Falta el nombre/);
  assert.match(post({ type: 'nope' }).error, /Pedido desconocido/);
  // A name that looks like a formula stays text.
  const { post: post2, sheets } = makeEnv();
  post2({ type: 'start', ...who, student: '=IMPORTXML("x")' });
  assert.equal(sheets.get('Exams').data[1][1], '\'=IMPORTXML("x")');
});

test('the short parts are up to date, complete on their own, and work like Code.gs', () => {
  assert.deepEqual(PARTS.map(stripMarkers), splitCode(CODE), 'run: node scripts/split-gs.mjs');
  assert.equal(PARTS.map(stripMarkers).join(`\n\n${CUT}\n\n`), CODE.replace(/\n+$/, ''));
  for (const [i, part] of PARTS.entries()) {
    assert.doesNotThrow(() => new vm.Script(part), `parte ${i + 1} must be valid code on its own`);
    assert.ok(part.split('\n').length <= MAX_LINES + 10, `parte ${i + 1} is too long`);
    assert.match(part, new RegExp(`fin de la parte ${i + 1} de ${PARTS.length}`));
  }
  const { post, ctx } = makeEnv({ parts: true });
  assert.match(ctx.setup(), /Listo/);
  assert.equal(post({ type: 'start', ...who }).ok, true);
  assert.equal(post({ type: 'recording', ...who, qid: 'q3', label: 'Question 3', mime: 'audio/webm', audio }).ok, true);
});

test('a student with only a name and a speaker (the exam asks for nothing else)', () => {
  const { ctx, post, files, menu } = makeEnv({ parts: true });
  const student = { attempt: 'mg2abc-k3l4m5', student: 'Luis Gómez', speaker: 11 };
  assert.equal(post({ type: 'start', ...student }).ok, true);
  assert.equal(post({ type: 'recording', ...student, qid: 'q1-2', label: 'Questions 1–2', mime: 'audio/webm', audio }).ok, true);
  assert.equal(post({ type: 'finish', ...student, leftPage: 0, resumed: 0 }).ok, true);
  assert.equal(files[0].folder, 'Speaking Exam — Recordings/No group/Luis Gómez · Speaker 11 · k3l4m5');
  ctx.onOpen();
  assert.deepEqual(menu, ['Configurar (setup)']);
});

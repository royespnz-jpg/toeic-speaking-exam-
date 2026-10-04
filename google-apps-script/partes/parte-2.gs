/* ── Speaking Exam · parte 2 de 5 ── */

const RUBRIC = [
  [
    '3',
    'Clear and easy to understand; pronunciation, pausing, stress and ' +
      'intonation are natural; at most a few small slips.',
    'Describes the main features of the picture with good vocabulary and ' +
      'grammar; easy to follow; well linked.',
    'Answers the question fully and clearly, with reasons or details; good ' +
      'range of vocabulary and grammar; easy to follow.',
  ],
  [
    '2',
    'Mostly clear, with some problems in pronunciation, stress or ' +
      'intonation that make parts harder to follow.',
    'Describes the picture, but with limited vocabulary, some grammar ' +
      'errors or hesitation; meaning mostly clear.',
    'Answers the question, but with limited development, some errors or ' +
      'hesitation; some parts are hard to follow.',
  ],
  [
    '1',
    'Often hard to understand; many pronunciation, stress or intonation problems.',
    'Very limited description; frequent errors or long pauses; much of it ' +
      'is hard to understand.',
    'Little relevant content; frequent errors or long pauses; hard to understand.',
  ],
  [
    '0',
    'No answer, or the answer is not connected to the text.',
    'No answer, or the answer is not connected to the picture.',
    'No answer, or the answer is not connected to the question.',
  ],
];

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach((k) => sheet_(k));
  const rubric = sheet_('rubric');
  if (rubric.getLastRow() < 2) {
    rubric.getRange(2, 1, RUBRIC.length, RUBRIC[0].length).setValues(RUBRIC);
  }
  rootFolder_();
  const msg = 'Listo: hojas Exams, Responses y Rubric, y la carpeta «' + ROOT_FOLDER +
    '» en tu Drive. Ahora implementá la aplicación web.';
  Logger.log(msg);
  return msg;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu(APP).addItem('Configurar (setup)', 'setup').addToUi();
}

function doGet() {
  const name = SpreadsheetApp.getActiveSpreadsheet().getName();
  return json_({ ok: true, app: APP, sheet: name, version: VERSION });
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

/* ─── requests ─── */

/* ── fin de la parte 2 de 5 ── */

/* ── Speaking Exam · parte 6 de 6 ── */

/* ─── the exam key ─── */

/*
 * The exam files on the website are encrypted. Their key lives only here, in
 * this script's properties, never on the website: the page asks for it when a
 * student starts, and gets it only while the exam is open.
 */
function key_() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('EXAM_CODE');
  if (!key) {
    throw new Error('The exam is not ready yet: your teacher has to save its code.');
  }
  if (props.getProperty('EXAM_OPEN') === 'no') {
    throw new Error('The exam is closed. Wait for your teacher to open it.');
  }
  return { ok: true, key: key };
}

/* Menu Speaking Exam → Guardar el código del examen (once). */
function guardarCodigo() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Código del examen', 'Pegá el código del examen (SPK-…):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const code = res.getResponseText().trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,40}$/.test(code)) {
    ui.alert('Ese código no parece correcto. Copialo tal cual (SPK-…).');
    return;
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty('EXAM_CODE', code);
  props.setProperty('EXAM_OPEN', 'yes');
  ui.alert('Listo: el examen está abierto. Los estudiantes solo escriben su nombre y eligen su speaker.');
}

function abrirExamen() {
  PropertiesService.getScriptProperties().setProperty('EXAM_OPEN', 'yes');
  SpreadsheetApp.getUi().alert('El examen está abierto.');
}

function cerrarExamen() {
  PropertiesService.getScriptProperties().setProperty('EXAM_OPEN', 'no');
  SpreadsheetApp.getUi().alert('El examen está cerrado: nadie puede empezarlo hasta que lo abras.');
}
/* ── fin del archivo ── */

/* ── fin de la parte 6 de 6 ── */

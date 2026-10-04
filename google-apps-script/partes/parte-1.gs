/* ── Speaking Exam · parte 1 de 5 ── */

/*
 * ── Speaking Exam · Google Apps Script ──
 *
 * Recibe las grabaciones del examen y las guarda en tu Google Drive, con una
 * fila por respuesta en esta planilla para que pongas la nota.
 *
 * Instalación (una vez):
 *   1. Creá una planilla nueva (sheets.new) → Extensiones → Apps Script.
 *   2. Borrá lo que haya, pegá todo este archivo y guardá.
 *   3. Elegí la función «setup» → ▶ Ejecutar → aceptá los permisos.
 *   4. Implementar → Nueva implementación → Aplicación web · Ejecutar como: Yo ·
 *      Quién tiene acceso: Cualquier persona → copiá la URL que termina en /exec.
 *   5. En el examen, página Teacher (…/#teacher): pegá la URL y guardá.
 * Si cambiás este código: Implementar → Administrar implementaciones → ✏ →
 * Nueva versión.
 */

const APP = 'Speaking Exam';
const VERSION = 1;
const ROOT_FOLDER = 'Speaking Exam — Recordings';
const QUESTIONS = ['q1-2', 'q3', 'q4', 'q5', 'q6', 'q7'];
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const SHEETS = {
  exams: {
    name: 'Exams',
    headers: [
      'Started', 'Student', 'Group', 'Speaker', 'Status', 'Answers',
      'Finished', 'Left the page', 'Restarts', 'Total score', 'Folder', 'Attempt',
    ],
  },
  responses: {
    name: 'Responses',
    headers: [
      'Recorded', 'Student', 'Group', 'Speaker', 'Question', 'Prompt',
      'Seconds', 'Recording', 'Score (0–3)', 'Comments', 'Attempt',
    ],
  },
  rubric: {
    name: 'Rubric',
    headers: [
      'Score', 'Questions 1–2 · Read a text aloud',
      'Question 3 · Describe a picture', 'Questions 4–7 · Respond to questions',
    ],
  },
};
const EX = { attempt: 12, status: 5, answers: 6, finished: 7, left: 8, restarts: 9, total: 10, folder: 11 };
const RE = { attempt: 11 };

/* ── fin de la parte 1 de 5 ── */

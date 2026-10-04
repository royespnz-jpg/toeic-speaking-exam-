#!/usr/bin/env node
// Splits google-apps-script/Code.gs into short files (google-apps-script/partes/)
// for editors that don't let you paste the whole script at once. Apps Script
// shares one global scope across the files of a project, so the parts work
// exactly like Code.gs.
//
//   node scripts/split-gs.mjs      (run after editing Code.gs; npm test checks it)

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'google-apps-script', 'Code.gs');
const OUT = join(ROOT, 'google-apps-script', 'partes');
export const MAX_LINES = 75;

// A part may start where a top-level declaration or comment follows a blank
// line, so every part is complete code on its own.
export function splitCode(code, maxLines = MAX_LINES) {
  const lines = code.replace(/\n+$/, '').split('\n');
  const isBoundary = (i) => i > 0 && lines[i - 1] === '' && /^(function |const |\/\*)/.test(lines[i]);
  const parts = [];
  let start = 0;
  let lastBoundary = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!isBoundary(i)) continue;
    if (i - start > maxLines && lastBoundary > start) {
      parts.push(lines.slice(start, lastBoundary).join('\n'));
      start = lastBoundary;
    }
    lastBoundary = i;
  }
  if (lines.length - start > maxLines && lastBoundary > start) {
    parts.push(lines.slice(start, lastBoundary).join('\n'));
    start = lastBoundary;
  }
  parts.push(lines.slice(start).join('\n'));
  return parts.map((p) => p.replace(/\n+$/, ''));
}

// The first and last lines let you check that nothing was cut off when pasting.
export function withMarkers(part, n, total) {
  return `/* ── Speaking Exam · parte ${n} de ${total} ── */\n\n${part}\n\n/* ── fin de la parte ${n} de ${total} ── */\n`;
}

export function stripMarkers(text) {
  return text
    .replace(/^\/\* ── Speaking Exam · parte \d+ de \d+ ── \*\/\n\n/, '')
    .replace(/\n\n\/\* ── fin de la parte \d+ de \d+ ── \*\/\n$/, '');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parts = splitCode(readFileSync(SRC, 'utf8'));
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.gs')) rmSync(join(OUT, f));
  parts.forEach((p, i) => {
    const name = `parte-${i + 1}.gs`;
    writeFileSync(join(OUT, name), withMarkers(p, i + 1, parts.length));
    console.log(`${name}: ${p.split('\n').length} lines, ${Buffer.byteLength(p)} bytes`);
  });
}

// Builds the exam from the teacher's PowerPoint:
//
//   node scripts/build-exam.mjs "Speaking Exam.pptx"
//
// The deck has one block per version: a "Speaking N" title slide, then
//   Questions 1–2: Read a text aloud   (the text)
//   Question 3: Describe a picture     (the picture)
//   Questions 4–7: Respond to questions (the narrator's context and 4 questions)
//
// Each version goes to exam/vNN.json, with its picture in exam/vNN.jpg. The
// teacher supervises the exam in class, so the files are not locked with a
// code. The .pptx itself is not committed.
//
// Pictures are made smaller (JPEG, 1280 px wide) with sharp or Python's Pillow
// when one of them is installed; otherwise they are kept as they are.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

// ─── a minimal .zip reader ──────────────────────────────────────────────────

export function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a .pptx (zip) file.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files.set(name, () => (method === 8 ? inflateRawSync(raw) : raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ─── reading the slides ─────────────────────────────────────────────────────

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

// The paragraphs of a slide, in order.
export function slideParagraphs(xml) {
  return [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)]
    .map(([, p]) => decode([...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('')).trim())
    .filter(Boolean);
}

function slidesInOrder(zip) {
  const text = (name) => zip.get(name)().toString('utf8');
  // A relationship's attributes can come in any order.
  const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const rels = Object.fromEntries(
    [...text('ppt/_rels/presentation.xml.rels').matchAll(/<Relationship [^>]*>/g)].map(([tag]) => [attr(tag, 'Id'), attr(tag, 'Target')]),
  );
  const ids = [...text('ppt/presentation.xml').matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  return ids.map((id) => {
    const path = `ppt/${rels[id].replace(/^\/?ppt\//, '')}`;
    const relsPath = path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
    const slideRels = zip.has(relsPath) ? text(relsPath) : '';
    const images = [...slideRels.matchAll(/Target="([^"]+\.(?:png|jpe?g|gif|webp))"/gi)].map((m) =>
      m[1].startsWith('/') ? m[1].slice(1) : `ppt/${m[1].replace(/^\.\.\//, '')}`,
    );
    return { paragraphs: slideParagraphs(text(path)), images };
  });
}

// The versions of the exam, from the slides.
export function parseExam(slides) {
  const versions = [];
  let v = null;
  for (const slide of slides) {
    const [head = '', ...rest] = slide.paragraphs;
    const title = head.replace(/\s+/g, '');
    const speaking = title.match(/^Speaking(\d+)$/i);
    if (speaking) {
      v = { n: Number(speaking[1]) };
      versions.push(v);
      continue;
    }
    if (!v) continue;
    const body = rest.filter((p) => !/^Directions:/i.test(p));
    if (/Readatextaloud/i.test(title)) v.readAloud = body.join('\n');
    else if (/Describeapicture/i.test(title)) v.pictureFile = slide.images[0];
    else if (/Respondtoquestions/i.test(title)) {
      v.narrator = body.find((p) => /^\(Narrator\)/i.test(p))?.replace(/^\(Narrator\):?\s*/i, '');
      v.questions = body.filter((p) => /^Question \d+:/i.test(p)).map((p) => p.replace(/^Question \d+:\s*/i, ''));
    }
  }
  for (const x of versions) {
    const missing = ['readAloud', 'pictureFile', 'narrator', 'questions'].filter((k) => !x[k]);
    if (missing.length) throw new Error(`Speaking ${x.n}: no ${missing.join(', ')} found in the deck.`);
    if (x.questions.length !== 4) throw new Error(`Speaking ${x.n}: expected 4 questions, found ${x.questions.length}.`);
  }
  return versions;
}

// ─── pictures ───────────────────────────────────────────────────────────────

async function smallerPicture(buf, name) {
  try {
    const { default: sharp } = await import('sharp');
    return { mime: 'image/jpeg', data: await sharp(buf).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer() };
  } catch {
    /* no sharp */
  }
  try {
    const py =
      'import sys,io\nfrom PIL import Image\nim=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB")\nim.thumbnail((1280,1280))\nout=io.BytesIO()\nim.save(out,"JPEG",quality=82,optimize=True)\nsys.stdout.buffer.write(out.getvalue())';
    return { mime: 'image/jpeg', data: execFileSync('python3', ['-c', py], { input: buf, maxBuffer: 64 << 20 }) };
  } catch {
    /* no Pillow */
  }
  return { mime: /\.png$/i.test(name) ? 'image/png' : 'image/jpeg', data: buf };
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const [deck] = process.argv.slice(2);
  if (!deck) {
    console.error('Use: node scripts/build-exam.mjs exam.pptx');
    process.exit(1);
  }
  const zip = readZip(readFileSync(deck));
  const versions = parseExam(slidesInOrder(zip));
  const out = new URL('../exam/', import.meta.url);
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (/^v\d+\.(bin|json|jpg|png)$/.test(f)) rmSync(new URL(f, out));
  for (const v of versions) {
    const name = `v${String(v.n).padStart(2, '0')}`;
    const pic = await smallerPicture(zip.get(v.pictureFile)(), v.pictureFile);
    const picture = `${name}.${pic.mime === 'image/png' ? 'png' : 'jpg'}`;
    writeFileSync(new URL(picture, out), pic.data);
    const version = { n: v.n, readAloud: v.readAloud, picture, narrator: v.narrator, questions: v.questions };
    writeFileSync(new URL(`${name}.json`, out), `${JSON.stringify(version, null, 2)}\n`);
    console.log(`Speaking ${v.n}: ${name}.json + ${picture} (${Math.round(pic.data.length / 1024)} KB, ${v.questions.length} questions)`);
  }
  writeFileSync(new URL('manifest.json', out), `${JSON.stringify({ versions: versions.map((v) => v.n), built: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
  console.log(`${versions.length} versions written to exam/.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

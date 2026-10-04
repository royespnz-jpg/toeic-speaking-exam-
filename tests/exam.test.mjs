import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildTimeline, timedSeconds, RESPONSES, PARTS } from '../js/format.js';
import { parseExam, slideParagraphs } from '../scripts/build-exam.mjs';
import { fmt } from '../js/clock.js';

const VERSION = {
  n: 3,
  readAloud: 'A text to read.',
  picture: 'v03.jpg',
  narrator: 'Imagine that…',
  questions: ['First?', 'Second?', 'Third?', 'Fourth?'],
};

test('the timeline follows the deck: 45/45, 30/60, then four 60-second answers', () => {
  const steps = buildTimeline(VERSION);
  const timed = steps.filter((s) => s.seconds).map((s) => `${s.type}:${s.id || s.part}:${s.seconds}`);
  assert.deepEqual(timed, [
    'prep:read:45',
    'response:q1-2:45',
    'prep:picture:30',
    'response:q3:60',
    'response:q4:60',
    'response:q5:60',
    'response:q6:60',
    'response:q7:60',
  ]);
  assert.equal(timedSeconds(steps), 45 + 45 + 30 + 60 * 5);
  // Every recorded answer is in the timeline once, in order.
  assert.deepEqual(
    steps.filter((s) => s.type === 'response').map((s) => s.id),
    RESPONSES.map((r) => r.id),
  );
  // Each question is read before its answer, with the beep cue left to the app.
  const q5 = steps.findIndex((s) => s.id === 'q5');
  assert.equal(steps[q5 - 1].say, 'Question 5. Second?');
  assert.equal(steps[q5].prompt, 'Second?');
  assert.match(PARTS.questions.directions, /four questions/);
});

test('the teacher’s demo shortens every clock but keeps at least 3 seconds', () => {
  const steps = buildTimeline(VERSION, { scale: 0.1 });
  assert.deepEqual(
    steps.filter((s) => s.seconds).map((s) => s.seconds),
    [5, 5, 3, 6, 6, 6, 6, 6],
  );
});

test('the clock shows mm:ss and rounds up', () => {
  assert.equal(fmt(60), '01:00');
  assert.equal(fmt(44.2), '00:45');
  assert.equal(fmt(0.01), '00:01');
  assert.equal(fmt(-1), '00:00');
});

test('the deck is read into versions', () => {
  assert.deepEqual(slideParagraphs('<a:p xmlns:a="x"><a:r><a:t>Hello &amp; </a:t></a:r><a:r><a:t xml:space="preserve">world</a:t></a:r></a:p><a:p/>'), ['Hello & world']);
  const slides = [
    { paragraphs: ['S p e a k i n g  1'], images: [] },
    { paragraphs: ['Questions 1–2: Read a text aloud', 'Directions: read it.', 'The text.'], images: [] },
    { paragraphs: ['Question 3: Describe a picture', 'Directions: describe it.'], images: ['ppt/media/image.png'] },
    {
      paragraphs: [
        'Questions 4–7: Respond to questions',
        'Directions: answer.',
        '(Narrator): Imagine a study.',
        'Question 4: One?',
        'Question 5: Two?',
        'Question 6: Three?',
        'Question 7: Four?',
      ],
      images: [],
    },
  ];
  assert.deepEqual(parseExam(slides), [
    { n: 1, readAloud: 'The text.', pictureFile: 'ppt/media/image.png', narrator: 'Imagine a study.', questions: ['One?', 'Two?', 'Three?', 'Four?'] },
  ]);
  assert.throws(() => parseExam(slides.slice(0, 3)), /Speaking 1: no narrator, questions/);
});

test('the published exam: every version in the manifest, with its text, picture and four questions', () => {
  const dir = new URL('../exam/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir)));
  assert.deepEqual(manifest.versions, Array.from({ length: 14 }, (_, i) => i + 1));
  const files = readdirSync(dir).filter((f) => f !== 'manifest.json').sort();
  assert.deepEqual(files, manifest.versions.flatMap((n) => [`v${String(n).padStart(2, '0')}.jpg`, `v${String(n).padStart(2, '0')}.json`]));
  for (const n of manifest.versions) {
    const name = `v${String(n).padStart(2, '0')}`;
    const v = JSON.parse(readFileSync(new URL(`${name}.json`, dir)));
    assert.equal(v.n, n);
    assert.equal(v.picture, `${name}.jpg`);
    assert.ok(v.readAloud.length > 200, `${name}: the text to read`);
    assert.ok(v.narrator.length > 20, `${name}: the narrator`);
    assert.equal(v.questions.length, 4, `${name}: four questions`);
    const jpg = readFileSync(new URL(v.picture, dir));
    assert.deepEqual([...jpg.subarray(0, 3)], [0xff, 0xd8, 0xff], `${name}: the picture is a JPEG`);
    assert.equal(buildTimeline(v).filter((s) => s.type === 'response').length, 6);
  }
});

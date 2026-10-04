// The exam's format: the TOEIC® Speaking structure as the teacher's deck sets
// it ("Exact Format"). The content of each version (text, picture, questions)
// comes from the encrypted exam files; this part is not secret.

export const PARTS = {
  read: {
    label: 'Questions 1–2',
    title: 'Read a text aloud',
    directions:
      'In this part of the test, you will read aloud the text on the screen. You will have 45 seconds to prepare. Then you will have 45 seconds to read the text aloud.',
    prep: 45,
    response: 45,
    beginResponse: 'Begin reading aloud now.',
  },
  picture: {
    label: 'Question 3',
    title: 'Describe a picture',
    directions:
      'In this part of the test, you will describe the picture on your screen in as much detail as you can. You will have 30 seconds to prepare your response. Then you will have 1 minute to speak about the picture.',
    prep: 30,
    response: 60,
    beginResponse: 'Begin speaking now.',
  },
  questions: {
    label: 'Questions 4–7',
    title: 'Respond to questions',
    directions:
      'In this part of the test, you will answer four questions. For each question, begin responding immediately after you hear a beep. No preparation time is provided. You will have 1 minute to respond to each question.',
    prep: 0,
    response: 60,
  },
};

export const INTRO =
  'This is the Speaking test. It has three parts and seven questions. The test runs by itself: the clock shows how much time you have to prepare and to speak. Your microphone turns on when it is time to speak and turns off when the time is up. You cannot pause or go back.';

// The recorded answers, in order.
export const RESPONSES = [
  { id: 'q1-2', part: 'read', label: 'Questions 1–2', short: '1–2' },
  { id: 'q3', part: 'picture', label: 'Question 3', short: '3' },
  { id: 'q4', part: 'questions', label: 'Question 4', short: '4' },
  { id: 'q5', part: 'questions', label: 'Question 5', short: '5' },
  { id: 'q6', part: 'questions', label: 'Question 6', short: '6' },
  { id: 'q7', part: 'questions', label: 'Question 7', short: '7' },
];

// Every step of the exam, in order. `scale` shortens the clocks (quick tests of the page).
//   intro     – general directions, spoken
//   part      – a part's directions, spoken; the part's content appears
//   say       – the narrator or a question, spoken
//   prep      – preparation time on the clock
//   response  – the microphone records for `seconds`
export function buildTimeline(version, { scale = 1 } = {}) {
  const t = (s) => Math.max(3, Math.round(s * scale));
  const steps = [{ type: 'intro', say: INTRO }];
  const block = (part, extra) => {
    const p = PARTS[part];
    steps.push({ type: 'part', part, say: `${p.label}. ${p.title}. ${p.directions}` });
    steps.push({ type: 'prep', part, seconds: t(p.prep), say: 'Begin preparing now.' });
    steps.push({ type: 'response', part, seconds: t(p.response), say: p.beginResponse, ...extra });
  };
  block('read', { id: 'q1-2', prompt: 'Read the text aloud.' });
  block('picture', { id: 'q3', prompt: 'Describe the picture.' });
  steps.push({ type: 'part', part: 'questions', say: `${PARTS.questions.label}. ${PARTS.questions.title}. ${PARTS.questions.directions}` });
  steps.push({ type: 'say', part: 'questions', say: version.narrator, narrator: true });
  version.questions.forEach((q, i) => {
    const n = 4 + i;
    steps.push({ type: 'say', part: 'questions', question: n, say: `Question ${n}. ${q}` });
    steps.push({ type: 'response', part: 'questions', question: n, id: `q${n}`, seconds: t(PARTS.questions.response), prompt: q });
  });
  return steps;
}

// How long the exam takes, in seconds, not counting the spoken directions.
export function timedSeconds(steps) {
  return steps.reduce((n, s) => n + (s.seconds || 0), 0);
}

// The countdown clock: a ring that empties as the time runs out, the time in
// the middle and the phase above it. Driven by the real time (not by counting
// ticks), so it stays right even when the tab is in the background.

const SIZE = 240;
const R = 104;
const C = 2 * Math.PI * R;

export const fmt = (s) => {
  const n = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};

export function clockHtml() {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * 2 * Math.PI;
    const long = i % 5 === 0;
    const r1 = 116;
    const r2 = long ? 108 : 112;
    const x = (r) => (SIZE / 2 + r * Math.sin(a)).toFixed(2);
    const y = (r) => (SIZE / 2 - r * Math.cos(a)).toFixed(2);
    return `<line x1="${x(r1)}" y1="${y(r1)}" x2="${x(r2)}" y2="${y(r2)}" class="${long ? 'tick long' : 'tick'}"/>`;
  }).join('');
  return `<div class="clock" data-mode="idle" role="timer" aria-live="off">
    <svg viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true">
      <g class="ticks">${ticks}</g>
      <circle class="track" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}"/>
      <circle class="arc" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"
        transform="rotate(-90 ${SIZE / 2} ${SIZE / 2})"/>
    </svg>
    <div class="clock-face">
      <span class="clock-phase" data-phase>Ready</span>
      <span class="clock-time" data-time>00:00</span>
      <span class="clock-sub" data-sub></span>
    </div>
  </div>`;
}

// mode: 'prep' | 'response' | 'idle'. Resolves when the time is up (or stop()).
export function runClock(el, seconds, { mode, phase, sub = '' } = {}) {
  const arc = el.querySelector('.arc');
  const time = el.querySelector('[data-time]');
  el.dataset.mode = mode;
  el.querySelector('[data-phase]').textContent = phase;
  el.querySelector('[data-sub]').textContent = sub;
  el.setAttribute('aria-label', `${phase}: ${seconds} seconds`);
  const end = performance.now() + seconds * 1000;
  let raf = 0;
  let timer = 0;
  let resolveFn;
  const done = new Promise((r) => (resolveFn = r));
  let lastShown = '';
  const draw = () => {
    const left = Math.max(0, (end - performance.now()) / 1000);
    // The ring empties counterclockwise from the top.
    arc.setAttribute('stroke-dashoffset', ((1 - left / seconds) * C).toFixed(2));
    const shown = fmt(left);
    if (shown !== lastShown) {
      time.textContent = shown;
      lastShown = shown;
    }
    el.dataset.warn = left <= 5 ? 'final' : left <= 10 ? 'soon' : '';
    return left;
  };
  const tick = () => {
    if (draw() <= 0) return finish();
    raf = requestAnimationFrame(tick);
  };
  // A timer as well: animation frames stop in a background tab.
  const finish = () => {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    draw();
    resolveFn();
  };
  timer = setTimeout(finish, seconds * 1000 + 30);
  raf = requestAnimationFrame(tick);
  return { done, stop: finish };
}

export function idleClock(el, { phase = 'Listen', time = '', sub = '' } = {}) {
  el.dataset.mode = 'idle';
  el.dataset.warn = '';
  el.querySelector('[data-phase]').textContent = phase;
  el.querySelector('[data-time]').textContent = time;
  el.querySelector('[data-sub]').textContent = sub;
  el.querySelector('.arc').setAttribute('stroke-dashoffset', '0');
}

import { vi } from 'vitest';
import { loadPage, resetGlobals, runScript } from './site.mjs';

/* Boot a build end to end: the real page, the real script list for that
   screen, in order, then boot.js - exactly what a browser does, minus the
   network. Time is fake, so a test can step frames deterministically. */
export function bootSite(opts = {}) {
  resetGlobals();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
             'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'],
  });
  const errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.map(String).join(' ')));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});

  const list = loadPage(opts);
  list.forEach((name) => runScript(name));
  return { list, errors };
}

/* Step n animation frames (16ms each). */
export function frames(n = 1) {
  for (let i = 0; i < n; i++) vi.advanceTimersByTime(16);
}

/* Give an element a layout box - jsdom has no layout engine. */
export function setBox(el, { top = 0, left = 0, width = 100, height = 100 } = {}) {
  el.getBoundingClientRect = () => ({
    top, left, width, height, right: left + width, bottom: top + height, x: left, y: top,
  });
}

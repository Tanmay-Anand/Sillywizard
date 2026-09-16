import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootSite, frames, setBox } from '../helpers/boot.mjs';

/* THE PHONE PAGER (js/mpager.js): one gesture = one chapter.

   Spec, as asked for:
     - one swipe / wheel notch / key moves exactly one page, up or down
     - the move takes one second and is eased, not the browser's snap
     - input during that second is ignored, then accepted again
     - it never goes past the first or the last page
     - it never stops between pages
     - phone and tablet-width builds only; desktop is untouched

   Layout: five sections as the live CSS lays them out, on a 375x812 phone. */

const W = 375, H = 812;
const TOPS = [0, 1300, 2600, 3900, 5200], ENDS = [700, 1900, 3700, 4500, 6000];
const OPEN = Math.round(0.58 * H), FTR = 6500, DOC = 7400, MAXY = DOC - H;
let scrollY;

function layout() {
  scrollY = 0;
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
  window.scrollTo = vi.fn((x, y) => { scrollY = typeof x === 'object' ? x.top : y; });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: DOC });
  Object.defineProperty(document.getElementById('substrate'), 'clientHeight', { configurable: true, value: H });
  [...document.querySelectorAll('.pane')].forEach((p, i) => {
    p.style.paddingTop = (i === 0 ? 450 : OPEN) + 'px';
    p.style.paddingBottom = '0px';
    p.getBoundingClientRect = () => ({ top: TOPS[i] - scrollY, bottom: ENDS[i] - scrollY,
                                       left: 0, right: W, width: W, height: ENDS[i] - TOPS[i] });
  });
  setBox(document.querySelector('.m-read'), { top: 0, height: 28, width: W });
  setBox(document.querySelector('.bar'), { top: H - 52, height: 52, width: W });
}

/* The phone boot mounts the pager itself, before this test has laid the page
   out - so it is taken down and mounted again on the laid-out page. The same
   registration: loading the script a second time would register a second
   pager and every gesture would be handled twice. */
function mountPager({ reducedMotion = false } = {}) {
  bootSite({ width: W, height: H, search: '?static', reducedMotion });
  window.PAGE.unmountOnly(['mpager']);
  document.documentElement.classList.add('m-live');   // live geometry: the object's edge is the line
  layout();
  window.PAGE.mount(document, ['mpager']);
  window.scrollTo.mockClear();
}

const M = () => window.PHONE_MATH;
const stops = () => window.M_PAGER.stops();

/* A swipe: finger from y0 to y1 (moving the finger UP scrolls DOWN). */
function swipe(y0, y1, { x0 = 180, x1 = 180, target = document.body } = {}) {
  const touch = (x, y) => [{ clientX: x, clientY: y, identifier: 1, target }];
  target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: touch(x0, y0), changedTouches: touch(x0, y0) }));
  const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: touch(x1, y1), changedTouches: touch(x1, y1) });
  target.dispatchEvent(move);
  target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: touch(x1, y1) }));
  return move;
}
const next = () => swipe(600, 450);
const prev = () => swipe(450, 600);
const wheel = (deltaY) => window.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
const key = (k, extra = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

afterEach(() => { if (window.PAGE) window.PAGE.unmount(); });

describe('one gesture = one page', () => {
  beforeEach(() => mountPager());

  it('computes its pages from the real layout, first at the top and last at the bottom', () => {
    expect(stops()[0]).toBe(0);
    expect(stops()[stops().length - 1]).toBe(MAXY);
    expect(stops()).toContain(TOPS[1] + OPEN - M().BAND_BOT * H);
  });

  it('a swipe up moves to the next page', () => {
    next();
    frames(70);                                          // > 1s
    expect(scrollY).toBe(stops()[1]);
  });

  it('a swipe down moves back one page', () => {
    next(); frames(70);
    next(); frames(70);
    prev(); frames(70);
    expect(scrollY).toBe(stops()[1]);
  });

  it('never stops between pages: whatever the gesture, it rests on a page', () => {
    for (let i = 0; i < 6; i++) { next(); frames(70); expect(stops()).toContain(scrollY); }
    for (let i = 0; i < 3; i++) { prev(); frames(70); expect(stops()).toContain(scrollY); }
  });
});

describe('the transition', () => {
  beforeEach(() => mountPager());

  it('takes one second, eased - still moving at half a second, arrived just after one', () => {
    const to = stops()[1];
    next();
    frames(31);                                          // ~500ms
    expect(scrollY).toBeGreaterThan(0);
    expect(scrollY).toBeLessThan(to);
    expect(scrollY / to).toBeCloseTo(0.5, 1);            // smootherstep is 0.5 at 0.5
    frames(20);                                          // ~816ms
    expect(scrollY).toBeLessThan(to);
    frames(15);                                          // ~1056ms
    expect(scrollY).toBe(to);
  });

  it('starts slowly and lands slowly - no jump at either end', () => {
    const to = stops()[1];
    next();
    frames(3);                                           // ~48ms
    expect(scrollY / to).toBeLessThan(0.01);
    frames(57);                                          // ~960ms
    expect(scrollY / to).toBeGreaterThan(0.99);
  });

  it('ignores swipes while it is running', () => {
    next();
    frames(20);
    next(); next(); next();
    frames(70);
    expect(scrollY).toBe(stops()[1]);
  });

  /* The two cases where an unlocked pager would visibly misbehave - a swipe
     forward mid-move alone would aim at the same page either way. */
  it('ignores a swipe back mid-move: it still lands on the page it set out for', () => {
    next();
    frames(30);
    prev();
    frames(70);
    expect(scrollY).toBe(stops()[1]);
  });

  it('ignores a swipe forward in the last moments before landing', () => {
    next();
    frames(62);                                          // ~990ms: all but arrived
    next();
    frames(70);
    expect(scrollY).toBe(stops()[1]);
  });

  it('accepts the next gesture as soon as it has finished', () => {
    next();
    frames(64);                                          // 1024ms: done
    next();
    frames(70);
    expect(scrollY).toBe(stops()[2]);
  });
});

describe('the boundaries', () => {
  beforeEach(() => mountPager());

  it('cannot go above the first page', () => {
    prev();
    frames(70);
    expect(scrollY).toBe(0);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('cannot go past the last page', () => {
    for (let i = 0; i < stops().length + 3; i++) { next(); frames(70); }
    expect(scrollY).toBe(MAXY);
  });

  it('a gesture at a boundary does not lock the next real one', () => {
    prev();
    next();
    frames(70);
    expect(scrollY).toBe(stops()[1]);
  });
});

describe('touch input', () => {
  beforeEach(() => mountPager());

  it('takes over vertical drags - the page never scrolls natively', () => {
    const move = next();
    expect(move.defaultPrevented).toBe(true);
  });

  it('ignores a small, accidental drag', () => {
    swipe(600, 580);
    frames(70);
    expect(scrollY).toBe(0);
  });

  it('lets a sideways swipe through the project row', () => {
    const row = document.querySelector('.disp__feat');
    const move = swipe(500, 470, { x0: 300, x1: 120, target: row });
    frames(70);
    expect(move.defaultPrevented).toBe(false);
    expect(scrollY).toBe(0);
  });

  it('lets a project panel that is open scroll on its own', () => {
    const panel = document.createElement('div');
    panel.className = 'reveal__panel';
    document.querySelector('.reveal-host').appendChild(panel);
    const move = swipe(600, 450, { target: panel });
    frames(70);
    expect(move.defaultPrevented).toBe(false);
    expect(scrollY).toBe(0);
  });
});

describe('wheel and keyboard (tablets, keyboards, desktop browsers at phone width)', () => {
  beforeEach(() => mountPager());

  it('one wheel notch is one page, and its momentum tail is ignored', () => {
    wheel(40);
    for (let i = 0; i < 30; i++) { frames(4); wheel(30); }   // a flick's tail, ~2s
    frames(70);
    expect(scrollY).toBe(stops()[1]);
  });

  it('takes over the wheel', () => {
    const e = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('ArrowDown / PageDown / Space go forward; ArrowUp / PageUp / Shift+Space go back', () => {
    key('ArrowDown'); frames(70);
    key('PageDown'); frames(70);
    key(' '); frames(70);
    expect(scrollY).toBe(stops()[3]);
    key('ArrowUp'); frames(70);
    key(' ', { shiftKey: true }); frames(70);
    expect(scrollY).toBe(stops()[1]);
  });

  it('End and Home go to the last and first page', () => {
    key('End'); frames(70);
    expect(scrollY).toBe(MAXY);
    key('Home'); frames(70);
    expect(scrollY).toBe(0);
  });

  it('leaves keys alone while typing in a field', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    frames(70);
    expect(scrollY).toBe(0);
  });
});

describe('chapters by name', () => {
  beforeEach(() => mountPager());

  it('M_PAGE_TO(i) takes the same one-second transition to that chapter', () => {
    window.M_PAGE_TO(3);
    frames(31);
    const target = TOPS[3] + OPEN - M().BAND_BOT * H;
    expect(scrollY).toBeGreaterThan(0);
    expect(scrollY).toBeLessThan(target);
    frames(40);
    expect(scrollY).toBe(target);
  });

  it('M_PAGE_TO past the last chapter goes to the footer', () => {
    window.M_PAGE_TO(5);
    frames(70);
    expect(scrollY).toBe(MAXY);
  });
});

describe('reduced motion', () => {
  it('pages instantly instead of animating', () => {
    mountPager({ reducedMotion: true });
    next();
    frames(1);
    expect(scrollY).toBe(stops()[1]);
  });
});

describe('arriving between pages', () => {
  it('snaps to the nearest page on mount', () => {
    bootSite({ width: W, height: H, search: '?static' });
    window.PAGE.unmountOnly(['mpager']);
    document.documentElement.classList.add('m-live');
    layout();
    scrollY = 30;                                      // 30px past the first page
    window.PAGE.mount(document, ['mpager']);
    frames(2);
    expect(stops()).toContain(scrollY);
  });
});

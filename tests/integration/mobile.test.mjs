import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootSite, frames, setBox } from '../helpers/boot.mjs';
import { runScript, setDevice } from '../helpers/site.mjs';

/* THE PHONE BUILD, BOOTED. What only a phone does: the capability gate,
   loading the renderer after first paint, falling back to static, the
   native-scroll stage driver, and tap instead of hover. The page contract
   the phone shares with desktop is covered once, in markup.test.mjs. */

const PHONE = { width: 375, height: 812 };
const realGetContext = HTMLCanvasElement.prototype.getContext;
const html = () => document.documentElement.classList;
const liveScripts = () => [...document.head.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));

function webgl(available) {
  HTMLCanvasElement.prototype.getContext = function (type) {
    return available && type === 'webgl' ? { getExtension: () => ({ loseContext() {} }) } : null;
  };
}

afterEach(() => {
  if (window.PAGE) window.PAGE.unmount();
  HTMLCanvasElement.prototype.getContext = realGetContext;
  setDevice({});
});

describe('the capability gate', () => {
  it('a capable phone goes live and loads the renderer after first paint, in order', () => {
    webgl(true);
    setDevice({ deviceMemory: 8, hardwareConcurrency: 8 });
    const run = bootSite(PHONE);
    expect(html().contains('m-live')).toBe(true);
    expect(liveScripts()).toEqual([]);                 // nothing yet: page first
    frames(20);
    expect(liveScripts()).toEqual(['js/tearfn.js', 'js/substrate.js', 'js/tear.js', 'js/mstage.js']);
    document.head.querySelectorAll('script[src]').forEach((s) => expect(s.async).toBe(false));
    expect(run.errors).toEqual([]);
  });

  it.each([
    ['WebGL is unavailable', () => { webgl(false); setDevice({ deviceMemory: 8, hardwareConcurrency: 8 }); }],
    ['memory is low', () => { webgl(true); setDevice({ deviceMemory: 2, hardwareConcurrency: 8 }); }],
    ['save-data is on', () => { webgl(true); setDevice({ saveData: true }); }],
  ])('stays static, and never downloads the renderer, when %s', (_, arrange) => {
    arrange();
    bootSite(PHONE);
    frames(20);
    expect(html().contains('m-live')).toBe(false);
    expect(liveScripts()).toEqual([]);
  });

  it('?static wins over a capable phone', () => {
    webgl(true);
    bootSite({ ...PHONE, search: '?static' });
    frames(20);
    expect(html().contains('m-live')).toBe(false);
  });

  it('a script that fails to download sends the phone back to static', () => {
    webgl(true);
    bootSite({ ...PHONE, search: '?live' });
    frames(20);
    document.head.querySelector('script[src="js/substrate.js"]').dispatchEvent(new Event('error'));
    expect(html().contains('m-live')).toBe(false);
  });

  it('a renderer that loads but cannot start sends the phone back to static', () => {
    webgl(true);
    bootSite({ ...PHONE, search: '?live' });
    frames(20);
    // run what the tags would have run; jsdom's WebGL then fails, as a real one might
    webgl(false);
    ['tearfn', 'substrate', 'tear', 'mstage'].forEach(runScript);
    document.head.querySelectorAll('script[src]').forEach((s) => s.dispatchEvent(new Event('load')));
    expect(window.SUBSTRATE).toBeUndefined();
    expect(html().contains('m-live')).toBe(false);
  });
});

describe('the static build', () => {
  beforeEach(() => bootSite({ ...PHONE, search: '?static' }));

  it('runs a real clock in the readout', () => {
    frames(70);                                        // > 1s
    expect(document.querySelector('[data-m-time]').textContent).toMatch(/^\d\d:\d\d:\d\d$/);
  });

  it('the nav buttons page to their chapter through the pager', () => {
    const to = vi.fn();
    window.M_PAGE_TO = to;
    document.querySelector('.bar__btn[data-goto="2"]').click();
    expect(to).toHaveBeenCalledWith(2);
  });

  it('without the pager, the nav buttons still scroll the section into view', () => {
    window.M_PAGE_TO = null;
    const into = vi.fn();
    Element.prototype.scrollIntoView = into;
    document.querySelector('.bar__btn[data-goto="2"]').click();
    expect(into).toHaveBeenCalledOnce();
    expect(into.mock.contexts[0]).toBe(document.querySelectorAll('.pane')[2]);
  });
});

/* ---- the stage driver ------------------------------------------------------
   Five sections laid out as the live CSS lays them out (a 58%-of-screen
   opening before each one's copy), on an 812px screen. */
describe('the live stage (js/mstage.js)', () => {
  const H = 812, OPEN = Math.round(0.58 * H);
  const TOPS = [0, 1300, 2600, 3900, 5200], FTR = 6500, DOC = 7400;
  let S, scrollY;

  function scrollTo(y) { scrollY = y; }
  beforeEach(() => {
    webgl(true);
    bootSite({ ...PHONE, search: '?live' });
    window.PAGE.unmountOnly(['mpager']);               // paging has its own suite
    html().add('m-live');
    scrollY = 0;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
    window.scrollTo = vi.fn((o) => scrollTo(o.top));
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: DOC });
    const cv = document.getElementById('substrate');
    Object.defineProperty(cv, 'clientHeight', { configurable: true, value: H });

    const panes = [...document.querySelectorAll('.pane')];
    panes.forEach((p, i) => {
      p.style.paddingTop = (i === 0 ? 450 : OPEN) + 'px';
      p.getBoundingClientRect = () => ({ top: TOPS[i] - scrollY, bottom: TOPS[i] + 1200 - scrollY,
                                         left: 0, right: 375, width: 375, height: 1200 });
    });
    const ftr = document.getElementById('ftr');
    ftr.getBoundingClientRect = () => ({ top: FTR - scrollY, bottom: DOC - scrollY, left: 0, right: 375, width: 375, height: DOC - FTR });

    S = window.SUBSTRATE = { progress: 0 };
    window.SUBSTRATE_PHASES = ['BUILD', 'BACKEND', 'SYSTEMS', 'AUTOMATION', 'EXPERIMENTS'];
    runScript('mstage');
    window.PAGE.mount(document, ['mstage']);
  });

  const settle = () => frames(90);
  const startOf = (i) => TOPS[i] + OPEN;

  it('runs frames without errors and hands over from the poster', () => {
    const errs = vi.mocked(console.error).mock.calls.length;
    settle();
    expect(vi.mocked(console.error).mock.calls.length).toBe(errs);
    expect(html().contains('m-ready')).toBe(true);
  });

  it('holds the first phase at the top of the page', () => {
    settle();
    expect(S.progress).toBe(0);
    expect(document.querySelector('[data-m-phase]').textContent).toBe('BUILD');
  });

  it('lands exactly on a phase at its settled scroll, and reports it', () => {
    scrollTo(window.PHONE_MATH.settledScroll(2, startOf(2), H));
    settle();
    expect(S.progress).toBe(2);
    expect(document.querySelector('[data-m-phase]').textContent).toBe('SYSTEMS');
    expect(document.querySelector('.bar__btn[data-goto="2"]').classList.contains('is-on')).toBe(true);
  });

  it('eases toward a new target instead of jumping to it', () => {
    settle();
    scrollTo(window.PHONE_MATH.settledScroll(1, startOf(1), H));
    frames(1);
    expect(S.progress).toBeGreaterThan(0);
    expect(S.progress).toBeLessThan(1);
    settle();
    expect(S.progress).toBe(1);
  });

  it('without the pager, the nav buttons land on the settled scroll for that phase', () => {
    settle();
    window.M_PAGE_TO = null;
    document.querySelector('.bar__btn[data-goto="3"]').click();
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: window.PHONE_MATH.settledScroll(3, startOf(3), H), behavior: 'smooth',
    });
  });

  it('brings the paper in with AUTOMATION and turns the chrome light', () => {
    scrollTo(TOPS[3] + H);
    settle();
    expect(S.tear).toBe(1);
    expect(document.body.classList.contains('is-light')).toBe(true);
    scrollTo(0);
    settle();
    expect(S.tear).toBe(0);
    expect(document.body.classList.contains('is-light')).toBe(false);
  });

  it('finishes the red at the bottom and stops drawing behind it', () => {
    scrollTo(DOC - window.innerHeight);
    settle();
    expect(S.tearRed).toBe(1);
    expect(window.DORMANT.covered).toBe(true);
  });

  it('never stops drawing because of copy - only the red covers the object', () => {
    for (const y of [0, 900, 2000, 3300, 4600]) {
      scrollTo(y);
      settle();
      expect(window.DORMANT.covered).toBe(false);
    }
  });

  it('goes idle once the page is still and the shape has landed', () => {
    settle();
    frames(40);
    expect(S.idle).toBe(true);
    scrollTo(500);
    frames(1);
    expect(S.idle).toBe(false);
  });

  it('shows only the current phase\'s background word', () => {
    scrollTo(window.PHONE_MATH.settledScroll(2, startOf(2), H));
    settle();
    const op = (p) => +document.querySelector(`.bgw__word[data-phase="${p}"]`).style.opacity;
    expect(op(2)).toBe(1);
    expect(op(1)).toBe(0);
    expect(op(3)).toBe(0);
  });
});

describe('the frame-rate probe', () => {
  function bootSlow(search) {
    webgl(true);
    bootSite({ ...PHONE, search });
    html().add('m-live');
    window.SUBSTRATE = { progress: 0 };
    // a hand-cranked rAF: every frame is `ms` apart, whatever the fake clock says
    const queue = []; let now = 0;
    window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
    window.cancelAnimationFrame = () => {};
    const stat = vi.fn();
    window.M_STATIC = stat;
    runScript('mstage');
    window.PAGE.mount(document, ['mstage']);
    return { stat, crank: (n, ms) => { for (let i = 0; i < n; i++) { now += ms; const cb = queue.shift(); if (cb) cb(now); } } };
  }

  it('sends a phone below ~24fps back to static', () => {
    const { stat, crank } = bootSlow('');
    crank(100, 60);                                    // 60ms frames = 16fps
    expect(stat).toHaveBeenCalledWith(expect.stringMatching(/^median frame 60ms/));
  });

  it('keeps a phone that holds 60fps live', () => {
    const { stat, crank } = bootSlow('');
    crank(100, 16);
    expect(stat).not.toHaveBeenCalled();
  });

  it('?live keeps a slow phone live, for testing', () => {
    const { stat, crank } = bootSlow('?live');
    crank(100, 60);
    expect(stat).not.toHaveBeenCalled();
  });
});

describe('project reveal (tap)', () => {
  const tap = (el, x = 40, y = 40) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, clientX: x, clientY: y }));
    el.focus();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  };
  const openLayer = () => document.querySelector('.reveal.is-open');
  let card;

  beforeEach(() => {
    bootSite({ ...PHONE, search: '?static' });
    card = document.querySelector('.pcard');
    setBox(card, { top: 400, left: 22, width: 290, height: 160 });
  });

  it('opens on a tap - the focus that comes with the tap does not close it again', () => {
    tap(card);
    expect(openLayer()).not.toBeNull();
    expect(card.classList.contains('is-active')).toBe(true);
  });

  it('starts the wave at the fingertip', () => {
    document.querySelectorAll('.reveal__panel').forEach((p) => setBox(p, { top: 200, left: 15, width: 345, height: 330 }));
    tap(card, 60, 380);
    expect(openLayer().style.getPropertyValue('--ox')).toBe('60.0px');
    expect(openLayer().style.getPropertyValue('--oy')).toBe('380.0px');
  });

  it('offers a close button, and it closes', () => {
    tap(card);
    const close = openLayer().querySelector('.rv__close');
    expect(close).not.toBeNull();
    close.click();
    expect(openLayer()).toBeNull();
  });

  it('closes on a second tap of the same project', () => {
    tap(card);
    tap(card);
    expect(openLayer()).toBeNull();
  });

  it('closes on a tap outside', () => {
    tap(card);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(openLayer()).toBeNull();
  });

  it('closes once the page is scrolled away', () => {
    let y = 0;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    tap(card);
    y = 120;
    window.dispatchEvent(new Event('scroll'));
    expect(openLayer()).toBeNull();
  });

  it('ignores touch pointerenter/leave - a phone has no hover', () => {
    card.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
    expect(openLayer()).toBeNull();
  });
});

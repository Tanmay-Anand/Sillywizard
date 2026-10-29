import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootSite, frames } from '../helpers/boot.mjs';

/* THE PIN (js/scroll.js, data-hold on a pane).

   A pane may ask to be held: for data-hold="N" viewports of scrolling it
   stays exactly where it is - centred, fully opaque, the subject frozen in
   that phase's shape - and then the page carries on as if nothing had
   happened. SYSTEMS uses it so its eight questions can step while the
   section is still, instead of while it slides past.

   Everything else on the page is positioned from the same phase number, so
   these pin down that a hold is invisible to every section that does not
   ask for one. */

let run;
beforeEach(() => {
  run = bootSite({ width: 1440, height: 900, search: '?skip' });
  window.SUBSTRATE = {};                          // so scroll.js publishes progress
});
afterEach(() => window.PAGE && window.PAGE.unmount());

const VH = () => window.innerHeight;
const HOLD = () => parseFloat(document.querySelector('.pane--ledger').dataset.hold) * VH();
const track = () => document.querySelector('#track').style.transform;
const ty = () => parseFloat(/translate3d\(0(?:px)?,\s*(-?[\d.]+)px/.exec(track())[1]);
const wheel = (dy) => window.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, cancelable: true }));
const panes = () => [...document.querySelectorAll('.pane')];

describe('a pane can hold the page still', () => {
  it('SYSTEMS asks for a hold, and nothing else does', () => {
    expect(+document.querySelector('.pane--ledger').dataset.hold).toBeGreaterThan(0);
    panes().filter((p) => !p.classList.contains('pane--ledger'))
      .forEach((p) => expect(p.hasAttribute('data-hold'), p.className).toBe(false));
  });

  it('while held, the copy does not move at all', () => {
    window.GOTO(2); frames(60);
    wheel(HOLD() * 0.1); frames(60);              // inside the hold
    const a = ty();
    wheel(HOLD() * 0.4); frames(60);
    const b = ty();
    wheel(HOLD() * 0.4); frames(60);
    expect(b).toBe(a);
    expect(ty()).toBe(a);
    expect(a).toBeCloseTo(-2 * VH(), 0);
  });

  it('while held, the section is centred and fully legible', () => {
    window.GOTO(2); frames(60); wheel(HOLD() * 0.5); frames(60);
    expect(+panes()[2].style.opacity).toBe(1);
    expect(panes()[2].classList.contains('is-live')).toBe(true);
    expect(window.SUBSTRATE.progress).toBe(2);
  });

  it('reports how far through the hold the reader is', () => {
    window.GOTO(2); frames(60);
    expect(window.SCROLL.hold).toBe(2);
    expect(window.SCROLL.t).toBeCloseTo(0, 2);
    wheel(HOLD() * 0.5); frames(60);
    expect(window.SCROLL.hold).toBe(2);
    expect(window.SCROLL.t).toBeCloseTo(0.5, 1);
  });

  it('keeps the SCROLL readout moving through the hold, so the page never feels stuck', () => {
    window.GOTO(2); frames(60);
    const a = window.SUBSTRATE.scrollProgress;
    wheel(HOLD() * 0.5); frames(60);
    expect(window.SUBSTRATE.scrollProgress).toBeGreaterThan(a);
  });

  it('carries on after the hold exactly where the next section starts', () => {
    window.GOTO(2); frames(60); wheel(HOLD()); frames(60);
    wheel(VH()); frames(90);
    expect(window.SUBSTRATE.progress).toBeCloseTo(3, 1);
    expect(panes()[3].classList.contains('is-live')).toBe(true);
  });
});

describe('a hold is invisible to every other section', () => {
  it('GOTO lands each section where it always did', () => {
    [0, 1, 3, 4].forEach((i) => {
      window.GOTO(i); frames(90);
      expect(window.SUBSTRATE.progress, `phase ${i}`).toBeCloseTo(i, 2);
      expect(panes()[i].classList.contains('is-live'), `phase ${i}`).toBe(true);
    });
  });

  it('GOTO SYSTEMS lands at the START of its hold - on the first question', () => {
    window.GOTO(4); frames(90);
    window.GOTO(2); frames(120);
    expect(window.SCROLL.hold).toBe(2);
    expect(window.SCROLL.t).toBeLessThan(0.02);
  });

  it('a section without a hold maps scroll to position one to one', () => {
    window.GOTO(1); frames(90);
    expect(ty()).toBeCloseTo(-1 * VH(), 0);
    wheel(VH() * 0.3); frames(90);
    expect(ty()).toBeCloseTo(-1.3 * VH(), 0);
  });

  it('the ground still turns across SYSTEMS -> AUTOMATION, after the hold', () => {
    window.GOTO(2); frames(60); wheel(HOLD()); frames(60);
    expect(window.SUBSTRATE.tear).toBe(0);
    window.GOTO(3); frames(120);
    expect(window.SUBSTRATE.tear).toBe(1);
  });

  it('End still reaches the footer', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    frames(180);
    expect(window.SUBSTRATE.tearRed).toBe(1);
  });

  it('mounts without an error', () => {
    frames(5);
    expect(run.errors).toEqual([]);
  });
});

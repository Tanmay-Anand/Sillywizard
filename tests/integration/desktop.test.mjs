import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootSite, frames } from '../helpers/boot.mjs';

/* THE DESKTOP BUILD, BOOTED. The virtual scroll, the phase fade, the nav,
   keyboard access and the project reveal on hover. jsdom has no WebGL, so
   the renderer takes its no-WebGL exit - which is itself a path worth
   knowing is safe: everything else must still work without it. */

let run;
beforeEach(() => { run = bootSite({ width: 1440, height: 900, search: '?skip' }); });
afterEach(() => window.PAGE && window.PAGE.unmount());

const panes = () => [...document.querySelectorAll('.pane')];
const btn = (i) => document.querySelector(`.bar__btn[data-goto="${i}"]`);

describe('boot', () => {
  it('mounts every module without a single error', () => {
    frames(5);
    expect(run.errors).toEqual([]);
  });

  it('survives a browser with no WebGL: no renderer, but the page still runs', () => {
    frames(5);
    expect(window.SUBSTRATE).toBeUndefined();
    expect(typeof window.GOTO).toBe('function');
  });

  it('does not mount the phone modules', () => {
    expect(window.PHONE_MATH).toBeUndefined();
    expect(document.documentElement.classList.contains('m-live')).toBe(false);
  });
});

describe('the virtual scroll', () => {
  it('starts on the first phase: it is live and its nav button is on', () => {
    frames(10);
    expect(panes()[0].classList.contains('is-live')).toBe(true);
    expect(btn(0).classList.contains('is-on')).toBe(true);
  });

  it('GOTO eases to a phase: that pane becomes live, the rest fade out', () => {
    window.GOTO(2);
    frames(240);                                   // ~4s: well past the ease
    const live = panes().map((p) => p.classList.contains('is-live'));
    expect(live).toEqual([false, false, true, false, false]);
    expect(+panes()[2].style.opacity).toBeCloseTo(1, 2);
    expect(+panes()[0].style.opacity).toBe(0);
    expect(btn(2).classList.contains('is-on')).toBe(true);
  });

  it('the nav buttons drive the same scroll', () => {
    btn(3).click();
    frames(240);
    expect(panes()[3].classList.contains('is-live')).toBe(true);
  });

  it('with a renderer, turns the ground light across SYSTEMS -> AUTOMATION, and back', () => {
    window.SUBSTRATE = {};                          // the renderer's shared state
    window.GOTO(3);
    frames(240);
    expect(window.SUBSTRATE.tear).toBe(1);
    expect(document.body.classList.contains('is-light')).toBe(true);
    window.GOTO(1);
    frames(240);
    expect(window.SUBSTRATE.tear).toBe(0);
    expect(document.body.classList.contains('is-light')).toBe(false);
  });

  it('without a renderer, keeps the dark ground - light text never lands on a ground that is not there', () => {
    window.GOTO(3);
    frames(240);
    expect(document.body.classList.contains('is-light')).toBe(false);
  });

  it('a wheel gesture moves forward through the phases', () => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 900 * 2.2, cancelable: true }));
    frames(240);
    expect(btn(0).classList.contains('is-on')).toBe(false);
  });
});

describe('keyboard access', () => {
  it('focusing something inside a phase brings that phase on screen', () => {
    const card = document.querySelector('.pcard');
    card.focus();
    frames(240);
    expect(panes()[4].classList.contains('is-live')).toBe(true);
  });
});

describe('project reveal (hover)', () => {
  const mouse = (el, type) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'mouse', bubbles: type === 'pointerdown' }));
  const openLayer = () => document.querySelector('.reveal.is-open');

  beforeEach(() => { window.GOTO(4); frames(240); });

  it('opens the hovered project over the field, with its name', () => {
    const card = document.querySelector('.pcard');
    mouse(card, 'pointerenter');
    expect(openLayer()).not.toBeNull();
    expect(openLayer().querySelector('.rv__name').textContent).toBe(card.querySelector('b').textContent);
    expect(card.classList.contains('is-active')).toBe(true);
  });

  it('shows the project image frames from its template', () => {
    mouse(document.querySelector('.pcard'), 'pointerenter');
    expect(openLayer().querySelectorAll('.rv__shot').length).toBeGreaterThanOrEqual(2);
  });

  it('closes after the grace period once the pointer leaves', () => {
    const card = document.querySelector('.pcard');
    mouse(card, 'pointerenter');
    mouse(card, 'pointerleave');
    expect(openLayer()).not.toBeNull();             // still open inside the grace
    frames(20);                                      // 320ms > 240ms grace
    expect(openLayer()).toBeNull();
  });

  it('moving to another project switches layers instead of closing', () => {
    const [a, b] = document.querySelectorAll('.pcard');
    mouse(a, 'pointerenter');
    mouse(a, 'pointerleave');
    mouse(b, 'pointerenter');
    const layers = [...document.querySelectorAll('.reveal')];
    expect(layers.filter((l) => l.classList.contains('is-front'))).toHaveLength(1);
    expect(layers.some((l) => l.classList.contains('is-fading'))).toBe(true);
    expect(b.classList.contains('is-active')).toBe(true);
    expect(a.classList.contains('is-active')).toBe(false);
  });

  it('never shows the phone close button on desktop', () => {
    mouse(document.querySelector('.pcard'), 'pointerenter');
    expect(document.querySelector('.rv__close')).toBeNull();
  });

  it('does not open for a phase that is not on screen', () => {
    window.GOTO(0);
    frames(240);
    mouse(document.querySelector('.pcard'), 'pointerenter');
    expect(openLayer()).toBeNull();
  });
});

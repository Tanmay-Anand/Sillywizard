import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootSite, frames, setBox } from '../helpers/boot.mjs';

/* THE PROJECT COLUMN THAT ROLLS UNDER THE POINTER.
 *
 * Six projects do not fit the gutter, so the column is a window and the strip
 * inside it tracks the pointer. jsdom has no layout engine, so every box here
 * is stated explicitly — which is the honest way to test a mapping anyway:
 * the numbers below are the contract, not a measurement of one browser.
 */

let run;
beforeEach(() => { run = bootSite({ width: 1440, height: 900, search: '?skip' }); });
afterEach(() => window.PAGE && window.PAGE.unmount());

const host = () => document.querySelector('[data-roll]');
const strip = () => document.querySelector('[data-roll-strip]');
const roll = () => strip().style.getPropertyValue('--roll');

/* A column 400px tall holding 600px of projects: 200px of travel. */
function giveLayout({ windowH = 400, contentH = 600, top = 200, left = 1100 } = {}) {
  setBox(host(), { top, left, width: 300, height: windowH });
  Object.defineProperty(host(), 'clientHeight', { value: windowH, configurable: true });
  Object.defineProperty(strip(), 'scrollHeight', { value: contentH, configurable: true });
  window.ROLL.measure(window.ROLL.states[0]);
}

const point = (x, y) =>
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse' }));

describe('the rolling project column', () => {
  it('mounts and finds the strip', () => {
    frames(5);
    expect(typeof window.ROLL).toBe('object');
    expect(window.ROLL.states).toHaveLength(1);
    expect(run.errors).toEqual([]);
  });

  it('holds every project in one column, cards first', () => {
    const names = [...strip().children].map((el) => ({
      name: el.querySelector('b').textContent.trim(),
      kind: el.className,
    }));
    expect(names).toHaveLength(6);
    expect(names.slice(0, 3).map((n) => n.kind)).toEqual(['pcard', 'pcard', 'pcard']);
    expect(names.slice(3).map((n) => n.kind)).toEqual(['pslot', 'pslot', 'pslot']);
    // The three that used to sit in a row along the bottom are in the list now.
    expect(names.map((n) => n.name)).toContain('GoblinKit');
    expect(document.querySelector('.disp__slots')).toBeNull();
  });

  it('maps pointer position to strip offset, top to bottom', () => {
    giveLayout();
    point(1150, 200);          // the very top of the column
    expect(roll()).toBe('0.0px');

    point(1150, 400);          // halfway down
    expect(roll()).toBe('-100.0px');

    point(1150, 600);          // the bottom
    expect(roll()).toBe('-200.0px');
  });

  it('is a mapping, not momentum: the same position always shows the same part', () => {
    giveLayout();
    point(1150, 500);
    const first = roll();
    point(1150, 300);
    point(1150, 500);
    expect(roll()).toBe(first);
  });

  it('returns to the top when the pointer leaves', () => {
    giveLayout();
    point(1150, 600);
    expect(roll()).toBe('-200.0px');

    point(100, 600);           // away to the left of the hot zone
    expect(roll()).toBe('0.0px');
  });

  it('counts a pointer just left of the column as still inside', () => {
    giveLayout();
    // The column is a narrow target; the hot zone reaches out to meet the
    // pointer rather than making someone thread a 300px strip.
    point(1040, 600);
    expect(roll()).toBe('-200.0px');
  });

  it('does nothing at all when the list already fits', () => {
    giveLayout({ windowH: 700, contentH: 600 });
    point(1150, 600);
    expect(roll()).toBe('0.0px');
    expect(window.ROLL.states[0].overflow).toBe(0);
  });

  it('never rolls past either end, however far the pointer goes', () => {
    giveLayout();
    point(1150, -500);
    expect(roll()).toBe('0.0px');
    point(1150, 5000);
    expect(roll()).toBe('-200.0px');
  });

  it('ignores a touch pointer, which belongs to the swipe row', () => {
    giveLayout();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 1150, clientY: 600, pointerType: 'touch' }));
    expect(roll()).toBe('0.0px');
  });

  it('brings a focused entry into the window for a keyboard visitor', () => {
    giveLayout();
    const last = strip().children[5];
    setBox(strip(), { top: 200, left: 1100, width: 300, height: 600 });
    setBox(last, { top: 740, left: 1100, width: 300, height: 40 });

    last.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    // Focus moved inside a clipped window; without this the ring is simply
    // invisible and tabbing appears to lose the page.
    expect(roll()).not.toBe('0.0px');
  });
});

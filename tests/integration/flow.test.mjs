import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootSite, frames } from '../helpers/boot.mjs';

/* 03 // SYSTEMS ASKS ITS EIGHT QUESTIONS ONE AT A TIME (js/flow.js).

   One slot to the right of the colony shows one question at a time, while
   all eight stay in the page as an ordered list. The section PINS while they
   step (js/scroll.js, data-hold): the questions only move while the section
   itself is still, so 01 is on screen when the section lands rather than
   already gone.

   Driven through the real scroll - GOTO and wheel events - not a back door. */

let run;
beforeEach(() => { run = bootSite({ width: 1440, height: 900, search: '?skip' }); });
afterEach(() => window.PAGE && window.PAGE.unmount());

const slot = () => document.querySelector('[data-flow]');
const items = () => [...slot().querySelectorAll('.flow__list > li')];
const on = () => items().filter((li) => li.classList.contains('is-on'));
const shown = () => slot().querySelector('.flow__ink.is-on').textContent.trim();
const count = () => slot().querySelector('[data-flow-n]').textContent.trim();
const lit = () => [...slot().querySelectorAll('.flow__bars i')].filter((b) => b.classList.contains('is-on')).length;
const step = () => items().indexOf(on()[0]) + 1;
const opacity = () => parseFloat(slot().style.opacity === '' ? '1' : slot().style.opacity);

const HOLD = () => parseFloat(document.querySelector('.pane--ledger').dataset.hold) * window.innerHeight;
const wheel = (dy) => window.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, cancelable: true }));
/* t of the way through the pin, 0..1 */
const pinned = (t) => { window.GOTO(2); frames(60); wheel(t * HOLD()); frames(60); };
/* off the pin: local < 0 still arriving, local > 0 already leaving */
const away = (local) => { window.GOTO(2 + local); frames(60); };

describe('the list - every question is in the page, in order', () => {
  it('mounts without an error', () => {
    frames(5);
    expect(run.errors).toEqual([]);
  });

  it('keeps all eight questions as one ordered list, in the order they are asked', () => {
    expect(slot().querySelector('ol.flow__list')).not.toBeNull();
    expect(items().map((li) => li.textContent.trim())).toEqual([
      'What is actually the problem?',
      "What can't I change?",
      'Where should the boundaries be?',
      'Who owns each decision?',
      'What should know about what?',
      'What happens when it fails?',
      'How will I know it failed?',
      'And only then, build.',
    ]);
  });

  it('keeps every question on the node it used before', () => {
    expect(items().map((li) => li.dataset.anchor)).toEqual([
      '-0.066,1.460,0', '-0.182,1.312,0', '-0.090,1.096,0', '-0.294,0.768,0',
      '0.066,1.344,0', '0.242,0.844,0', '0.174,0.652,0', 'end',
    ]);
  });

  it('leaves no question scattered in the gutters any more', () => {
    expect(document.querySelector('.flow--l')).toBeNull();
    expect(document.querySelector('.flow--r')).toBeNull();
    expect(document.querySelectorAll('.pane--ledger [data-anchor]')).toHaveLength(8);
  });

  it('hides the decoration from assistive tech, and announces nothing by itself', () => {
    ['.flow__count', '.flow__say', '.flow__bars'].forEach((sel) => {
      expect(slot().querySelector(sel).getAttribute('aria-hidden'), sel).toBe('true');
    });
    expect(document.querySelector('.pane--ledger [aria-live]')).toBeNull();
  });
});

describe('one question at a time, while the section is pinned', () => {
  it('shows exactly one question, and marks exactly that one as the current step', () => {
    for (const t of [0.05, 0.3, 0.55, 0.8, 0.98]) {
      pinned(t);
      expect(on(), `at ${t}`).toHaveLength(1);
      const cur = items().filter((li) => li.getAttribute('aria-current') === 'step');
      expect(cur, `at ${t}`).toEqual(on());
    }
  });

  it('is still on 01 when the section lands - nothing has stepped during the arrival', () => {
    away(-0.3);
    expect(step()).toBe(1);
    pinned(0);
    expect(step()).toBe(1);
  });

  it('scrolling down through the pin shows 01 to 08, in order', () => {
    window.GOTO(2); frames(60);
    const seen = [step()];
    for (let i = 0; i < 40; i++) {
      wheel(HOLD() / 40); frames(20);
      if (seen[seen.length - 1] !== step()) seen.push(step());
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('scrolling back up reverses it', () => {
    pinned(1); frames(30);
    const seen = [step()];
    for (let i = 0; i < 40; i++) {
      wheel(-HOLD() / 40); frames(20);
      if (seen[seen.length - 1] !== step()) seen.push(step());
    }
    expect(seen).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('gives each question a real stretch of scroll - two wheel notches or more', () => {
    expect(HOLD() / 8).toBeGreaterThanOrEqual(200);
  });

  it('holds 08 as the section leaves', () => {
    away(0.2);
    expect(step()).toBe(8);
  });
});

describe('the slot only shows while the section is still', () => {
  it('is fully there for the whole pin', () => {
    for (const t of [0, 0.5, 1]) { pinned(t); expect(opacity(), `at ${t}`).toBe(1); }
  });

  it('is gone while the section is still sliding in, and again once it is leaving', () => {
    away(-0.3); expect(opacity()).toBe(0);
    away(0.3);  expect(opacity()).toBe(0);
  });
});

describe('the slot - counter, question, progress', () => {
  it('shows the active question in the slot, word for word', () => {
    pinned(0.4);
    expect(shown()).toBe(on()[0].textContent.trim());
  });

  it('counts as NN, and lights a bar per step reached', () => {
    pinned(0.02);
    expect(count()).toBe('01');
    expect(lit()).toBe(1);
    pinned(0.98);
    expect(count()).toBe('08');
    expect(lit()).toBe(8);
  });

  it('turns red for the conclusion, and only for the conclusion', () => {
    pinned(0.5);
    expect(slot().classList.contains('is-end')).toBe(false);
    pinned(0.98);
    expect(slot().classList.contains('is-end')).toBe(true);
    expect(on()[0].classList.contains('flow__end')).toBe(true);
  });

  it('crossfades through two layers, so the old line is still there while the new one arrives', () => {
    pinned(0.1);
    const inks = slot().querySelectorAll('.flow__ink');
    expect(inks).toHaveLength(2);
    pinned(0.6);
    expect([...inks].filter((i) => i.classList.contains('is-on'))).toHaveLength(1);
  });

  it('has a question in the slot even before anything scrolls', () => {
    frames(2);
    expect(shown()).not.toBe('');
  });
});

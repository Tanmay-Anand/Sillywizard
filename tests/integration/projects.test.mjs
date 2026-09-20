import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootSite, frames } from '../helpers/boot.mjs';

/* THE PROJECT CARDS IN 05, IN TWO BANDS OF THREE.
 *
 * They were briefly one scrolling column of six, which failed twice over: a
 * card sliced by the window's edge read as a rendering fault rather than as a
 * hint that the list continued, and hovering a card already opens its panel,
 * so a column that also tracked the pointer meant the card under the cursor
 * kept changing while the panel flickered between projects.
 *
 * What these tests hold down is the fix: six cards of ONE kind, split by
 * position only, with no gesture attached to either band.
 */

let run;
beforeEach(() => { run = bootSite({ width: 1440, height: 900, search: '?skip' }); });
afterEach(() => window.PAGE && window.PAGE.unmount());

const dispersal = () => document.querySelector('.pane--dispersal');
const cards = (sel) => [...dispersal().querySelectorAll(`${sel} .pcard`)];
const nameOf = (el) => el.querySelector('b').textContent.trim();

describe('the project bands', () => {
  it('mounts without an error', () => {
    frames(5);
    expect(run.errors).toEqual([]);
  });

  it('holds three in the right column and three along the bottom', () => {
    expect(cards('.disp__feat').map(nameOf)).toEqual(['Praxis Chess', 'Forte', 'Sheaf']);
    expect(cards('.disp__slots').map(nameOf)).toEqual(['Vantix', 'GoblinKit', 'Gremlin']);
  });

  it('makes every one of the six the same kind of card', () => {
    const all = [...dispersal().querySelectorAll('.pcard')];
    expect(all).toHaveLength(6);
    // The lighter half-weight entry is gone: a project in the bottom band is
    // not a lesser project, it is the same card somewhere else.
    expect(dispersal().querySelectorAll('.pslot')).toHaveLength(0);

    for (const card of all) {
      expect(card.querySelector('b')).toBeTruthy();           // a name
      expect(card.querySelector('span')).toBeTruthy();        // one sentence
      expect(card.querySelector('a, s')).toBeTruthy();        // a way in, or why there is none
      expect(card.hasAttribute('data-reveal')).toBe(true);
      expect(card.getAttribute('tabindex')).toBe('0');
    }
  });

  it('carries no rolling column any more', () => {
    expect(document.querySelector('[data-roll]')).toBeNull();
    expect(document.querySelector('[data-roll-strip]')).toBeNull();
    expect(window.ROLL).toBeUndefined();
  });

  it('marks a project with no public repository, rather than linking nowhere', () => {
    const goblin = cards('.disp__slots').find((c) => nameOf(c) === 'GoblinKit');
    expect(goblin.querySelector('a')).toBeNull();
    expect(goblin.querySelector('s.slot').textContent).toMatch(/no public repo/i);
  });
});

describe('the reveal, from either band', () => {
  const hover = (el) => el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
  const openLayer = () => document.querySelector('.reveal.is-open');

  /* The phase has to be the live one: a link in a pane faded to zero is still
     clickable, so the page suppresses both until its phase arrives. */
  beforeEach(() => { window.GOTO(4); frames(240); });

  it('opens a project from the right column', () => {
    hover(cards('.disp__feat')[0]);
    expect(openLayer().querySelector('.rv__name').textContent).toBe('Praxis Chess');
  });

  it('opens a project from the bottom band the same way', () => {
    hover(cards('.disp__slots')[1]);
    expect(openLayer().querySelector('.rv__name').textContent).toBe('GoblinKit');
    // And with its frames: the bottom band is not a second-class entry.
    expect(openLayer().querySelectorAll('.rv__shot img').length).toBeGreaterThan(0);
  });
});

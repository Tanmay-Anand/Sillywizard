import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootSite, frames, setBox } from '../helpers/boot.mjs';
import { read } from '../helpers/site.mjs';

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

  it('holds four in the right column and three along the bottom', () => {
    expect(cards('.disp__feat').map(nameOf)).toEqual(['Praxis Chess', 'Redkeep', 'Forte', 'Carta']);
    expect(cards('.disp__slots').map(nameOf)).toEqual(['Sheaf', 'Vantix', 'GoblinKit']);
  });

  /* The section is headed OPEN SOURCE. Gremlin - design documents, no
     repository - came off the page so that every card can back that up. */
  it('links every project to a public repository or site, with nothing marked unpublished', () => {
    const all = cards('.disp__feat').concat(cards('.disp__slots'));
    all.forEach((c) => {
      expect(c.querySelector('a[href^="https://"]'), nameOf(c)).not.toBeNull();
      expect(c.querySelector('s.slot'), nameOf(c)).toBeNull();
    });
    expect(all.map(nameOf)).not.toContain('Gremlin');
  });

  it('makes every one of the seven the same kind of card', () => {
    const all = [...dispersal().querySelectorAll('.pcard')];
    expect(all).toHaveLength(7);
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

  /* Which projects are public changes as repositories open up, so the rule is
     the invariant rather than the roster: a card offers a way in OR says why
     there is none, never both and never neither. Naming a project here was
     what broke when GoblinKit's repository went public. */
  it('gives every project a way in, or says there is none', () => {
    const auto = [...document.querySelectorAll('.pane--field .auto__out')];
    cards('.disp__feat').concat(cards('.disp__slots'), auto).forEach((c) => {
      const link = c.querySelector('a');
      const marker = c.querySelector('s.slot');
      expect(Boolean(link), nameOf(c)).toBe(!marker);
      if (link) expect(link.getAttribute('href'), nameOf(c)).toMatch(/^https:\/\//);
      else expect(marker.textContent, nameOf(c)).toMatch(/no public repo/i);
    });
  });
});

describe('reading a card over the particle field', () => {
  /* The field is 40,000 points and the cards sit on top of it. They already
     paint above it — .stage is z-index 20, .sub is 1 — so the failure mode is
     not stacking but transparency: a card with no background lets the points
     through and the text is read against moving noise.

     Asserted against the stylesheet text because jsdom has no cascade for an
     external sheet, and the alternative is discovering it from a screenshot
     again. */
  const css = read('css/site.css');

  it('gives the card a ground of its own', () => {
    const rule = /\.pcard\{[^}]*\}/.exec(css)[0];
    expect(rule).toMatch(/background:\s*color-mix\(in srgb, var\(--ground\)/);
  });

  it('keeps the field below the stage rather than above it', () => {
    const sub = /\.sub\{[^}]*z-index:\s*(\d+)/.exec(css)[1];
    const stage = /\.stage\{[^}]*z-index:\s*(\d+)/.exec(css)[1];
    expect(Number(stage)).toBeGreaterThan(Number(sub));
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
    /* Every card in the band, not one by position - which card sits where
       changes as projects come and go. */
    /* The FRONT layer: moving from one card to the next leaves the previous
       panel open while it fades out behind the new one. */
    const front = () => document.querySelector('.reveal.is-open.is-front');
    cards('.disp__slots').forEach((card) => {
      hover(card);
      expect(front().querySelector('.rv__name').textContent).toBe(nameOf(card));
      // And with its frames: the bottom band is not a second-class entry.
      expect(front().querySelectorAll('.rv__shot img').length, nameOf(card)).toBeGreaterThan(0);
    });
  });
});

/* EACH CARD CARRIES ITS PROJECT'S MARK - the symbol, cropped from the
   project's own logo file (assets/marks/README.md). Floated beside the name
   so it narrows only the first line or two; a full-height column would push
   every description onto an extra line. Greyscale at rest, so six logos in
   six colours read as one set; full colour when the card is active. */
describe('the project marks', () => {
  const all = () => cards('.disp__feat').concat(cards('.disp__slots'));
  const css = read('css/site.css');

  it('gives every card exactly one mark, its own', () => {
    all().forEach((c) => {
      const marks = c.querySelectorAll('img.pcard__mark');
      expect(marks, nameOf(c)).toHaveLength(1);
      const slug = nameOf(c).toLowerCase().replace(/[^a-z]/g, '').replace('praxischess', 'praxis');
      expect(marks[0].getAttribute('src'), nameOf(c)).toBe(`assets/marks/${slug}.webp`);
    });
  });

  it('puts the mark first, so the float wraps the name and the sentence', () => {
    all().forEach((c) => expect(c.firstElementChild.classList.contains('pcard__mark'), nameOf(c)).toBe(true));
  });

  it('treats the mark as decoration - the name beside it already says what it is', () => {
    all().forEach((c) => expect(c.querySelector('.pcard__mark').getAttribute('alt'), nameOf(c)).toBe(''));
  });

  it('reserves the mark\'s box, so the card does not reflow when it loads', () => {
    all().forEach((c) => {
      const m = c.querySelector('.pcard__mark');
      expect(+m.getAttribute('width'), nameOf(c)).toBeGreaterThan(0);
      expect(+m.getAttribute('height'), nameOf(c)).toBeGreaterThan(0);
    });
  });

  it('is greyscale at rest and full colour on an active card', () => {
    expect(css).toMatch(/\.pcard__mark\{[^}]*filter:grayscale\(1\)/);
    expect(css).toMatch(/\.pcard\.is-active \.pcard__mark[^{]*\{[^}]*filter:none/);
  });

  it('shrinks to the name line on short screens, and wins over the bottom-row size', () => {
    /* At 1280x720 a full-size mark made four cards wrap one line more,
       which ran the right column into the bottom row. The short-screen rule
       has to come AFTER .disp__slots .pcard__mark, or that rule overrides it. */
    const bottomRow = css.indexOf('.disp__slots .pcard__mark{');
    const short = css.search(/@media \(max-height: 880px\)\{\s*\.pcard__mark\{/);
    expect(bottomRow).toBeGreaterThan(-1);
    expect(short).toBeGreaterThan(bottomRow);
    expect(css.slice(short)).toMatch(/\.pcard__mark\{[^}]*max-height:18px/);
  });

  it('floats beside the name rather than taking a column', () => {
    expect(css).toMatch(/\.pcard__mark\{[^}]*float:right/);
    expect(css).toMatch(/\.pcard\{[^}]*display:flow-root/);
  });
});

/* CARTA SHIPS TWO BUILDS, and its panel shows both, named: the desktop UI and
   the real Android app - not the browser at phone width, which is what the
   phone frame used to be. */
describe('Carta in OPEN SOURCE', () => {
  const carta = () => cards('.disp__feat').find((c) => nameOf(c) === 'Carta');

  it('closes the right column, under Forte', () => {
    expect(cards('.disp__feat').pop()).toBe(carta());
  });

  it('pairs the desktop map with the Android app, each named', () => {
    const tpl = carta().querySelector('template').content;
    expect([...tpl.querySelectorAll('.rv__cap')].map((c) => c.textContent.trim()))
      .toEqual(['// desktop', '// mobile app']);
    expect([...tpl.querySelectorAll('.rv__shot img')].map((i) => i.getAttribute('src')))
      .toEqual(['assets/shots/carta-map.webp', 'assets/shots/carta-app.webp']);
  });

  it('shows the same two frames in AUTOMATION, so the two sections never disagree', () => {
    const auto = [...document.querySelectorAll('.auto__out')].find((a) => a.querySelector('b').textContent === 'Carta');
    const srcs = (el) => [...el.querySelector('template').content.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs(auto)).toEqual(srcs(carta()));
  });
});

/* A PANEL NEVER SITS ON THE BOTTOM ROW. Centred on the screen, a tall panel
   (GoblinKit's) grew down over the row and hid the very card it came from.
   js/reveal.js lifts it until it clears the row by LIFT_GAP, and never lifts
   it off the top of the screen. */
describe('the panel and the bottom row', () => {
  beforeEach(() => { window.GOTO(4); frames(240); });
  const layer = () => document.querySelector('.pane--dispersal .reveal.is-open.is-front');
  const open = (card) => card.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
  const panelsAt = (top, bottom) => document.querySelectorAll('.pane--dispersal .reveal__panel')
    .forEach((p) => setBox(p, { top, left: 400, width: 500, height: bottom - top }));

  it('lifts a panel that would reach the row, until it clears it by 28px', () => {
    setBox(document.querySelector('.disp__slots'), { top: 500, left: 300, width: 700, height: 120 });
    panelsAt(200, 600);                                 // 100px into the row
    open(cards('.disp__slots').find((c) => nameOf(c) === 'GoblinKit'));
    expect(layer().style.getPropertyValue('--rv-lift')).toBe('128.0px');   // 600 - (500 - 28)
  });

  it('leaves a panel alone when it already clears the row', () => {
    setBox(document.querySelector('.disp__slots'), { top: 700, left: 300, width: 700, height: 120 });
    panelsAt(200, 600);
    open(cards('.disp__slots')[0]);
    expect(layer().style.getPropertyValue('--rv-lift')).toBe('0px');
  });

  it('never lifts a panel off the top of the screen', () => {
    setBox(document.querySelector('.disp__slots'), { top: 300, left: 300, width: 700, height: 120 });
    panelsAt(60, 600);                                  // would need 328px; only 44px to spare
    open(cards('.disp__slots')[0]);
    expect(layer().style.getPropertyValue('--rv-lift')).toBe('44.0px');    // 60 - 16
  });

  it('moves the panel by the lift in CSS', () => {
    expect(read('css/site.css')).toMatch(/\.reveal__panel\{[^}]*translate:-50% calc\(-50% - var\(--rv-lift, 0px\)\)/);
  });
});

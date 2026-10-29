import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPage, read } from '../helpers/site.mjs';

/* THE PAGE CONTRACT. Desktop and phone serve the same index.html, so every
   test here holds for both builds - it runs once, against the document
   itself. What differs between the builds is behaviour, and that lives in
   desktop.test.mjs and mobile.test.mjs. */

const PHASES = /var PHASES = \[([^\]]*)\]/.exec(read('js/substrate.js'))[1]
  .match(/'([^']+)'/g).map((s) => s.slice(1, -1));

beforeAll(() => loadPage({ width: 1440 }));

const $$ = (sel) => [...document.querySelectorAll(sel)];
const nums = (s) => s.split(',').map(Number);

describe('structure', () => {
  it('has exactly one h1', () => {
    expect($$('h1')).toHaveLength(1);
  });

  it('has five sections, labelled in PHASES order', () => {
    const labels = $$('.pane').map((p) => p.getAttribute('aria-label'));
    expect(labels).toHaveLength(PHASES.length);
    labels.forEach((l, i) => {
      expect(l).toBe(`Phase 0${i + 1}, ${PHASES[i][0]}${PHASES[i].slice(1).toLowerCase()}`);
    });
  });

  it('gives every section exactly one heading', () => {
    $$('.pane').forEach((p) => expect(p.querySelectorAll('h2')).toHaveLength(1));
  });

  it('has a nav button for each phase, in order, pointing at it', () => {
    const btns = $$('.bar__btn[data-goto]');
    expect(btns.map((b) => b.textContent.replace('+', '').trim().toUpperCase())).toEqual(PHASES);
    expect(btns.map((b) => +b.dataset.goto)).toEqual(PHASES.map((_, i) => i));
  });

  it('has no duplicate ids', () => {
    const ids = $$('[id]').map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps decorative layers out of the accessibility tree', () => {
    for (const sel of ['.bgw', '.hud', '.reveal-host', '.m-bust', '.loader']) {
      expect(document.querySelector(sel).getAttribute('aria-hidden')).toBe('true');
    }
  });
});

const GITHUB = 'https://github.com/Tanmay-Anand';
const MEDIUM = 'https://medium.com/@tanmayanand2002_63440';
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

describe('contact', () => {
  it('links to GitHub, LinkedIn and Medium over https, in a new tab, without an opener', () => {
    const links = $$('.ftr__nav a[target="_blank"]');
    expect(links.map((a) => new URL(a.href).hostname)).toEqual(['github.com', 'www.linkedin.com', 'medium.com']);
    links.forEach((a) => {
      expect(a.href.startsWith('https://')).toBe(true);
      expect(a.rel).toContain('noopener');
    });
  });

  it('links to the Medium profile, labelled medium', () => {
    const a = document.querySelector(`.ftr__nav a[href="${MEDIUM}"]`);
    expect(a).not.toBeNull();
    expect(text(a.querySelector('[data-label]'))).toBe('medium');
  });

  it('has a mailto link', () => {
    expect($$('.ftr__nav a[href^="mailto:"]')).toHaveLength(1);
  });
});

describe('the footer signature', () => {
  it('is the name and the brand, with no time zone - a time zone gives away a location', () => {
    expect(text(document.querySelector('.ftr__foot'))).toBe('TANMAY ANAND // SILLYWIZARD');
  });
});

/* THE THREE PRINCIPLES ARE GONE. "Understand the system before changing it"
   and its two siblings restated what SYSTEMS already argues four screens
   earlier, less vividly. The footer is the contact links and the signature. */
describe('the footer', () => {
  it('carries no list of principles', () => {
    expect(document.querySelector('.ftr__notes')).toBeNull();
    expect(document.querySelector('#ftr').textContent).not.toMatch(/in that order/i);
  });

  it('goes straight from the links to the signature', () => {
    expect(document.querySelector('.ftr__foot').previousElementSibling
      .querySelector('.ftr__nav')).not.toBeNull();
  });
});

describe('the bar', () => {
  it('ends with a link to the GitHub profile, in a new tab, without an opener', () => {
    const last = document.querySelector('.bar').lastElementChild;
    expect(last.tagName).toBe('A');
    expect(last.getAttribute('href')).toBe(GITHUB);
    expect(last.target).toBe('_blank');
    expect(last.rel).toContain('noopener');
    expect(text(last.querySelector('[data-label]'))).toBe('github');
  });

  it('still has an accessible name where the phone hides the label', () => {
    // contains the visible words, so voice control ("click open my git profile") still works
    expect(document.querySelector('.bar__git').getAttribute('aria-label')).toBe('Open my GitHub profile');
  });

  it('no longer offers to copy the email address', () => {
    expect(document.querySelector('[data-copy-email]')).toBeNull();
    expect(read('js/hud.js')).not.toContain('data-copy-email');
  });
});

/* WHOSE SITE THIS IS. The name used to live only in a hidden <h1>, a dim
   vertical label on the rail (3.4:1 on dark, 2.9:1 on light - below the
   4.5:1 readable text needs) and the last line of the footer. */
describe('the owner is named where people look', () => {
  it('names the owner and role on the first screen, right above the opening line', () => {
    const idx = document.querySelector('.pane--void .lede__idx');
    expect(idx).not.toBeNull();
    expect(text(idx)).toBe('TANMAY ANAND // BACKEND & SYSTEMS ENGINEER');
    expect(idx.nextElementSibling.tagName).toBe('H2');
    expect(idx.closest('.vh')).toBeNull();
  });

  it('puts the name in the browser tab, first, so a narrow tab keeps it', () => {
    // from the file: the test page is built from <body>, so document.title is empty here
    expect(/<title>([^<]*)<\/title>/.exec(read('index.html'))[1]).toBe('Tanmay Anand // SILLYWIZARD');
  });

  it('writes the edge signature in body-copy grey, not the dimmest grey on the page', () => {
    expect(read('css/site.css')).toMatch(/\.hud__edge--l\{[^}]*color:var\(--fog\)/);
  });
});

/* THE HUD READS PHASE, STATE AND COHERENCE - and stops there. The
   OBSERVER / UPTIME pair beneath a rule was removed at the owner's request. */
describe('the HUD readout', () => {
  it('keeps phase, state and coherence', () => {
    ['[data-hud-phase]', '[data-hud-state]', '[data-hud-coh]']
      .forEach((sel) => expect(document.querySelector(sel), sel).not.toBeNull());
  });

  it('shows no observer and no uptime', () => {
    const labels = [...document.querySelectorAll('.hud__read .hud__row span')]
      .map((s) => s.textContent.trim().toLowerCase());
    expect(labels).toEqual(['phase', 'state', 'coherence']);
    expect(document.querySelector('[data-hud-uptime]')).toBeNull();
    expect(document.querySelector('.hud__read .hud__rule')).toBeNull();
  });

  it('runs no timer for it', () => {
    /* Narrow on purpose: hud.js still uses setInterval for the scramble on
       hovered links. What must not come back is time counted since load. */
    expect(read('js/hud.js')).not.toMatch(/data-hud-uptime|Date\.now\(\)\s*-/);
  });
});

/* NO WALL CLOCK, AND NO TIME ZONE. The bar and the phone readout used to show
   "GMT+5:30" and a live clock in Asia/Kolkata - which tells every visitor
   roughly where the owner lives. Both are gone, on both builds, and nothing
   computes a local time to put anywhere. */
describe('no clock, no time zone', () => {
  it('shows no time zone anywhere on the page', () => {
    expect(document.body.textContent).not.toMatch(/\b(GMT|UTC)\s*[+-]\s*\d/);
  });

  it('has no clock in the bar or in the phone readout', () => {
    ['.bar__clock', '.bar__zone', '[data-clock-time]', '[data-m-time]']
      .forEach((sel) => expect(document.querySelector(sel), sel).toBeNull());
  });

  it('computes no local time in any script', () => {
    ['js/hud.js', 'js/mobile.js'].forEach((f) => {
      const src = read(f);
      expect(src, f).not.toMatch(/Asia\/Kolkata/);
      expect(src, f).not.toMatch(/data-(clock|m)-time/);
    });
  });

  it('keeps the phone readout - the name and the phase - visible', () => {
    /* It hid its clock with `.m-read span:last-child`. With the clock gone,
       the name-and-phase span IS the last child, so that rule would have
       hidden the whole readout. */
    const spans = [...document.querySelectorAll('.m-read > span')];
    expect(spans).toHaveLength(1);
    expect(spans[0].querySelector('[data-m-phase]')).not.toBeNull();
    expect(read('css/mobile.css')).not.toMatch(/\.m-read\s+span:last-child\s*\{[^}]*display\s*:\s*none/);
  });
});

describe('the leader lines and routes point at real coordinates', () => {
  it('parses every data-anchor to three finite numbers, or "end"', () => {
    const anchors = $$('[data-anchor]').map((e) => e.dataset.anchor);
    expect(anchors.length).toBeGreaterThan(0);
    anchors.forEach((a) => {
      if (a === 'end') return;
      const v = nums(a);
      expect(v).toHaveLength(3);
      v.forEach((n) => expect(Number.isFinite(n)).toBe(true));
    });
  });

  it('parses every data-route to at least two points of three finite numbers', () => {
    const routes = $$('[data-route]');
    expect(routes).toHaveLength(3);
    routes.forEach((r) => {
      const pts = r.dataset.route.trim().split(/\s+/);
      expect(pts.length).toBeGreaterThanOrEqual(2);
      pts.forEach((p) => {
        const v = nums(p);
        expect(v).toHaveLength(3);
        v.forEach((n) => expect(Number.isFinite(n)).toBe(true));
      });
    });
  });
});

describe('projects', () => {
  const frames = (it) => {
    const tpl = it.querySelector('template');
    return tpl ? [...tpl.content.querySelectorAll('.rv__shot')] : [];
  };

  it('gives every revealable project a name', () => {
    const items = $$('[data-reveal]');
    expect(items.length).toBeGreaterThan(0);
    items.forEach((it) => expect(it.querySelector('b').textContent.trim()).not.toBe(''));
  });

  /* Not every project has a running interface to photograph - a design
     document has nothing to show, and a toolchain with no screen shows its
     mark instead. Those carry one frame or none. The rule is about what a
     frame MEANS: if one is there, it holds a real image, never a placard. */
  it('gives a project with captures 1-4 frames, and each carries a real image', () => {
    const shown = $$('[data-reveal]').filter((it) => frames(it).length);
    expect(shown.length).toBeGreaterThan(0);
    shown.forEach((it) => {
      const shots = frames(it);
      const name = it.querySelector('b').textContent.trim();
      expect(shots.length, name).toBeGreaterThanOrEqual(1);
      expect(shots.length, name).toBeLessThanOrEqual(4);
      shots.forEach((sh) => {
        const img = sh.querySelector('img');
        expect(img, name).not.toBeNull();
        expect(sh.classList.contains('slot'), name).toBe(false);
        expect(existsSync(img.getAttribute('src')), img.getAttribute('src')).toBe(true);
        expect(img.getAttribute('alt').trim(), name).not.toBe('');
        /* Reserved geometry, so opening a panel does not reflow it. */
        expect(Number(img.getAttribute('width')), name).toBeGreaterThan(0);
        expect(Number(img.getAttribute('height')), name).toBeGreaterThan(0);
      });
    });
  });

  it('never leaves an empty frame standing in for a missing capture', () => {
    $$('.rv__shot').concat(
      $$('[data-reveal]').flatMap(frames),
    ).forEach((sh) => {
      if (!sh.querySelector('img')) expect(sh.classList.contains('slot')).toBe(true);
    });
  });

  it('makes every revealable project reachable by keyboard', () => {
    $$('[data-reveal]').forEach((it) => expect(it.getAttribute('tabindex')).toBe('0'));
  });

  it('marks unfinished content as placeholder, so it cannot ship unnoticed', () => {
    $$('.pcard b, .pslot b').forEach((b) => {
      if (/project name/i.test(b.textContent)) expect(b.classList.contains('slot')).toBe(true);
    });
  });
});

describe('every local file the page references exists', () => {
  it('resolves stylesheets, icons and images', () => {
    const html = read('index.html');
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])
      .filter((u) => !/^(https?:|mailto:|#|data:)/.test(u));
    expect(refs.length).toBeGreaterThan(0);
    refs.forEach((u) => expect(existsSync(u.replace(/^\//, '')), u).toBe(true));
  });
});

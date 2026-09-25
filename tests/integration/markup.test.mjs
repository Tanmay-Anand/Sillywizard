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

describe('the footer notes', () => {
  it('reads as three numbered principles, in order', () => {
    const notes = $$('.ftr__notes p').map((p) => ({
      n: text(p.querySelector('i')),
      body: text(p).replace(/^\d+\s*/, ''),
    }));
    expect(notes).toEqual([
      { n: '01', body: 'Understand the system before changing it.' },
      { n: '02', body: 'Question the assumptions before implementing them.' },
      { n: '03', body: 'Build with context. In that order.' },
    ]);
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

import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPage, resetGlobals } from '../helpers/site.mjs';

/* WHICH BUILD A SCREEN GETS. Decided once, before first paint, by the head's
   inline script - and the loader list that follows from it is the single
   biggest difference between desktop and phone. */

beforeEach(() => resetGlobals());
const cls = () => document.documentElement.classList;

describe('the pre-paint switch', () => {
  it.each([
    ['a phone (375px)', 375, true],
    ['a small tablet at the breakpoint (760px)', 760, true],
    ['just past the breakpoint (761px)', 761, false],
    ['a laptop (1440px)', 1440, false],
  ])('%s gets the %s build', (_, width, mobile) => {
    loadPage({ width });
    expect(cls().contains('is-mobile')).toBe(mobile);
  });

  it('?desktop forces the full build on a phone', () => {
    loadPage({ width: 375, search: '?desktop' });
    expect(cls().contains('is-mobile')).toBe(false);
  });

  it('shows the loader on desktop, but never on a phone or under reduced motion', () => {
    loadPage({ width: 1440 });
    expect(cls().contains('is-loading')).toBe(true);
    loadPage({ width: 375 });
    expect(cls().contains('is-loading')).toBe(false);
    loadPage({ width: 1440, reducedMotion: true });
    expect(cls().contains('is-loading')).toBe(false);
  });
});

describe('the script list each build loads up front', () => {
  it('loads every listed file from js/', () => {
    for (const width of [375, 1440]) {
      loadPage({ width }).forEach((f) => expect(existsSync(`js/${f}.js`), f).toBe(true));
    }
  });

  it('desktop: the renderer and virtual scroll, never the phone modules', () => {
    const list = loadPage({ width: 1440 });
    expect(list).toEqual(expect.arrayContaining(['tearfn', 'substrate', 'tear', 'scroll', 'annot', 'reveal']));
    expect(list).not.toContain('mobile');
    expect(list).not.toContain('phonemath');
  });

  it('phone: no renderer up front (it is loaded later, only if the phone can carry it)', () => {
    const list = loadPage({ width: 375 });
    ['substrate', 'tear', 'scroll', 'annot', 'face', 'loader', 'mstage'].forEach((f) => expect(list).not.toContain(f));
  });

  it('phone: the pager is loaded; desktop never loads it', () => {
    expect(loadPage({ width: 375 })).toContain('mpager');
    expect(loadPage({ width: 1440 })).not.toContain('mpager');
  });

  it('phone: phonemath is loaded before mobile, which depends on it', () => {
    const list = loadPage({ width: 375 });
    expect(list.indexOf('phonemath')).toBeGreaterThan(-1);
    expect(list.indexOf('phonemath')).toBeLessThan(list.indexOf('mobile'));
  });

  it('both: the registry first and boot last', () => {
    for (const width of [375, 1440]) {
      const list = loadPage({ width });
      expect(list[0]).toBe('lifecycle');
      expect(list[list.length - 1]).toBe('boot');
    }
  });
});

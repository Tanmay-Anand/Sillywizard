import { beforeEach, describe, expect, it } from 'vitest';
import { resetGlobals, runScript, setScreen, setSearch } from '../helpers/site.mjs';

/* js/isolate.js - ?off=<layers>, the switch used to measure what each layer
   costs. js/dormancy.js - the one answer to "should anything draw now". */

beforeEach(() => resetGlobals());

describe('OFF (?off=)', () => {
  it('is empty with no flag', () => {
    setSearch('');
    runScript('isolate');
    expect(window.OFF.list).toEqual([]);
    expect(window.OFF.has('tear')).toBe(false);
  });

  it('reads a comma list, trimmed and case-insensitive', () => {
    setSearch('?off=Grain,%20TEAR,,shell');
    runScript('isolate');
    expect(window.OFF.list.sort()).toEqual(['grain', 'shell', 'tear']);
    expect(window.OFF.has('tear')).toBe(true);
    expect(window.OFF.has('fluid')).toBe(false);
  });

  it('reads the flag wherever it sits in the query', () => {
    setSearch('?fps&off=drift&face');
    runScript('isolate');
    expect(window.OFF.has('drift')).toBe(true);
  });
});

describe('DORMANT', () => {
  it('is asleep when the tab is hidden or the footer covers everything', () => {
    setScreen({});
    runScript('dormancy');
    const D = window.DORMANT;
    expect(D.asleep()).toBe(false);
    D.covered = true;
    expect(D.asleep()).toBe(true);
    D.covered = false;
    D.hidden = true;
    expect(D.asleep()).toBe(true);
  });

  it('is not asleep merely because motion is reduced - the shape still draws', () => {
    setScreen({ reducedMotion: true });
    runScript('dormancy');
    expect(window.DORMANT.reduced).toBe(true);
    expect(window.DORMANT.asleep()).toBe(false);
  });

  it('follows the tab becoming hidden', () => {
    setScreen({});
    runScript('dormancy');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(window.DORMANT.hidden).toBe(true);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(window.DORMANT.hidden).toBe(false);
  });
});

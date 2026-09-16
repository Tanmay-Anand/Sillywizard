import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGlobals, runScript } from '../helpers/site.mjs';

/* js/phonemath.js - every decision the phone build makes from numbers:
   whether to go live, where the morph is, where the torn grounds sit. */

let M;
beforeEach(() => {
  resetGlobals();
  runScript('phonemath');
  M = window.PHONE_MATH;
});

describe('decideLive - the capability gate', () => {
  const capable = { search: '', saveData: false, deviceMemory: 8, cores: 8, hasWebGL: () => true };

  it('goes live on a capable phone', () => {
    expect(M.decideLive(capable)).toEqual({ live: true, reason: 'capable' });
  });

  it('treats unreported memory and cores as capable (iOS reports neither)', () => {
    expect(M.decideLive({ ...capable, deviceMemory: undefined, cores: undefined }).live).toBe(true);
  });

  it.each([
    ['save-data is on', { saveData: true }, 'save-data'],
    ['memory is under 3 GB', { deviceMemory: 2 }, 'low memory'],
    ['there are under 4 cores', { cores: 2 }, 'few cores'],
    ['WebGL will not start', { hasWebGL: () => false }, 'no webgl'],
  ])('stays static when %s', (_, over, reason) => {
    expect(M.decideLive({ ...capable, ...over })).toEqual({ live: false, reason });
  });

  it('accepts exactly 3 GB and exactly 4 cores', () => {
    expect(M.decideLive({ ...capable, deviceMemory: 3, cores: 4 }).live).toBe(true);
  });

  it('?static forces static even on a capable phone', () => {
    expect(M.decideLive({ ...capable, search: '?static' })).toEqual({ live: false, reason: 'forced static' });
  });

  it('?live forces live even when every signal says no', () => {
    const weak = { search: '?fps&live', saveData: true, deviceMemory: 1, cores: 1, hasWebGL: () => false };
    expect(M.decideLive(weak)).toEqual({ live: true, reason: 'forced live' });
  });

  it('does not match flags that merely contain the word', () => {
    expect(M.decideLive({ ...capable, search: '?alive=1&staticky' }).reason).toBe('capable');
  });

  it('only probes WebGL once every cheaper signal has passed', () => {
    const probe = vi.fn(() => true);
    M.decideLive({ ...capable, saveData: true, hasWebGL: probe });
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('ease - smootherstep', () => {
  it('pins both ends and the middle', () => {
    expect(M.ease(0)).toBe(0);
    expect(M.ease(1)).toBe(1);
    expect(M.ease(0.5)).toBeCloseTo(0.5, 10);
  });

  it('starts and ends at rest (no kick)', () => {
    const h = 1e-4;
    expect((M.ease(h) - M.ease(0)) / h).toBeCloseTo(0, 3);
    expect((M.ease(1) - M.ease(1 - h)) / h).toBeCloseTo(0, 3);
  });

  it('never leaves 0..1 and never goes backwards', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = M.ease(Math.min(t, 1));
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });
});

describe('morphTarget - scroll position to phase progress', () => {
  // sections whose first lines sit at these document y's, on an 800px screen
  const starts = [300, 1400, 2600, 3900, 5200];
  const H = 800;
  const line = (i, screenY) => starts[i] - screenY;       // scroll that puts line i at screenY

  it('is 0 before the second section is on screen', () => {
    expect(M.morphTarget(0, starts, H)).toBe(0);
    expect(M.morphTarget(line(1, H + 50), starts, H)).toBe(0);
  });

  it('starts as a section\'s first line enters at the bottom of the screen', () => {
    expect(M.morphTarget(line(1, H), starts, H)).toBe(0);
    expect(M.morphTarget(line(1, H - 10), starts, H)).toBeGreaterThan(0);
  });

  it('finishes as that line reaches the object\'s lower edge', () => {
    expect(M.morphTarget(line(1, M.BAND_BOT * H), starts, H)).toBe(1);
  });

  it('is half-way when the line is half-way', () => {
    const mid = (1 + M.BAND_BOT) / 2 * H;
    expect(M.morphTarget(line(2, mid), starts, H)).toBeCloseTo(1.5, 6);
  });

  it('never goes backwards as the page scrolls down', () => {
    let prev = -1;
    for (let y = 0; y < 6000; y += 25) {
      const p = M.morphTarget(y, starts, H);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('holds at the last phase past the end', () => {
    expect(M.morphTarget(99999, starts, H)).toBe(starts.length - 1);
  });
});

describe('settledScroll - where the nav buttons land', () => {
  it('is the top of the page for the first section', () => {
    expect(M.settledScroll(0, 450, 800)).toBe(0);
  });

  it('puts a section\'s first line just below the object, where its morph is complete', () => {
    const y = M.settledScroll(2, 2600, 800);
    expect(M.morphTarget(y, [0, 1400, 2600], 800)).toBe(2);
    expect(2600 - y).toBeGreaterThanOrEqual(M.BAND_BOT * 800);
  });

  it('never asks for a negative scroll', () => {
    expect(M.settledScroll(1, 100, 800)).toBe(0);
  });
});

describe('tearAt - placing a torn edge at a document position', () => {
  it('matches the boundary formula in js/tearfn.js', () => {
    // tearfn: boundary b = -0.34 + 1.68 * prog, in uv (0 at the bottom).
    // An edge at screen y T must be at b = 1 - T/H.
    const H = 800;
    for (const T of [100, 400, 700]) {
      const prog = M.tearAt(1000 + T, 1000, H);
      expect(-0.34 + 1.68 * prog).toBeCloseTo(1 - T / H, 10);
    }
  });

  it('agrees with the real edge in js/tearfn.js, within the noise reach', () => {
    runScript('tearfn');
    const H = 800, T = 360, prog = M.tearAt(T, 0, H);
    let sum = 0, n = 0;
    for (let x = 0; x <= 1; x += 0.05) { sum += window.TEAR_EDGE(x, prog, 0); n++; }
    expect(Math.abs(sum / n - (1 - T / H))).toBeLessThan(0.15);
  });

  it('is 0 while the edge is far below the screen and 1 once far above', () => {
    expect(M.tearAt(5000, 0, 800)).toBe(0);
    expect(M.tearAt(-5000, 0, 800)).toBe(1);
  });
});

describe('endOfPage - carrying the red home', () => {
  it('is 0 until the last 30% of a screen of scroll', () => {
    expect(M.endOfPage(1000, 2000, 800)).toBe(0);
    expect(M.endOfPage(2000 - 0.3 * 800, 2000, 800)).toBe(0);
  });

  it('is 1 at the very bottom', () => {
    expect(M.endOfPage(2000, 2000, 800)).toBe(1);
  });
});

/* ---- paging: one gesture = one chapter ------------------------------------
   A page is a scroll position the phone is allowed to rest at. On a page,
   content between y + top (under the header) and y + bottom (above the nav
   bar) is readable. */
describe('pageStops - where the phone is allowed to rest', () => {
  const H = 812;
  const geom = {
    line: 0.52 * H, top: 40, bottom: 752, overlap: 60, maxY: 7400,
    sections: [
      { start: 450, end: 700 },           // BUILD: fits
      { start: 1500, end: 1800 },         // BACKEND: fits under the object
      { start: 2800, end: 3700 },         // SYSTEMS: taller than a screen
      { start: 4500, end: 5000 },
      { start: 5800, end: 6600 },
    ],
  };
  const stops = () => M.pageStops(geom);

  it('always starts at the top of the page and ends at the very bottom', () => {
    const s = stops();
    expect(s[0]).toBe(0);
    expect(s[s.length - 1]).toBe(geom.maxY);
  });

  it('rests each section with its first line at the object\'s lower edge', () => {
    [1, 2, 3, 4].forEach((i) => {
      expect(stops()).toContain(geom.sections[i].start - geom.line);
    });
  });

  it('gives a section that fits one page exactly one stop', () => {
    const s = stops();
    const inBackend = s.filter((y) => y >= 1500 - geom.line && y < 2800 - geom.line);
    expect(inBackend).toEqual([1500 - geom.line]);
  });

  it('pages through a section taller than the screen instead of skipping its end', () => {
    const s = stops();
    const inSystems = s.filter((y) => y >= 2800 - geom.line && y < 4500 - geom.line);
    expect(inSystems.length).toBeGreaterThan(1);
    expect(inSystems[inSystems.length - 1] + geom.bottom).toBeGreaterThanOrEqual(3700);
  });

  it('leaves no line of any section unreadable', () => {
    const s = stops();
    geom.sections.forEach(({ start, end }) => {
      for (let y = start; y <= end; y += 20) {
        expect(s.some((p) => y >= p + geom.top && y <= p + geom.bottom), `line at ${y}`).toBe(true);
      }
    });
  });

  it('overlaps consecutive pages inside a section, so no line is cut between them', () => {
    const s = stops();
    const inSystems = s.filter((y) => y >= 2800 - geom.line && y < 4500 - geom.line);
    for (let i = 1; i < inSystems.length; i++) {
      expect(inSystems[i] - inSystems[i - 1]).toBeLessThanOrEqual(geom.bottom - geom.top - geom.overlap);
    }
  });

  it('is strictly ascending, inside the page, with no near-duplicates', () => {
    const s = stops();
    for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(24);
    s.forEach((y) => { expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(geom.maxY); });
  });

  it('clamps to the page when the document is short', () => {
    const s = M.pageStops({ ...geom, maxY: 3000 });
    expect(Math.max(...s)).toBe(3000);
    expect(s.every((y) => y <= 3000)).toBe(true);
  });
});

describe('nextStop - where one gesture goes', () => {
  const stops = [0, 1000, 1600, 3000];

  it('moves exactly one stop forward or back from a resting page', () => {
    expect(M.nextStop(stops, 1000, 1)).toBe(1600);
    expect(M.nextStop(stops, 1000, -1)).toBe(0);
  });

  it('cannot go before the first page or past the last', () => {
    expect(M.nextStop(stops, 0, -1)).toBeNull();
    expect(M.nextStop(stops, 3000, 1)).toBeNull();
  });

  it('treats a position within a couple of pixels as resting on that page', () => {
    expect(M.nextStop(stops, 1001.5, 1)).toBe(1600);
    expect(M.nextStop(stops, 998.5, -1)).toBe(0);
  });

  it('from between pages (after a focus jump), goes to the nearest page in that direction', () => {
    expect(M.nextStop(stops, 1300, 1)).toBe(1600);
    expect(M.nextStop(stops, 1300, -1)).toBe(1000);
  });

  it('snaps to the nearest page', () => {
    expect(M.nearestStop(stops, 1250)).toBe(1000);
    expect(M.nearestStop(stops, 1350)).toBe(1600);
  });
});

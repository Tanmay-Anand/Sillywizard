import { beforeEach, describe, expect, it } from 'vitest';
import { resetGlobals, runScript } from '../helpers/site.mjs';

/* js/flow.js - FLOW_MATH: which of SYSTEMS' eight questions is showing.

   `u` is the section's own position:
     u < 0      still arriving   (u is how far off centre it still is)
     0 .. 1     PINNED - js/scroll.js holds the section still and u is how
                far through the hold the reader has scrolled
     u > 1      leaving          (u - 1 is how far it has gone)

   The questions only step while the section is pinned. Stepping while it
   was still sliding in meant 01 went past before anyone had noticed the
   section had arrived. */

let M;
beforeEach(() => {
  resetGlobals();
  runScript('lifecycle');
  runScript('flow');
  M = window.FLOW_MATH;
});

function walk(a, b, inc = 0.002) {
  const seen = [];
  let prev = 0;
  const n = Math.round(Math.abs(b - a) / inc);
  for (let i = 0; i <= n; i++) {
    prev = M.stepAt(a + (b - a) * (i / n), prev);
    if (seen[seen.length - 1] !== prev) seen.push(prev);
  }
  return seen;
}

describe('stepAt - one question at a time, in order', () => {
  it('has eight steps', () => {
    expect(M.STEPS).toBe(8);
  });

  it('scrolling down shows 01 to 08, in order, none skipped', () => {
    expect(walk(-0.5, 1.5)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('scrolling back up reverses it exactly', () => {
    expect(walk(1.5, -0.5)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('does all of its stepping inside the hold, where the section is still', () => {
    expect(M.START).toBe(0);
    expect(M.END).toBeLessThan(1);
    for (let u = -0.5; u < 0; u += 0.01) expect(M.raw(u), `arriving ${u}`).toBe(1);
    for (let u = 1; u <= 1.5; u += 0.01) expect(M.raw(u), `leaving ${u}`).toBe(8);
  });

  it('shows 01 for the whole arrival, so it is still there when the section lands', () => {
    expect(M.raw(-0.4)).toBe(1);
    expect(M.raw(0)).toBe(1);
    expect(M.raw(M.W * 0.9)).toBe(1);
  });

  it('gives all eight equal shares of the hold - 01 gets as long as the others', () => {
    for (let k = 1; k <= 8; k++) {
      const mid = M.START + (k - 0.5) * M.W;
      expect(M.raw(mid), `band ${k}`).toBe(k);
    }
    expect(M.W).toBeCloseTo(1 / 8, 10);
  });

  it('holds 08 from its band to the very end, through the leaving', () => {
    for (let u = M.END + 0.02; u <= 1.6; u += 0.01) expect(M.stepAt(u, 8)).toBe(8);
  });

  it('answers the first frame from position alone', () => {
    expect(M.stepAt(0.5, 0)).toBe(M.raw(0.5));
    expect(M.stepAt(-0.3, undefined)).toBe(1);
  });
});

describe('stepAt - no flicker at a band edge', () => {
  const edge = (k) => M.START + k * M.W;

  it('does not flip on exactly reaching a boundary', () => {
    expect(M.stepAt(edge(3), 3)).toBe(3);
  });

  it('needs the boundary passed by HYST before moving forward', () => {
    expect(M.stepAt(edge(3) + M.HYST * 0.9, 3)).toBe(3);
    expect(M.stepAt(edge(3) + M.HYST * 1.1, 3)).toBe(4);
  });

  it('needs the boundary passed by HYST before moving back', () => {
    expect(M.stepAt(edge(3) - M.HYST * 0.9, 4)).toBe(4);
    expect(M.stepAt(edge(3) - M.HYST * 1.1, 4)).toBe(3);
  });

  it('ignores a reader parked on a boundary whose scroll is still settling', () => {
    let step = 4;
    for (let i = 0; i < 200; i++) {
      step = M.stepAt(edge(4) + Math.sin(i * 1.7) * M.HYST * 0.8, step);
      expect(step).toBe(4);
    }
  });

  it('snaps on a jump of more than one band - a nav button, not a boundary', () => {
    expect(M.stepAt(edge(6) + 0.01, 2)).toBe(7);
    expect(M.stepAt(-0.3, 7)).toBe(1);
  });

  it('keeps the margin small next to a band, so a step never feels late', () => {
    expect(M.HYST).toBeGreaterThan(0);
    expect(M.HYST).toBeLessThan(M.W / 4);
  });
});

describe('visibility - the slot is only there while the section is', () => {
  /* The slot rides the pane. Pinned, that is dead centre; sliding in or out
     it is up to half a screen off, where it would land on the SCROLL readout
     or the HUD. So it is fully shown only near centre and gone well before
     it can reach either. */
  it('is fully shown for the whole hold', () => {
    for (let u = 0; u <= 1; u += 0.05) expect(M.shown(u)).toBe(1);
  });

  it('fades in only as the section lands, and out as it leaves', () => {
    expect(M.shown(-0.4)).toBe(0);
    expect(M.shown(-0.06)).toBeGreaterThan(0);
    expect(M.shown(-0.06)).toBeLessThan(1);
    expect(M.shown(1.06)).toBeGreaterThan(0);
    expect(M.shown(1.4)).toBe(0);
  });

  it('is gone within a tenth of a screen of travel, before it can reach the chrome', () => {
    expect(M.shown(-0.10)).toBe(0);
    expect(M.shown(1.10)).toBe(0);
  });
});

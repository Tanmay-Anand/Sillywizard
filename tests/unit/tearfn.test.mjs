import { beforeAll, describe, expect, it } from 'vitest';
import { read, resetGlobals, runScript } from '../helpers/site.mjs';

/* js/tearfn.js - the torn boundary, as GLSL for the shaders and as a
   JavaScript twin for everything that has to agree with them on the CPU. */

beforeAll(() => {
  resetGlobals();
  runScript('tearfn');
});

describe('TEAR_EDGE', () => {
  it('is below the screen before the tear starts and above it once done', () => {
    for (const x of [0, 0.3, 0.7, 1]) {
      expect(window.TEAR_EDGE(x, 0, 0)).toBeLessThan(0);
      expect(window.TEAR_EDGE(x, 1, 0)).toBeGreaterThan(1);
    }
  });

  it('stays within the noise reach (0.15) of the straight boundary', () => {
    for (let p = 0.1; p <= 0.9; p += 0.2) {
      const b = -0.34 + 1.68 * p;
      for (let x = 0; x <= 1; x += 0.1) {
        const e = window.TEAR_EDGE(x, p, 0);
        expect(e).toBeGreaterThanOrEqual(b - 0.15 - 1e-9);
        expect(e).toBeLessThanOrEqual(b + 0.15 + 1e-9);
      }
    }
  });

  it('rises as the tear progresses (on average across the width)', () => {
    const mean = (p) => {
      let s = 0;
      for (let x = 0; x <= 1; x += 0.05) s += window.TEAR_EDGE(x, p, 0);
      return s / 21;
    };
    let prev = -Infinity;
    for (let p = 0.2; p <= 0.8; p += 0.1) {
      const m = mean(p);
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
  });

  it('is deterministic - the same inputs always give the same edge', () => {
    const a = [0.1, 0.5, 0.9].map((x) => window.TEAR_EDGE(x, 0.5, 37));
    const b = [0.1, 0.5, 0.9].map((x) => window.TEAR_EDGE(x, 0.5, 37));
    expect(a).toEqual(b);
  });

  it('gives the two grounds different edges (the seed matters)', () => {
    const light = [0.1, 0.3, 0.5, 0.7, 0.9].map((x) => window.TEAR_EDGE(x, 0.5, 0));
    const red = [0.1, 0.3, 0.5, 0.7, 0.9].map((x) => window.TEAR_EDGE(x, 0.5, 37));
    expect(light).not.toEqual(red);
  });
});

describe('the shader and its JavaScript twin stay in step', () => {
  it('publishes the GLSL the renderers compile', () => {
    expect(window.TEAR_GLSL).toContain('float tearAt(vec2 uv, float prog, float seed)');
  });

  it('uses the same boundary formula in both halves', () => {
    const src = read('js/tearfn.js');
    expect(src).toContain('mix(-0.34, 1.34, prog)');      // GLSL
    expect(src).toContain('-0.34 + 1.68 * prog');         // JS: the same line
    expect(src.match(/\* 0\.30/g).length).toBeGreaterThanOrEqual(2); // same noise amplitude
  });

  it('exposes the two ground colours as 0..1 RGB triples', () => {
    for (const c of [window.TEAR_LIGHT, window.TEAR_RED]) {
      expect(c).toHaveLength(3);
      c.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); });
    }
  });
});

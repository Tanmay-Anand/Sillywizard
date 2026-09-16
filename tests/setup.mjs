import { afterEach, vi } from 'vitest';

/* jsdom leaves out the browser APIs this site leans on. Each is replaced
   with the smallest stand-in that lets the real code run; tests that care
   about one of them override it themselves. */

// No GPU in jsdom. The renderer must meet exactly this and bail out quietly -
// which is also the path a browser without WebGL takes.
HTMLCanvasElement.prototype.getContext = function () { return null; };

class InertObserver {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.targets = []; }
  observe(t) { this.targets.push(t); }
  unobserve() {}
  disconnect() { this.targets = []; }
}
globalThis.IntersectionObserver = InertObserver;
globalThis.ResizeObserver = InertObserver;

afterEach(() => {
  vi.useRealTimers();
});

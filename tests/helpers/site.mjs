import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { vi } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

/* Run a shipped script the way a <script> tag runs it: as a classic script
   in the page's global scope. Importing it as a module would change what
   top-level `var` and `this` mean, and then the test would be exercising
   something other than what the browser runs. */
export function runScript(name) {
  const file = resolve(ROOT, 'js', `${name}.js`);
  // A named classic script: same global scope a <script> gets, and V8 can
  // attribute what ran to the real file, so coverage reports mean something.
  runInThisContext(readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href });
}

/* The URL a script will see in location.search. */
export function setSearch(search) {
  window.history.replaceState({}, '', `/${search || ''}`);
}

/* matchMedia for a screen of this width. Only the queries the site asks. */
export function setScreen({ width = 1440, height = 900, reducedMotion = false } = {}) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  window.matchMedia = (q) => {
    let matches = false;
    const max = /max-width:\s*(\d+)px/.exec(q);
    if (max) matches = width <= +max[1];
    if (/prefers-reduced-motion/.test(q)) matches = reducedMotion;
    return { matches, media: q, addEventListener() {}, removeEventListener() {},
             addListener() {}, removeListener() {} };
  };
}

/* The real index.html: head decisions applied, body in place, no scripts
   run. Returns the list of scripts the page's own loader would add. */
export function loadPage({ width = 1440, height = 900, search = '', reducedMotion = false } = {}) {
  const html = read('index.html');
  setSearch(search);
  setScreen({ width, height, reducedMotion });

  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.className = '';
  document.head.innerHTML = '';
  document.body.className = '';
  document.body.innerHTML = doc.body.innerHTML;

  // The pre-paint build switch is the head's inline script.
  const inline = [...doc.head.querySelectorAll('script:not([src])')].map((s) => s.textContent);
  inline.forEach((code) => window.eval(code));

  // The loader is the body's last inline script; read its lists, do not run it.
  const loader = [...doc.body.querySelectorAll('script:not([src])')].pop().textContent;
  const mobile = document.documentElement.classList.contains('is-mobile');
  const list = (re) => (re.exec(loader)[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  const base = list(/var list = \[([^\]]*)\]/);
  const phone = list(/mobile \? \[([^\]]*)\]/);
  const desk = list(/:\s*\[([^\]]*)\]\)\s*\n\s*\.concat/);
  return base.concat(mobile ? phone : desk).concat(['boot']);
}

/* Reset every global the site writes, so one test cannot leak into the next. */
export function resetGlobals() {
  ['PAGE', 'OFF', 'DORMANT', 'SUBSTRATE', 'SUBSTRATE_PHASES', 'PHONE_MATH', 'GOTO',
   'M_GOTO', 'M_STATIC', 'TEAR_GLSL', 'TEAR_EDGE', 'TEAR_LIGHT', 'TEAR_RED',
   'FACE_GEOM'].forEach((k) => { try { delete window[k]; } catch (e) { window[k] = undefined; } });
  vi.restoreAllMocks();
}

/* Define navigator properties the capability gate reads. */
export function setDevice({ deviceMemory, hardwareConcurrency, saveData } = {}) {
  const def = (k, v) => Object.defineProperty(navigator, k, { configurable: true, get: () => v });
  def('deviceMemory', deviceMemory);
  def('hardwareConcurrency', hardwareConcurrency);
  def('connection', saveData === undefined ? undefined : { saveData });
}

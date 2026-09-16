import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { read } from '../helpers/site.mjs';

/* WHAT GOES PUBLIC. wrangler.jsonc publishes the repository root as static
   assets, so .assetsignore is the only thing between the test suite, the
   tooling and node_modules and a public URL. Adding tooling to the repo
   without adding it here would ship it - this is the test that notices. */

const rules = read('.assetsignore').split('\n').map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

// .gitignore-style, for the shapes this file actually uses:
// a name, a path, or a *.ext glob - matched against a path or any parent.
function ignored(path) {
  const parts = path.split('/');
  return rules.some((r) => {
    if (r.startsWith('*.')) return path.endsWith(r.slice(1));
    return parts.some((_, i) => parts.slice(0, i + 1).join('/') === r);
  });
}

describe('.assetsignore', () => {
  it.each([
    'node_modules/vitest/package.json', 'tests/unit/lifecycle.test.mjs', 'coverage/index.html',
    '.github/workflows/ci.yml', '.husky/pre-push', 'package.json', 'package-lock.json',
    'vitest.config.mjs', 'tools/check.py', 'wrangler.jsonc', '.git/HEAD',
    'README.md', 'DEPLOY.md', 'CHECKLIST.md', 'assets/options/A-cowl.png',
  ])('keeps %s off the public site', (path) => {
    expect(ignored(path)).toBe(true);
  });

  it.each([
    'index.html', '404.html', 'robots.txt', 'sitemap.xml', '_headers',
    'css/site.css', 'css/mobile.css', 'js/substrate.js', 'js/phonemath.js',
    'assets/og-image.jpg', 'assets/bust-mobile.webp', 'assets/ref/face.jpg',
  ])('still publishes %s', (path) => {
    expect(ignored(path)).toBe(false);
  });

  it('publishes every script the page can load', () => {
    readdirSync('js').filter((f) => f.endsWith('.js'))
      .forEach((f) => expect(ignored(`js/${f}`), f).toBe(false));
  });

  it('ignores every tooling file that exists at the repository root', () => {
    const tooling = ['package.json', 'package-lock.json', 'vitest.config.mjs', 'tests', '.github', '.husky', 'node_modules']
      .filter((f) => existsSync(f));
    expect(tooling.length).toBeGreaterThan(0);
    tooling.forEach((f) => expect(ignored(f), f).toBe(true));
  });
});

# SILLYWIZARD

Personal site. Static — no framework, no bundler, no build step. Open
`index.html` through a local server and that is the site.

```bash
python serve.py        # http://localhost:5599, no-store on everything
npm install            # once: test tooling only - the site has no dependencies
npm test               # unit + integration suites (Vitest)
python tools/check.py  # preflight: run this before every deploy
python tools/make-og.py # regenerate share card, favicons, phone artwork
```

Deploying: **[DEPLOY.md](DEPLOY.md)**. Before you ship: **[CHECKLIST.md](CHECKLIST.md)**.

---

## The one thing to understand first

**There are two builds, and they are different runtimes — not one runtime with
a responsive stylesheet.**

| | desktop | phone |
|---|---|---|
| scrolling | virtual (`js/scroll.js` owns the wheel; `body` never scrolls) | one chapter per gesture (`js/mpager.js`: a 1-second move, input locked while it runs); `js/mstage.js` reads the position |
| subject | two WebGL point clouds, 110k points, per-frame | the same renderer on a phone budget (30k points, no hover layers), loaded **after** first paint; a static WebP if the phone declines or cannot keep up |
| ground flip | fragment shader (`js/tear.js`), timed by scroll | the same shader, **placed** on the tops of AUTOMATION and the footer |
| scripts up front | 15 | 11 (+4 if the phone goes live) |

The phone never constructs the scroll accumulator, and only constructs the
renderer if `js/mobile.js` decides it can carry it (rules in
`js/phonemath.js`). Crossing the breakpoint therefore **reloads the page** —
the two cannot be swapped in place, because the phone build has already handed
scrolling to the browser and the desktop build needs that back.

`?desktop` forces the full build on a phone, which is how the desktop layout
stays testable there.

## Layout

```
index.html        all content. Five <section class="pane">, a footer, the
                  pre-paint build switch, and the script loader.
css/base.css      design tokens + reset. Every other rule reads a token.
css/site.css      desktop: ground, subject, HUD, five compositions.
css/mobile.css    the phone build. LOADED LAST — load order is what makes it
                  win, at equal specificity.
js/               one concern per file, see below.
tools/            Python generators, and check.py (the preflight CI runs).
tests/            Vitest: unit/ (one script at a time), integration/ (the real
                  index.html with each build booted on it). See below.
.github/          CI/CD: test every push, deploy main after tests pass.
assets/           generated. Do not hand-edit.
assets/ref/       source artwork (a cartoon face) for the hover portrait.
```

## The module system

`js/lifecycle.js` is a registry. Every module calls
`window.PAGE.register(name, boot)` and gets torn down by the function it
returns. `js/boot.js` mounts them — all of them on desktop, a named list on
the phone.

| file | registers | phone? |
|---|---|---|
| `lifecycle.js` | *(the registry itself)* | yes |
| `isolate.js` | `?off=` layer switches | yes |
| `dormancy.js` | hidden/covered/idle/reduced | yes |
| `hud.js` | `hud`, **`chrome`** | **yes — for `chrome`** |
| `a11y.js` | `a11y` | yes |
| `fps.js` | `fps` | yes |
| `mobile.js` | `mobile` | phone only |
| `tearfn.js` | *(shared GLSL + its JS twin)* | no |
| `face.js` | *(the hidden portrait)* | no |
| `substrate.js` | `substrate` | no |
| `tear.js` | `tear` | no |
| `scroll.js` | `scroll` | no |

**`hud.js` registers two modules.** It looks desktop-only and is not: the
phone mounts `chrome` for the bottom bar and the clock. Dropping it from the
phone's script list removes the bar with no error anywhere.
`tools/check.py` fails the build if that ever happens again.

## Invariants — things in two places that must agree

Kept as short as possible, but a static site with no build step cannot share
constants across CSS, JS, GLSL and Python. These are the survivors:

- **The breakpoint.** Written once, in `css/mobile.css`'s media query. A media
  query cannot take a custom property, so CSS has to own it — everything else
  asks, by reading `--build` (see `css/base.css`).
- **The tear boundary.** `js/tearfn.js` holds the GLSL *and* a JavaScript
  transliteration of the same function, because `js/scroll.js` has to clip the
  footer to an edge a shader draws. The hash is built to be bit-identical in
  float32 and float64; read the header there before touching it.
- **The red.** `--red` in `base.css`, `TEAR_RED` in `tearfn.js` (GLSL floats),
  `RED` in `make-og.py` (Python tuple). Same colour, three encodings.
- **The character.** `js/substrate.js` draws it for the page;
  `tools/wizard-cubist.py` draws it for the share card. The Python is a port
  and can drift — `tools/check.py` warns when the assets are older than the
  geometry.

## Instruments

Built in, on the live site:

| | |
|---|---|
| `?fps` | frame counter with p95 |
| `?off=grain,tear,shell,fluid,reveal,drift,minimap,copy` | kill layers |
| `?face` | hold the hover reveal open full-frame, for tuning the portrait |
| `?skip` | skip the loader |
| `?desktop` | force the desktop build on a phone |
| `?live` / `?static` | force the phone's live renderer, or its static poster |
| `?n=20000` | the phone renderer's point count, for tuning on a real phone |

## Tests and CI

Test-driven, Vitest only, no browser automation.

```bash
npm test                 # everything
npm run test:unit        # tests/unit - one shipped script at a time
npm run test:integration # tests/integration - both builds booted on index.html
npm run test:watch       # the TDD loop
npm run test:coverage    # coverage/index.html
```

**Tests load the shipped files, not copies.** `tests/helpers/site.mjs` runs
`js/*.js` as named classic scripts in jsdom - the same global scope a `<script>`
tag gets - so what is tested is what the browser runs, and coverage maps to the
real files.

**Desktop or phone?** Both, split by what they share:

| suite | runs for | covers |
|---|---|---|
| `integration/markup` | both (one `index.html`) | structure, headings, nav, contact links, anchors, routes, projects, file references |
| `integration/build-switch` | both | which build a screen width gets, and the script list each loads |
| `integration/desktop` | desktop | virtual scroll, phase fade, ground flip, keyboard access, hover reveal |
| `integration/mobile` | phone | capability gate, loading after first paint, fallback to static, the stage driver, frame-rate probe, tap reveal |
| `integration/paging` | phone | one gesture = one page, the 1-second move, input lock, boundaries, touch / wheel / keys, project row and panel left alone |
| `integration/deploy` | the deploy | nothing but the site is published (`.assetsignore`) |

**What jsdom cannot tell you**, so it is not pretended: whether anything
*looks* right, and real-device performance. Rendering (WebGL shaders, the
point cloud, CSS layout) is uncovered by design. Check those by eye, on a real
phone, with `?fps`.

**When it runs.** `.husky/pre-push` runs the suite and the preflight before
anything leaves your machine. `.github/workflows/ci.yml` runs them on every
push and pull request, and deploys `main` to Cloudflare once they pass - see
[DEPLOY.md](DEPLOY.md) for the two secrets that switch deploying on.

## Conventions

- **Vanilla ES5-style JS**, no modules, no transpiler. Scripts are ordered and
  non-deferred; `boot.js` runs last.
- **Comments explain *why*, not *what*.** Most of the long ones in this
  codebase are a bug's post-mortem. They are there because the wrong version
  looked reasonable.
- **Tokens over literals** in CSS. If you are typing a colour or a spacing
  number into a rule, check `base.css` first.
- **`assets/` is generated.** Edit `tools/`, re-run, commit the output.

## What is deliberately not here

No bundler, no TypeScript, no browser automation, no CI matrix. The site
still ships with zero dependencies - `package.json` exists for the test
tooling only and nothing in it reaches a visitor. `tools/check.py` catches the
mistakes that were actually made here; the Vitest suites pin down behaviour.

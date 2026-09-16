# SILLYWIZARD

Personal site. Static — no framework, no bundler, no build step. Open
`index.html` through a local server and that is the site.

```bash
python serve.py        # http://localhost:5599, no-store on everything
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
| scrolling | virtual (`js/scroll.js` owns the wheel; `body` never scrolls) | native |
| subject | two WebGL point clouds, 110k points, per-frame | one static WebP |
| ground flip | fragment shader (`js/tear.js`) | CSS + a generated SVG edge |
| scripts loaded | 12 | 8 |
| first load | ~2.3 MB (2 MB of it `face.jpg`) | ~160 KB |

The phone genuinely never constructs the GL contexts, the point buffers or the
scroll accumulator. Crossing the breakpoint therefore **reloads the page** —
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
tools/            Python generators. Nothing at runtime reads them.
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

No bundler, no TypeScript, no test framework, no CI matrix. The site is four
files and some geometry; the cost of that machinery would exceed the cost of
the bugs it prevents. `tools/check.py` is the whole of the automated safety
net, and every check in it exists because that mistake was actually made here.

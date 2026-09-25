# SILLYWIZARD

Personal portfolio site - [sillywizard.space](https://sillywizard.space)

A single page: five phases a point-cloud subject morphs through, and the
projects hung off them.

## Stack

| | |
|---|---|
| **Markup / styling** | Hand-written HTML and CSS. No framework, no preprocessor. |
| **Graphics** | Raw WebGL - two `gl.POINTS` clouds and a fragment shader for the torn ground. No three.js. |
| **JavaScript** | Vanilla, ES5-style, no modules and no transpiler. One concern per file in `js/`, mounted through a small registry (`js/lifecycle.js`). |
| **Build** | None. The files in the repository are the files that ship. |
| **Tests** | Vitest on jsdom - unit suites per script, integration suites that boot the real `index.html` as each build. |
| **Tooling** | Python (`tools/`) for generated artwork and the preflight check. |
| **CI/CD** | GitHub Actions: tests on every push, `main` deploys to Cloudflare Workers. |
| **Dependencies shipped to a visitor** | None. `package.json` is test tooling only. |

Desktop and phone are two builds of the same site, chosen before first paint:
the desktop runs a virtual scroll and 110k points, the phone pages one chapter
per gesture and runs 30k - or a static poster if the device cannot carry it.

## Running it

```bash
python serve.py         # http://localhost:5599
npm install && npm test # test tooling (once), then the suites
python tools/check.py   # preflight - run before deploying
```

Pushing to `main` runs the suites and deploys to Cloudflare Workers.

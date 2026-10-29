# Application captures

The screenshots behind the project reveals in sections 04 and 05. Each one is
the real application running on this machine, photographed through a browser or
an Android emulator.

## What is real in these, and what is not

**Real:** the applications. Every pixel is the actual product rendering through
its own components, its own CSS and its own charts. Nothing is drawn, mocked up
or retouched.

One exception worth stating plainly: `vantix-logo.webp` is a wordmark, not a
capture at all. See below.

(GoblinKit previously carried two terminal frames rendered by
`tools/make-shots.py` in that repository. They were dropped once the canvas
existed; they are in commit 19f4f3a if they are ever wanted back.)

**Not real:** the data inside them. Each was run against stand-in data supplied
only for the capture and removed afterwards, because the alternative is worse in
both directions - an empty app argues for nothing, and a full one would put a
real network, a real training log or a real workbook on a public page.

| file | project | what is on it | where the data came from |
|---|---|---|---|
| `contractsentinel-overview.webp` | ContractSentinel | Service overview: contract health per service, worst first, with live traces and latency | five invented services, served to the page by intercepting its API calls |
| `contractsentinel-drift.webp` | ContractSentinel | Contract changes, each with severity and the callers it affects | same |
| `carta-map.webp` | Carta | The desktop survey map with a device selected, every claim shown beside its evidence | a synthetic snapshot file of a fictional `192.168.10.0/24`. **No real network was surveyed** |
| `carta-phone.webp` | Carta | The same survey below 760px: the map fills the screen and the device sits in a sheet that slides up from the bottom | same |
| `praxis-report.webp` | Praxis Chess | Game analysis: nine flagged moves with severity, motif, engine best move and a written explanation | the capture set from the Praxis Chess site, taken against its demo library |
| `praxis-today.webp` | Praxis Chess | Today: the day's focus with its evidence, the deck counters and the streak | same |
| `forte-progress.webp` | Forte | One lift's working weight climbing across eight weeks | a temporary seed written into a throwaway SQLite database on an emulator |
| `forte-active.webp` | Forte | A workout in progress: two sets logged, the rest clock counting up, the next set filled in from last time | the same throwaway database, then two sets logged by hand on the emulator |
| `sheaf-plan.webp` | Sheaf | A question compiled into a typed plan you can read before it runs | a stand-in plan response, supplied to the task pane by the capture script |
| `sheaf-ask.webp` | Sheaf | The task pane with a question typed and not yet planned | same |
| `goblinkit-canvas.webp` | GoblinKit | The editor: an order-triage workflow drawn as boxes and arrows, with a branch, a loop and a merge | the repository's own `examples/order-triage.json`, opened in the canvas |
| `redkeep-dashboard.webp` | Redkeep | The launcher: the isolated lab, a scan's scope and profile, findings by severity over five runs, and past reports | the Redkeep repository's own `docs/images/ui-dashboard.png`. Every target is its sealed lab copy (`juice-shop`); no real system was scanned |
| `redkeep-report.webp` | Redkeep | One generated report: findings from ZAP, nuclei and Nmap in one table with severity, tool and CWE | the repository's own `docs/images/ui-report.png`, a report on the lab's example app; the only address in it is a private Docker one |

## The two that are not captures

| file | project | what it is |
|---|---|---|
| `vantix-logo.webp` | Vantix | The wordmark, from `Vantix/vantix-logo-solid.png`. The CLI and Studio are still scaffolding - `vantix` prints its usage and the Studio boots an empty context - so the mark stands in rather than a screenshot of a help message. It is framed as a mark (`.rv__shot--mark`), never cropped. |

Gremlin was on the page with no capture and no repository, as a description
alone. It came off when the section became OPEN SOURCE: it was the one card
with no public code to point at.

## When each was taken

The Carta, Forte and Praxis Chess frames were re-taken on 2026-10-28 against the
current builds: Carta had gained a phone layout, Forte an Active Workout screen
and a restyle, and Praxis Chess a redesign. The Praxis pair is the Praxis Chess
site's own capture set, re-shot there on 2026-10-20.

## Format

WebP, quality 86. Desktop captures come off a 1440×900 viewport at
`deviceScaleFactor: 2` and are stored 1600 wide; the widest frame renders at
roughly 300 CSS pixels, so that is well past 2×. The two phone captures are
1080×2400 from the emulator, stored 640 wide, and sit inside their frame rather
than being cropped to it (`.rv__shot--tall`).

## Re-capturing

There is no committed capture script - each application needs its own stand-in
data, and the data is the part that must not be guessed. What each capture
needed is in the table above.

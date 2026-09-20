# Application captures

The screenshots behind the project reveals in sections 04 and 05. Each one is
the real application running on this machine, photographed through a browser or
an Android emulator.

## What is real in these, and what is not

**Real:** the applications. Every pixel is the actual product rendering through
its own components, its own CSS and its own charts. Nothing is drawn, mocked up
or retouched.

The two GoblinKit frames are the exception worth stating plainly: it is a
command-line tool with no interface to photograph, so `tools/make-shots.py` in
that repository *renders* its output into a terminal frame. The characters are
the verbatim output of the commands shown; the window around them is drawn.

**Not real:** the data inside them. Each was run against stand-in data supplied
only for the capture and removed afterwards, because the alternative is worse in
both directions — an empty app argues for nothing, and a full one would put a
real network, a real training log or a real workbook on a public page.

| file | project | what is on it | where the data came from |
|---|---|---|---|
| `contractsentinel-overview.webp` | ContractSentinel | Service overview: contract health per service, worst first, with live traces and latency | five invented services, served to the page by intercepting its API calls |
| `contractsentinel-drift.webp` | ContractSentinel | Contract changes, each with severity and the callers it affects | same |
| `carta-map.webp` | Carta | The survey map with a device selected, every claim shown beside its evidence | a synthetic snapshot file of a fictional `192.168.10.0/24`. **No real network was surveyed** |
| `carta-findings.webp` | Carta | What the survey concluded, each finding marked with how strongly it is held | same |
| `praxis-report.webp` | Praxis Chess | Game analysis: nine flagged moves with severity, motif, engine best move and a written explanation | the capture set from the Praxis Chess site, taken against its demo library |
| `praxis-today.webp` | Praxis Chess | Today: the day's focus with its evidence, the deck counters and the streak | same |
| `forte-progress.webp` | Forte | One lift's working weight climbing across eight weeks | a temporary seed written into a throwaway SQLite database on an emulator |
| `forte-history.webp` | Forte | Every finished session with its duration, set count and volume | same |
| `sheaf-plan.webp` | Sheaf | A question compiled into a typed plan you can read before it runs | a stand-in plan response, supplied to the task pane by the capture script |
| `sheaf-ask.webp` | Sheaf | The task pane with a question typed and not yet planned | same |
| `goblinkit-run.webp` | GoblinKit | One workflow run: a branch taken, the other skipped, a merge, and a loop addressed per pass | the repository's own `examples/order-triage.json`, run with an invented order |
| `goblinkit-replay.webp` | GoblinKit | The same run replayed out of its journal | same |

## Projects with no capture here

Three of the nine named on the page have no running interface to photograph, so
they carry their description alone rather than an empty frame:

| project | why |
|---|---|
| **Vantix** | The CLI and Studio are scaffolding — `vantix` prints its usage and the Studio boots an empty context. A screenshot would be a help message. |
| **Gremlin** | Planning documents only — "no code until milestones are approved". |

## Format

WebP, quality 86. Desktop captures come off a 1440×900 viewport at
`deviceScaleFactor: 2` and are stored 1600 wide; the widest frame renders at
roughly 300 CSS pixels, so that is well past 2×. The two phone captures are
1080×2400 from the emulator, stored 640 wide, and sit inside their frame rather
than being cropped to it (`.rv__shot--tall`).

## Re-capturing

There is no committed capture script — each application needs its own stand-in
data, and the data is the part that must not be guessed. What each capture
needed is in the table above.

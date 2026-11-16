# Project marks

The small symbol in the top-right corner of each project card in OPEN SOURCE.
Every one is cropped from that project's own logo file. Nothing here was drawn
or redrawn: the only edits are trimming empty space, cutting a wordmark down to
its symbol, and clearing a background.

| file | from | what was done to it |
|---|---|---|
| `praxis.webp` | `Praxis-Chess/frontend/public/praxis_logo.png` | trimmed |
| `redkeep.webp` | `redkeep/resources/redkeep-logo/png/transparent/redkeep-mark-dark-1024.png` | trimmed, scaled to 96px tall |
| `forte.webp` | `Forte/Resources/logo-light.png` | the only Forte logo is opaque, so the background *outside* the badge was cleared by filling inward from the corners; the badge's own white interior is kept |
| `sheaf.webp` | `Sheaf/Resources/Sheaf-logo-light-glass.png` | the stacked-sheets symbol only - the word "Sheaf" after it was cut away |
| `vantix.webp` | `Vantix/vantix-logo-transparent.png` | the "VX" symbol only - the word "Vantix" after it was cut away |
| `goblinkit.webp` | `GoblinKit/assets/logo/goblinkit-mark.png` | trimmed, scaled to 96px tall |
| `carta.webp` | `Carta/assets/carta-logo.png` | trimmed, scaled to 96px tall |

## Why symbols, and why grey

A card can spare about 34px beside the project name. At that size the two
wordmarks (Sheaf about 4:1, Vantix about 5:1) would have taken most of a card's
width, so each card carries the project's symbol instead.

In colour the six are pink, black, black, green, blue and green, which side by
side reads like a sponsor strip on a page that is otherwise ink, red and paper.
So they rest in greyscale (`.pcard__mark` in `css/site.css`) and come into full
colour when their card is hovered, focused, or has its panel open.

## Format

Lossless WebP with alpha, at most 96px tall, which covers a 34px mark at nearly
3x. Intrinsic sizes are written into each `<img>` so the card reserves the
space before the file arrives.

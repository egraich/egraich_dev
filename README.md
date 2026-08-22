# egraich.dev

My personal portfolio — projects, skills and contacts. Live at [egraich.dev](https://egraich.dev).

Plain **HTML + CSS + JS**, Hosted on Cloudflare Pages.

## Performance model

The site detects the device and picks one of three tiers before any heavy
work starts:

| Tier | Who gets it | Background | Extras |
|------|-------------|------------|--------|
| low  | phones, `prefers-reduced-motion` | static CSS gradients | none |
| medium | tablets, weak laptops | lightweight 2D canvas particles | card tilt |
| high | desktops (≥4 cores) | three.js particle wave (lazy dynamic import) | custom cursor |

On the high tier an **FPS probe** runs for the first 120 frames — if the
device can't hold ~50 fps, three.js is disposed and the 2D fallback takes
over. Rendering also pauses when the tab is hidden or the hero is scrolled
out of view. three.js is only ever fetched via `await import(...)` inside
the high-tier branch, so weaker devices never download a byte of it.

Made by [egraich](https://egraich.dev)

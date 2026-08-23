# egraich.dev

My personal portfolio — projects, skills and contacts. Live at [egraich.dev](https://egraich.dev).

Plain **HTML + CSS + JS**, Hosted on Cloudflare Pages.

## Performance model

The site detects the device and picks one of three tiers before any heavy
work starts:

| Tier | Who gets it | Background | Extras |
|------|-------------|------------|--------|
| low  | phones, `prefers-reduced-motion` | static CSS gradients | none |
| medium | tablets, weak laptops | 2D canvas particles + sonar rings, aurora glow | card tilt, magnetic buttons, text decode |
| high | desktops (≥4 cores) | three.js shader wave with pointer ripples (lazy dynamic import) | card tilt, magnetic buttons, text decode, custom cursor |

On the high tier an **FPS probe** runs for the first 120 frames — if the
device can't hold ~50 fps, three.js is disposed and the 2D fallback takes
over. Rendering pauses when the tab is hidden (the background is fixed and
stays visible through the whole page, so it never freezes on scroll).
The wave itself is a hand-written GLSL shader — the CPU never touches the
vertex data; pointer moves and clicks spawn ripples that travel through
the grid (the same idea runs on the medium tier as 2D sonar rings).
three.js is only ever fetched via `await import(...)` inside the
high-tier branch, so weaker devices never download a byte of it.

Made by [egraich](https://egraich.dev) <3
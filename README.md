# MELLA.lv

Single-page site for **MELLA.lv** — hair extension salon, shop and training
centre in Rīga (A. Čaka iela 33). Trilingual (LV / RU / EN), mobile-first,
built as one self-contained `index.html`.

## Run it

The site is a single static file — opening `index.html` in a browser works.
For anything involving screenshots or breakpoint testing, serve it over HTTP
instead of `file://`:

```bash
npm install          # only needed for the screenshot tooling
node serve.mjs       # http://localhost:3000
PORT=3100 node serve.mjs   # if 3000 is taken
```

Deploying is just as simple: any static host will do. To publish it with
GitHub Pages, enable Pages on this repo and point it at the `main` branch,
root folder.

## What's in here

| Path | Purpose |
| --- | --- |
| `index.html` | The entire site — markup, CSS and JS inline. No build step. |
| `serve.mjs` | Static file server for local development. |
| `screenshot.mjs` | Puppeteer screenshots at any viewport → `temporary screenshots/`. |
| `preview.mjs` | Opens the site in a phone-sized Chrome window. |
| `mobile-diff.mjs` | Visual-regression check: proves mobile rendering is unchanged. |
| `laptop 1-6.webp`, `original-*.webp` | Design reference boards the layout follows. |
| `CLAUDE.webdesign.md` | Frontend conventions for this project. |

## Structure of `index.html`

Everything lives in one file, in three blocks:

1. **`<style>`** — design tokens (`--bg`, `--accent`, spacing scale, easing,
   layered shadows) followed by component styles. Mobile-first; desktop-only
   sections carry a `deskonly` class.
2. **Markup** — header, nav, hero, then sections: `par-mums`, `pakalpojumi`,
   `galerija`, `ture`, `meistari`, `veikals`, `kursi`, `uzticiba`,
   `atsauksmes`, `pieteikties`, plus footer and a sticky CTA dock.
3. **`<script>`** — content data, the LV/RU/EN dictionary driving `data-i18n`
   attributes, and interactions (nav, gallery, service switcher, reveal-on-scroll).

Adding a language means extending the dictionary; adding content means
extending the data arrays — neither requires touching the markup.

## Imagery

Photography is loaded from the live site at `https://mella.lv/` via the `BASE`
constant in the script block, so the prototype always shows current salon
content. The trade-off: the page needs `mella.lv` reachable to look complete.
To make this repo fully self-contained, download those assets into a local
`images/` folder and repoint `BASE` at it.

## Fonts

Oswald (display), Manrope (body) and Playfair Display (italic accents), loaded
from Google Fonts with `latin`, `latin-ext` and `cyrillic` subsets — the
Cyrillic subset is required for the Russian translation.

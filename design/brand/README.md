# Victual Brand Assets

Logo files for the website and the app. Every file is plain SVG with the wordmark converted to outlines, so nothing depends on a font being installed.

> These are a faithful redraw of the Figma logo, not the original export. If you'd rather use the Figma originals, drop them in here with the same file names and everything that references them keeps working.

## Files

Variants are named for the background they sit on.

| File | Use |
| --- | --- |
| `lockup-color-on-light.svg` | Primary logo: mauve steam, forest bowl and wordmark |
| `lockup-color-on-dark.svg` | Primary logo on dark: mauve steam, sage bowl, cream wordmark |
| `lockup-mono-on-light.svg` / `lockup-mono-on-dark.svg` | One-color black / cream |
| `wordmark-*.svg` | Wordmark only (black, cream, forest) |
| `mark-*.svg` | Bowl mark only, same four color variants |
| `app-icon-rounded.svg` | iOS-style icon preview (forest tile, sage bowl, mauve steam) |
| `app-icon-square.svg` | Square tile, the source for the store icon (stores apply their own mask) |
| `app-icon-foreground.svg` | Android adaptive icon foreground (transparent, mark in the safe zone) |

## In code

Both apps render the logo from shared geometry instead of image files, so colors follow the theme:

- Website: `frontend/src/brand/Logo.tsx`
- App: `mobile/src/brand/Logo.tsx`

Both read `src/brand/geometry.ts`, which is generated.

## Regenerating

`build_logo.py` builds every SVG here plus both `geometry.ts` files. The wordmark is "victual" in DM Sans Bold (700), kerned with HarfBuzz and outlined with fontTools.

```bash
pip install fonttools brotli uharfbuzz
# Convert the DM Sans 700 latin .woff2 (from @fontsource/dm-sans) to .ttf first
python design/brand/build_logo.py path/to/dmsans700.ttf .
```

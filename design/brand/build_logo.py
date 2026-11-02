"""Builds Victual logo SVGs + a shared path-data module for both apps.

Wordmark: "victual" set in DM Sans SemiBold (600), shaped with HarfBuzz (kerning)
and converted to outlines, so no font is needed to render it.
Mark: steaming V-bowl, redrawn as strokes on a 64x64 grid.
"""
import json
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT = sys.argv[1]
OUT = Path(sys.argv[2])  # repo root
OUT_BRAND = OUT / "design" / "brand"
OUT_BRAND.mkdir(parents=True, exist_ok=True)

PAL = {
    "black": "#000000",
    "cream": "#F7F2EE",
    "mauve": "#C59DB0",
    "forest": "#1F3326",
    "sage": "#9BC59D",
}

# ---------- Mark (64x64 grid, strokes) ----------
MARK_VIEWBOX = (0, 0, 64, 64)
STEAM_PATHS = [
    # three small S-curves, top to bottom
    f"M{x} 6c-2.3 2.1-2.3 4.2 0 6.25s2.3 4.2 0 6.25" for x in (23.5, 32, 40.5)
]
BOWL_RIM = "M4 24H60"
BOWL_V = "M13 24L32 56L51 24"
STEAM_W = 2.3
BOWL_W = 4.8


def mark_group(steam, bowl, dx=0.0, dy=0.0, scale=1.0):
    t = f' transform="translate({dx:.3f} {dy:.3f}) scale({scale:.5f})"' if (dx or dy or scale != 1) else ""
    steam_d = " ".join(STEAM_PATHS)
    return (
        f'<g{t} fill="none" stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="{steam_d}" stroke="{steam}" stroke-width="{STEAM_W}"/>'
        f'<path d="{BOWL_RIM} {BOWL_V}" stroke="{bowl}" stroke-width="{BOWL_W}"/>'
        f"</g>"
    )


# ---------- Wordmark ----------
blob = hb.Blob.from_file_path(FONT)
face = hb.Face(blob)
font = hb.Font(face)
buf = hb.Buffer()
buf.add_str("victual")
buf.guess_segment_properties()
hb.shape(font, buf, {"kern": True, "liga": True})

tt = TTFont(FONT)
gs = tt.getGlyphSet()
order = tt.getGlyphOrder()
upm = tt["head"].unitsPerEm

pen = SVGPathPen(gs)
x = 0
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    name = order[info.codepoint]
    # flip Y (font units are y-up), baseline at y=0
    gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)))
    x += pos.x_advance
word_d = pen.getCommands()

# tight bounds
from fontTools.pens.boundsPen import BoundsPen

bp = BoundsPen(gs)
x = 0
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    name = order[info.codepoint]
    gs[name].draw(TransformPen(bp, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)))
    x += pos.x_advance
xmin, ymin, xmax, ymax = bp.bounds  # y is flipped: ymin = -ascender of 'l'/'t'
word_w, word_h = xmax - xmin, ymax - ymin
print("upm", upm, "word bounds", bp.bounds)


def word_svg_path(fill, dx=0.0, dy=0.0, scale=1.0):
    return (
        f'<path transform="translate({dx:.3f} {dy:.3f}) scale({scale:.6f}) translate({-xmin} {-ymin})" '
        f'd="{word_d}" fill="{fill}"/>'
    )


def svg(w, h, body, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{body}</svg>\n"
    )


# Lockup geometry (measured from the Figma export): wordmark ascender-to-baseline
# height H = 100. Mark rim is ~1.25H wide, steam top sits ~0.056H above the
# ascenders, V apex dips ~0.095H below the baseline, gap mark->text ~0.32H.
H = 100.0
w_scale = H / word_h
word_W = word_w * w_scale
MARK_TOP, MARK_BOT, MARK_LEFT, MARK_RIGHT = 4.85, 58.4, 1.6, 62.4
m_scale = (1.25 * H) / 56.0
mark_W = (MARK_RIGHT - MARK_LEFT) * m_scale
mark_top_y = -0.056 * H
mark_bot_y = mark_top_y + (MARK_BOT - MARK_TOP) * m_scale
GAP = 0.30 * H
lock_W = mark_W + GAP + word_W
lock_top = min(0.0, mark_top_y)
lock_bot = max(H, mark_bot_y)
lock_H = lock_bot - lock_top
variants = {
    # name: (steam, bowl, text)
    "mono-on-light": (PAL["black"], PAL["black"], PAL["black"]),
    "mono-on-dark": (PAL["cream"], PAL["cream"], PAL["cream"]),
    "color-on-light": (PAL["mauve"], PAL["forest"], PAL["forest"]),
    "color-on-dark": (PAL["mauve"], PAL["sage"], PAL["cream"]),
}

for name, (steam, bowl, text) in variants.items():
    body = mark_group(steam, bowl, dx=-MARK_LEFT * m_scale, dy=mark_top_y - lock_top - MARK_TOP * m_scale, scale=m_scale)
    body += word_svg_path(text, dx=mark_W + GAP, dy=-lock_top, scale=w_scale)
    (OUT_BRAND / f"lockup-{name}.svg").write_text(svg(lock_W, lock_H, body, "Victual"))

    mark_body = mark_group(steam, bowl)
    (OUT_BRAND / f"mark-{name}.svg").write_text(svg(64, 64, mark_body, "Victual"))

for name, fill in {
    "mono-on-light": PAL["black"],
    "mono-on-dark": PAL["cream"],
    "color-on-light": PAL["forest"],
}.items():
    (OUT_BRAND / f"wordmark-{name}.svg").write_text(
        svg(word_W, H, word_svg_path(fill, scale=w_scale), "Victual")
    )

# App icons (1024 grid). Mark occupies ~62% of the tile, centered optically.
def icon(rounded: bool, size=1024, mark_frac=0.72):
    s = size * mark_frac / 64
    off = (size - 64 * s) / 2
    rx = f' rx="{size*0.225:.1f}"' if rounded else ""
    body = f'<rect width="{size}" height="{size}"{rx} fill="{PAL["forest"]}"/>'
    body += mark_group(PAL["mauve"], PAL["sage"], dx=off, dy=off + size * 0.02, scale=s)
    return svg(size, size, body, "Victual app icon")

(OUT_BRAND / "app-icon-rounded.svg").write_text(icon(True))
(OUT_BRAND / "app-icon-square.svg").write_text(icon(False))
# Android adaptive icon foreground: transparent, mark inside the 66% safe zone
s = 1024 * 0.50 / 64
off = (1024 - 64 * s) / 2
(OUT_BRAND / "app-icon-foreground.svg").write_text(
    svg(1024, 1024, mark_group(PAL["mauve"], PAL["sage"], dx=off, dy=off, scale=s), "Victual")
)

# ---------- Shared path data for React / React Native components ----------
brand = {
    "mark": {
        "viewBox": "0 0 64 64",
        "steam": " ".join(STEAM_PATHS),
        "bowl": f"{BOWL_RIM} {BOWL_V}",
        "steamWidth": STEAM_W,
        "bowlWidth": BOWL_W,
        "crop": {"x": MARK_LEFT, "y": MARK_TOP, "width": MARK_RIGHT - MARK_LEFT, "height": MARK_BOT - MARK_TOP},
    },
    "wordmark": {
        "path": word_d,
        "minX": xmin,
        "minY": ymin,
        "width": word_w,
        "height": word_h,
    },
    "lockup": {
        "markScale": m_scale / w_scale,
        "markTop": mark_top_y / w_scale,
        "gap": GAP / w_scale,
    },
}
ts = (
    "// AUTO-GENERATED logo geometry (see design/brand/README.md). Do not edit by hand.\n"
    f"export const brandGeometry = {json.dumps(brand, indent=2)} as const;\n"
)
for rel in ("frontend/src/brand/geometry.ts", "mobile/src/brand/geometry.ts"):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(ts)
print("done")

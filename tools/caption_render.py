#!/usr/bin/env python3
"""Cross-platform caption rasterizer — the Linux/Render replacement for
tools/caption_render.swift (which imports AppKit and cannot run off macOS).

Contract is IDENTICAL to the Swift tool so src/localRenderer.ts only has to choose a
different executable:

    caption_render.py <spec.json>

    spec.json = {
      "width":    1080,
      "outDir":   "/path/to/pngs",
      "fontSize": 58,
      "lines":   [{"id": "c0", "text": "full line", "emphasis": "word"}]
    }

    writes <outDir>/<id>.png — transparent RGBA, width = spec.width, height auto.

Why Pillow rather than ffmpeg drawtext:
  * PRODUCTION_DOCTRINE already records that the local ffmpeg has no drawtext/libass,
    so a drawtext renderer could never be verified on the dev machine.
  * Pillow gives exact per-segment text metrics (font.getbbox), which is what makes
    the emphasis word land in the right place on a proportional font. drawtext can
    only report the width of its own single instance, so mixed-weight lines would
    have to be positioned by guesswork.
  * It matches the approach already proven on BRINE-POOL.

Brand contract mirrors CAPTION_STYLE in src/captions.ts: cream #F5EFE2, base weight
600, emphasis weight 800 at 1.12x scale, centred, with a soft shadow for legibility
over bright footage.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

TEXT_COLOR = (245, 239, 226, 255)      # #F5EFE2
SHADOW_COLOR = (11, 11, 15, 170)       # #0B0B0F, semi-opaque
EMPHASIS_SCALE = 1.12
SIDE_PADDING = 64                      # keeps text inside the mobile safe area
SHADOW_OFFSET = 3
LINE_GAP = 10


def _candidates(bold: bool):
    """Font search order: brand font first, then the families the Docker image
    installs, then whatever the OS provides. Never silently fall back to a bitmap
    default — a wrong typeface is a brand defect that no test would catch."""
    if bold:
        return [
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/HelveticaNeue.ttc",
        ]
    return [
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
    ]


def load_font(size: int, bold: bool):
    for path in _candidates(bold):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    raise SystemExit(
        "caption_render: no usable TrueType font found. On Debian install "
        "fonts-liberation2 or fonts-dejavu-core (the Dockerfile does this)."
    )


def measure(draw, text, font):
    if not text:
        return 0, 0
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def style_mask(text: str, emphasis: str):
    """Per-character emphasis flags. Character-level rather than segment-level so
    punctuation glued to an emphasised word ("death.") keeps the period attached —
    splitting on segments produced "death ." with a spurious space."""
    mask = [False] * len(text)
    if emphasis:
        i = text.find(emphasis)
        if i >= 0:
            for k in range(i, i + len(emphasis)):
                mask[k] = True
    return mask


def tokenize(text: str, emphasis: str):
    """-> [word], where word = [(run_text, is_emphasis)].

    Words are whitespace-delimited; a single word may contain BOTH styles, and its
    runs are drawn with no space between them."""
    mask = style_mask(text, emphasis)
    words, cur = [], []
    for ch, em in list(zip(text, mask)) + [(" ", False)]:
        if ch == " ":
            if cur:
                words.append(cur)
                cur = []
            continue
        if cur and cur[-1][1] == em:
            cur[-1] = (cur[-1][0] + ch, em)
        else:
            cur.append((ch, em))
    return words


def word_width(draw, word, base_font, emph_font):
    return sum(measure(draw, run, emph_font if em else base_font)[0] for run, em in word)


def wrap(draw, words, base_font, emph_font, max_width, space_w):
    """Greedy word wrap over whole words, so styling never breaks a word apart."""
    lines, cur, cur_w = [], [], 0.0
    for word in words:
        w = word_width(draw, word, base_font, emph_font)
        add = w + (space_w if cur else 0)
        if cur and cur_w + add > max_width:
            lines.append(cur)
            cur, cur_w = [word], w
        else:
            cur.append(word)
            cur_w += add
    if cur:
        lines.append(cur)
    return lines or [[]]


def render_line(spec_width, font_size, text, emphasis, out_path):
    base_font = load_font(font_size, bold=False)
    emph_font = load_font(int(round(font_size * EMPHASIS_SCALE)), bold=True)

    probe = Image.new("RGBA", (8, 8))
    d = ImageDraw.Draw(probe)
    space_w = measure(d, " ", base_font)[0]

    words = tokenize(text, emphasis)
    rows = wrap(d, words, base_font, emph_font, spec_width - SIDE_PADDING * 2, space_w)

    row_h = int(round(font_size * EMPHASIS_SCALE * 1.32))
    height = row_h * len(rows) + LINE_GAP * (len(rows) - 1) + SHADOW_OFFSET * 2 + 8

    img = Image.new("RGBA", (spec_width, max(height, row_h)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    y = 4
    for row in rows:
        total = sum(word_width(draw, w, base_font, emph_font) for w in row)
        total += space_w * max(0, len(row) - 1)
        x = (spec_width - total) / 2.0
        for i, word in enumerate(row):
            if i:
                x += space_w
            for run, em in word:                      # runs are adjacent: no space
                font = emph_font if em else base_font
                draw.text((x + SHADOW_OFFSET, y + SHADOW_OFFSET), run, font=font, fill=SHADOW_COLOR)
                draw.text((x, y), run, font=font, fill=TEXT_COLOR)
                x += measure(draw, run, font)[0]
        y += row_h + LINE_GAP

    img.save(out_path, "PNG")


def render_card(spec, out_dir):
    """Full-frame static card: title near the top, body lines stacked below.

    Emitted as transparent RGBA at the full canvas size because ffmpeg overlays it
    straight onto the drifting gradient background — a card with a baked background
    would hide the motion the composition depends on."""
    width = int(spec.get("width", 1080))
    height = int(spec.get("height", 1920))
    font_size = int(spec.get("fontSize", 47))

    title_font = load_font(int(round(font_size * 1.5)), bold=True)
    body_font = load_font(font_size, bold=False)
    emph_font = load_font(int(round(font_size * EMPHASIS_SCALE)), bold=True)

    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    space_w = measure(draw, " ", body_font)[0]
    max_w = width - SIDE_PADDING * 2

    def draw_rows(rows, base, emph, y, row_h):
        for row in rows:
            total = sum(word_width(draw, w, base, emph) for w in row)
            total += space_w * max(0, len(row) - 1)
            x = (width - total) / 2.0
            for i, word in enumerate(row):
                if i:
                    x += space_w
                for run, em in word:
                    f = emph if em else base
                    draw.text((x + SHADOW_OFFSET, y + SHADOW_OFFSET), run, font=f, fill=SHADOW_COLOR)
                    draw.text((x, y), run, font=f, fill=TEXT_COLOR)
                    x += measure(draw, run, f)[0]
            y += row_h + LINE_GAP
        return y

    title = (spec.get("title") or "").strip()
    y = int(height * 0.16)
    if title:
        t_rows = wrap(draw, tokenize(title, ""), title_font, title_font, max_w, space_w)
        y = draw_rows(t_rows, title_font, title_font, y, int(round(font_size * 1.5 * 1.3)))
        y += int(font_size * 1.1)

    body_row_h = int(round(font_size * EMPHASIS_SCALE * 1.34))
    for line in spec.get("lines", []):
        rows = wrap(draw, tokenize(line.get("text", ""), line.get("emphasis", "") or ""),
                    body_font, emph_font, max_w, space_w)
        y = draw_rows(rows, body_font, emph_font, y, body_row_h)
        y += int(font_size * 0.5)

    img.save(os.path.join(out_dir, "card.png"), "PNG")


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: caption_render.py <spec.json>")
    spec = json.load(open(sys.argv[1]))
    width = int(spec.get("width", 1080))
    font_size = int(spec.get("fontSize", 58))
    out_dir = spec["outDir"]
    os.makedirs(out_dir, exist_ok=True)

    if spec.get("mode") == "card":
        render_card(spec, out_dir)
        print(f"caption_render: wrote card.png to {out_dir}")
        return

    for line in spec.get("lines", []):
        render_line(
            width, font_size,
            line.get("text", ""), line.get("emphasis", "") or "",
            os.path.join(out_dir, f"{line['id']}.png"),
        )
    print(f"caption_render: wrote {len(spec.get('lines', []))} png(s) to {out_dir}")


if __name__ == "__main__":
    main()

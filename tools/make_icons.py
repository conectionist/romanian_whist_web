#!/usr/bin/env python3
"""Draw the page's home-screen icons from its logo: public/icons/.

    python3 tools/make_icons.py

The logo is the round medal of the table (src/table/styles/table.css, .medal): a green disc in a gold
ring, the words Romanian Whist in Cinzel Decorative between two ornaments. It is drawn here from the same
colours and the font's own file, so the icons are the table's logo and not a copy of a picture of it. The
files it writes are committed:

    icon-192.png, icon-512.png            the logo on a transparent ground
    icon-maskable-512.png                 the logo inside the 80 percent safe zone, on the room's colour
    apple-touch-icon.png                  180 by 180, the logo on the room's colour, for the home screen of an iPhone

Needs Pillow, fontTools and brotli (tools/requirements.txt).
"""

import io
import pathlib

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = ROOT / 'public' / 'fonts' / 'cinzel-decorative' / 'CinzelDecorative-Bold.woff2'
OUT = ROOT / 'public' / 'icons'

# The table's colours, src/table/styles/theme.css.
ROOM = (28, 17, 10)
DISC_CENTRE = (42, 97, 66)
DISC_MIDDLE = (23, 64, 42)
DISC_EDGE = (15, 44, 29)
RING = (184, 146, 74)
INNER_LINE = (232, 200, 130)
LETTER_TOP = (251, 231, 178)
LETTER_MIDDLE = (226, 184, 102)
LETTER_BOTTOM = (167, 122, 53)
ORNAMENT = (217, 180, 106)

SCALE = 4


def font_at(size):
    """The font's TrueType file, which Pillow can read, made from the woff2 the page serves."""
    face = TTFont(FONT)
    face.flavor = None
    data = io.BytesIO()
    face.save(data)
    data.seek(0)
    return ImageFont.truetype(data, size)


def lerp(a, b, k):
    return tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))


def disc(size):
    """The green disc: a radial gradient from its upper middle out, as the table's logo has it."""
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pixels = image.load()
    cx, cy = size / 2, size * 0.4
    reach = size * 0.62
    for y in range(size):
        for x in range(size):
            k = min(1.0, ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / reach)
            colour = lerp(DISC_CENTRE, DISC_MIDDLE, k / 0.7) if k < 0.7 else lerp(DISC_MIDDLE, DISC_EDGE, (k - 0.7) / 0.3)
            pixels[x, y] = colour + (255,)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    image.putalpha(mask)
    return image


def lettering(size):
    """Romanian over Whist, gold from light at the top to dark at the foot, between two ornament rules."""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    font = font_at(round(size * 0.17))
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    lines = ['Romanian', 'Whist']
    heights = [font.getbbox(line)[3] - font.getbbox(line)[1] for line in lines]
    gap = size * 0.035
    total = sum(heights) + gap
    top = (size - total) / 2
    top_of_text = top
    for line, height in zip(lines, heights):
        width = font.getlength(line)
        draw.text(((size - width) / 2, top - font.getbbox(line)[1]), line, font=font, fill=255)
        top += height + gap
    gradient = Image.new('RGBA', (size, size))
    gp = gradient.load()
    for y in range(size):
        k = max(0.0, min(1.0, (y - top_of_text) / total))
        colour = lerp(LETTER_TOP, LETTER_MIDDLE, k / 0.48) if k < 0.48 else lerp(LETTER_MIDDLE, LETTER_BOTTOM, (k - 0.48) / 0.52)
        for x in range(size):
            gp[x, y] = colour + (255,)
    layer.paste(gradient, (0, 0), mask)
    draw = ImageDraw.Draw(layer)
    for y in (top_of_text - size * 0.075, top_of_text + total + size * 0.075):
        half = size * 0.2
        draw.line((size / 2 - half, y, size / 2 - size * 0.025, y), fill=ORNAMENT + (255,), width=max(2, round(size * 0.006)))
        draw.line((size / 2 + size * 0.025, y, size / 2 + half, y), fill=ORNAMENT + (255,), width=max(2, round(size * 0.006)))
        d = size * 0.015
        draw.polygon([(size / 2, y - d), (size / 2 + d, y), (size / 2, y + d), (size / 2 - d, y)], fill=ORNAMENT + (255,))
    return layer


def medal(size):
    """The whole logo, `size` across, drawn larger and brought down so its edges are smooth."""
    big = size * SCALE
    image = disc(big)
    draw = ImageDraw.Draw(image)
    ring = max(2, round(big * 0.014))
    draw.ellipse((0, 0, big - 1, big - 1), outline=RING + (255,), width=ring)
    inset = round(big * 0.04)
    draw.ellipse((inset, inset, big - 1 - inset, big - 1 - inset), outline=INNER_LINE + (140,), width=max(1, ring // 2))
    image.alpha_composite(lettering(big))
    return image.resize((size, size), Image.LANCZOS)


def on_ground(logo, size, share, ground):
    """The logo `share` of the picture across, centred, on a ground of one colour, or a clear one."""
    canvas = Image.new('RGBA', (size, size), ground + ((255,) if len(ground) == 3 else ()))
    inner = round(size * share)
    canvas.alpha_composite(logo.resize((inner, inner), Image.LANCZOS), ((size - inner) // 2, (size - inner) // 2))
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    logo = medal(1024)
    for size in (192, 512):
        on_ground(logo, size, 0.96, (0, 0, 0, 0)).save(OUT / f'icon-{size}.png', optimize=True)
    # A maskable icon is cropped to a circle or a rounded square by the system, so the logo stays in the middle
    # 80 percent, the safe zone, on the room's colour.
    on_ground(logo, 512, 0.78, ROOM).save(OUT / 'icon-maskable-512.png', optimize=True)
    on_ground(logo, 180, 0.86, ROOM).convert('RGB').save(OUT / 'apple-touch-icon.png', optimize=True)
    for each in sorted(OUT.glob('*.png')):
        print(f'wrote {each.relative_to(ROOT)} ({each.stat().st_size} bytes)')


if __name__ == '__main__':
    main()

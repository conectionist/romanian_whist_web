#!/usr/bin/env python3
"""Measure how far the page's sheets sit from the desktop client's, element by element.

    python3 tools/measure_shots.py [sheet-round ...]

For each sheet picture it finds the panel in the desktop's picture and the page's, and for each
region of the sheet (title, a table's heading, its first row, the buttons...) searches for the shift
in whole pixels that makes the page's crop match the desktop's best. A shift of 0,0 is a region that
sits where the desktop's does; dy 3 is a region 3 pixels too low. Regions are given relative to the
panel's top, so a panel centred a pixel differently does not read as every element moving.

The calibrated line heights and spacings in src/sheets/styles/sheet.css are numbers taken this way:
change a face, a font size or a sheet, run `npm run look`, run this, and adjust the sheet's custom
properties (--meta-extra, --tall, --actions-top) until the regions read 0,0.

Needs Pillow (tools/requirements.txt), and both folders of pictures that tools/pair_shots.py reads.
"""

import argparse
import pathlib
import sys

from PIL import Image, ImageChops, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent

# The panel's border is this exact colour in the desktop's pictures and the page's.
BORDER = (128, 97, 55)

# Regions: (left, top, right, bottom), left and right in the picture, top and bottom from the panel's top.
REGIONS = {
    'sheet-round': {'title': (630, 28, 1000, 66), 'meta': (630, 68, 1100, 88), 'heading': (630, 110, 1290, 126),
                    'row1': (630, 136, 1290, 158), 'row6': (630, 302, 1290, 324), 'warning': (630, 342, 1000, 358),
                    'buttons': (1010, 374, 1290, 422)},
    'sheet-pause': {'title': (630, 28, 1000, 66), 'buttons': (1040, 80, 1290, 130)},
    'sheet-history': {'title': (630, 28, 1000, 66), 'meta': (630, 66, 1100, 86), 'heading': (630, 102, 1290, 118),
                      'row1': (630, 128, 1290, 152), 'row12': (630, 490, 1290, 516), 'total': (630, 520, 1290, 550),
                      'buttons': (1190, 570, 1290, 625)},
    'sheet-game-over': {'title': (630, 28, 1000, 66), 'meta': (630, 66, 1100, 86), 'heading': (630, 104, 1290, 120),
                        'row1': (630, 132, 1290, 156), 'row6': (630, 314, 1290, 340), 'buttons': (860, 366, 1290, 416)},
    'sheet-rules': {'title': (630, 28, 1000, 66), 'list1': (630, 72, 1250, 110), 'list12': (630, 420, 1250, 445),
                    'buttons': (1190, 470, 1290, 525)},
    'sheet-settings': {'title': (630, 28, 1000, 66), 'meta': (630, 64, 1100, 88), 'row1': (625, 100, 1290, 122),
                       'row2': (625, 130, 1290, 152), 'check': (625, 166, 900, 188), 'buttons': (1190, 205, 1290, 255)},
    'sheet-last-trick': {'title': (660, 28, 1260, 66), 'meta': (660, 64, 1260, 86), 'cards': (660, 92, 1260, 232),
                         'names': (660, 232, 1260, 254), 'buttons': (900, 264, 1020, 320)},
}


def panel_box(image):
    """The panel's box in a picture: the rows and columns that are mostly its border."""
    width, height = image.size
    rows = [y for y in range(height)
            if sum(1 for x in range(0, width, 4) if image.getpixel((x, y)) == BORDER) > 60]
    cols = [x for x in range(width)
            if sum(1 for y in range(0, height, 4) if image.getpixel((x, y)) == BORDER) > 30]
    if not rows or not cols:
        return None
    return cols[0], rows[0], cols[-1], rows[-1]


def best_shift(desktop, page, desktop_box, page_box, region, reach):
    left, top, right, bottom = region
    wanted = desktop.convert('L').crop((left, desktop_box[1] + top, right, desktop_box[1] + bottom))
    gray = page.convert('L')
    found = []
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            crop = gray.crop((left + dx, page_box[1] + top + dy, right + dx, page_box[1] + bottom + dy))
            found.append((ImageStat.Stat(ImageChops.difference(wanted, crop)).mean[0], dx, dy))
    found.sort()
    at_zero = next(entry for entry in found if entry[1] == 0 and entry[2] == 0)
    return found[0], at_zero


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('names', nargs='*', help='sheets to measure; all by default')
    parser.add_argument('--web', type=pathlib.Path, default=ROOT / 'build/shots/web')
    parser.add_argument('--desktop', type=pathlib.Path, default=ROOT / 'build/shots/desktop')
    parser.add_argument('--reach', type=int, default=6, help='the largest shift searched, in pixels')
    args = parser.parse_args()

    for name in args.names or sorted(REGIONS):
        if name not in REGIONS:
            sys.exit(f'{name} is not a sheet this tool has regions for: {", ".join(sorted(REGIONS))}')
        desktop = Image.open(args.desktop / f'{name}.png').convert('RGB')
        page = Image.open(args.web / f'{name}.png').convert('RGB')
        desktop_box, page_box = panel_box(desktop), panel_box(page)
        print(f'== {name}')
        if desktop_box is None or page_box is None:
            print('  no panel found')
            continue
        size = lambda box: f'{box[2] - box[0] + 1} x {box[3] - box[1] + 1}'
        print(f'  panel: desktop {size(desktop_box)} at y {desktop_box[1]}, page {size(page_box)} at y {page_box[1]}')
        for label, region in REGIONS[name].items():
            (mean, dx, dy), (zero, _, _) = best_shift(desktop, page, desktop_box, page_box, region, args.reach)
            print(f'  {label:<9} page is shifted by dx,dy = {dx},{dy}  (difference {mean:.1f}, unshifted {zero:.1f})')


if __name__ == '__main__':
    main()

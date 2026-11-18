#!/usr/bin/env python3
"""Pair each of the page's scaled-table captures with the Android mock-up's picture of the same screen.

    python3 tools/pair_scaled.py [--web DIR] [--mockup DIR] [--out DIR]

--web is where `npm run look` wrote the scaled captures (build/shots/scaled), --mockup where
`node tools/mockup_shots.mjs` wrote the mock-up's (build/shots/mockup), --out where the pairs go
(build/shots/scaled-compare). Each has a folder for each phone's size, <width>x<height>. For each size
and each screen the two have, it writes

    <size>/compare-<name>.png    the page on the left and the mock-up on the right, each labelled

The two draw different games, so there is no difference to measure: the pairs are for looking at where
the seats, the cards, the controls and the panels stand. tools/pair_shots.py pairs the desktop's table
with the desktop client's pictures, and is not changed by this.

Needs Pillow (tools/requirements.txt).
"""

import argparse
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent

# The page's capture and the mock-up's picture of the screen it stands for. The mock-up's "your turn"
# screen is a hand of seven at a table of five, nearest the page's hand of four.
PAIRS = {
    'table-2-players': 'table-2-players',
    'table-3-players': 'table-3-players',
    'table-4-players': 'table-4-players',
    'table-5-players': 'table-5-players',
    'table-6-players': 'table-6-players',
    'bidding': 'bidding',
    'hand-4-cards': 'play',
}

LABEL_HEIGHT = 44
GUTTER = 12
BACKGROUND = (24, 18, 12)
TEXT = (241, 230, 204)


def label_font():
    try:
        return ImageFont.load_default(size=26)
    except TypeError:
        return ImageFont.load_default()


def side_by_side(left, right, left_label, right_label):
    font = label_font()
    width = left.width + GUTTER + right.width
    sheet = Image.new('RGB', (width, max(left.height, right.height) + LABEL_HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 8), left_label, fill=TEXT, font=font)
    draw.text((left.width + GUTTER + 8, 8), right_label, fill=TEXT, font=font)
    sheet.paste(left, (0, LABEL_HEIGHT))
    sheet.paste(right, (left.width + GUTTER, LABEL_HEIGHT))
    return sheet


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--web', type=pathlib.Path, default=ROOT / 'build/shots/scaled')
    parser.add_argument('--mockup', type=pathlib.Path, default=ROOT / 'build/shots/mockup')
    parser.add_argument('--out', type=pathlib.Path, default=ROOT / 'build/shots/scaled-compare')
    args = parser.parse_args()

    if not args.web.is_dir():
        sys.exit(f'There is no {args.web}: run npm run look first.')
    if not args.mockup.is_dir():
        sys.exit(f'There is no {args.mockup}: run node tools/mockup_shots.mjs first.')

    paired = 0
    for folder in sorted(path for path in args.web.iterdir() if path.is_dir()):
        size = folder.name
        for name, shown in PAIRS.items():
            web_path = folder / f'{name}.png'
            mockup_path = args.mockup / size / f'{shown}.png'
            if not web_path.is_file() or not mockup_path.is_file():
                missing = web_path if not web_path.is_file() else mockup_path
                print(f'{size} {name:<16} skipped: there is no {missing}')
                continue
            web = Image.open(web_path).convert('RGB')
            mockup = Image.open(mockup_path).convert('RGB')
            if web.size != mockup.size:
                print(f'{size} {name:<16} skipped: the page is {web.size[0]} x {web.size[1]} and the mock-up {mockup.size[0]} x {mockup.size[1]}')
                continue
            out = args.out / size
            out.mkdir(parents=True, exist_ok=True)
            side_by_side(web, mockup, f'page, {name}', f'Android mock-up, {shown}').save(out / f'compare-{name}.png')
            print(f'{size} {name:<16} paired')
            paired += 1

    print(f'{paired} pictures paired, in {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

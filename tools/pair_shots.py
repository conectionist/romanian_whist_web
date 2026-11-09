#!/usr/bin/env python3
"""Pair each of the page's look captures with the desktop client's picture of the same name.

    python3 tools/pair_shots.py [--web DIR] [--desktop DIR] [--out DIR]

--web is where `npm run look` wrote the captures (build/shots/web), --desktop where the desktop
client's screenshot tool did (build/shots/desktop), --out where the pairs go (build/shots/phase-6).
For each name both folders hold, it writes

    compare-<name>.png     the page on the left and the desktop client on the right, each labelled
    diff-<name>.png        where they differ, four times as strongly
    compare-<name>-closeup.png, for the three hands: the hand's region, twice as large

and prints the mean absolute difference of the pair, 0 to 255. The sizes must match; a desktop
picture at twice the size (a high-density screen) is scaled down first. Without a desktop folder it
says so and writes nothing. Never pair the page with the desktop's mock-up pictures: they show what
the desktop client departed from.

Needs Pillow (tools/requirements.txt).
"""

import argparse
import pathlib
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent

NAMES = ['table-3-players', 'table-4-players', 'table-5-players', 'table-6-players', 'bidding',
         'table-empty', 'hand-1-card', 'hand-4-cards', 'hand-8-cards']

# The hand's region in a 1920 x 1034 table picture, for the close-ups.
HAND_REGION = (440, 700, 1480, 1034)

LABEL_HEIGHT = 44
GUTTER = 12
BACKGROUND = (24, 18, 12)
TEXT = (241, 230, 204)


def label_font():
    try:
        return ImageFont.load_default(size=26)
    except TypeError:
        return ImageFont.load_default()


def same_size(desktop, web):
    """The desktop picture at the page's size: a 2x one is scaled down, any other size is refused."""
    if desktop.size == web.size:
        return desktop
    if desktop.size == (web.width * 2, web.height * 2):
        return desktop.resize(web.size, Image.LANCZOS)
    return None


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


def difference(web, desktop):
    delta = ImageChops.difference(web, desktop)
    mean = sum(ImageStat.Stat(delta).mean) / 3
    return delta.point(lambda value: min(255, value * 4)), mean


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--web', type=pathlib.Path, default=ROOT / 'build/shots/web')
    parser.add_argument('--desktop', type=pathlib.Path, default=ROOT / 'build/shots/desktop')
    parser.add_argument('--out', type=pathlib.Path, default=ROOT / 'build/shots/phase-6')
    args = parser.parse_args()

    if not args.desktop.is_dir():
        print(f'There is no {args.desktop}: the desktop client\'s pictures are not here yet, so nothing is paired.\n'
              'Run its screenshot tool and copy the nine pictures there (see docs/page-plan.md).')
        return 0
    if not args.web.is_dir():
        sys.exit(f'There is no {args.web}: run npm run look first.')

    args.out.mkdir(parents=True, exist_ok=True)
    paired = 0

    for name in NAMES:
        web_path = args.web / f'{name}.png'
        desktop_path = args.desktop / f'{name}.png'
        if not web_path.is_file() or not desktop_path.is_file():
            missing = web_path if not web_path.is_file() else desktop_path
            print(f'{name:<18} skipped: there is no {missing}')
            continue

        web = Image.open(web_path).convert('RGB')
        desktop = same_size(Image.open(desktop_path).convert('RGB'), web)
        if desktop is None:
            print(f'{name:<18} skipped: the page is {web.size[0]} x {web.size[1]} and the desktop '
                  f'picture {Image.open(desktop_path).size[0]} x {Image.open(desktop_path).size[1]}')
            continue

        pair = side_by_side(web, desktop, 'web', 'desktop')
        pair.save(args.out / f'compare-{name}.png')

        diff, mean = difference(web, desktop)
        diff.save(args.out / f'diff-{name}.png')

        if name.startswith('hand-'):
            left = web.crop(HAND_REGION)
            right = desktop.crop(HAND_REGION)
            close = side_by_side(left.resize((left.width * 2, left.height * 2), Image.LANCZOS),
                                 right.resize((right.width * 2, right.height * 2), Image.LANCZOS),
                                 'web', 'desktop')
            close.save(args.out / f'compare-{name}-closeup.png')

        print(f'{name:<18} mean absolute difference {mean:6.2f}')
        paired += 1

    print(f'{paired} of {len(NAMES)} pictures paired, in {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

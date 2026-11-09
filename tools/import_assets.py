#!/usr/bin/env python3
"""Import the desktop client's art into public/, in the forms the page serves.

    python3 tools/import_assets.py [--desktop PATH]

--desktop names the desktop client's checkout; without it, the one beside this repository. Its
resources/ must be clean, so that the commit written into src/assets/manifest.json names what was
imported. The output is committed, so the tool runs again only when the desktop's art changes.

What it writes:

    public/cards/<code>.webp        the 48 cards the protocol deals, at twice the hand's card height
    public/portraits/<id>.webp|svg  the portraits avatars.json lists
    public/table/wood.webp, felt.webp
    public/fonts/<family>/*.woff2   with each family's OFL.txt
    public/avatars.json, player_names.json
    src/assets/manifest.json        the desktop commit, and every file's URL

The card back is public/cards/back.svg, written by hand: the desktop paints it.

Needs Pillow, fontTools and brotli (tools/requirements.txt).
"""

import argparse
import json
import pathlib
import shutil
import subprocess
import sys

from fontTools.ttLib import TTFont
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
MANIFEST = ROOT / 'src' / 'assets' / 'manifest.json'

RANK_FILES = {'3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10',
              'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace'}
SUIT_FILES = {'C': 'clubs', 'D': 'diamonds', 'H': 'hearts', 'S': 'spades'}

# Twice the hand card's 225 px height, for a display at twice the pixel density.
CARD_SIZE = (310, 450)
CARD_QUALITY = 90
# Twice the portrait box's 88 px width.
PORTRAIT_WIDTH = 176
PORTRAIT_QUALITY = 85
TEXTURE_QUALITY = 85

FONTS = {
    'belleza': ('Belleza', {'400': 'Belleza-Regular'}),
    'alegreya-sans': ('Alegreya Sans', {'400': 'AlegreyaSans-Regular', '500': 'AlegreyaSans-Medium',
                                        '700': 'AlegreyaSans-Bold'}),
    'cinzel-decorative': ('Cinzel Decorative', {'700': 'CinzelDecorative-Bold'}),
}

BUDGET = 2 * 1024 * 1024
# What the first load fetches: every font, both textures, the back, about 15 cards and 6 portraits.
FIRST_LOAD_CARDS = 15
FIRST_LOAD_PORTRAITS = 6


def git(desktop, *args):
    return subprocess.run(['git', '-C', str(desktop), *args], check=True, capture_output=True,
                          text=True).stdout.strip()


def webp(image, path, quality):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, 'WEBP', quality=quality, method=6)


def import_cards(resources, manifest):
    cards = {}
    for rank, rank_name in RANK_FILES.items():
        for suit, suit_name in SUIT_FILES.items():
            source = resources / 'images' / 'cards' / 'png' / f'{rank_name}_of_{suit_name}.png'
            image = Image.open(source).convert('RGBA').resize(CARD_SIZE, Image.LANCZOS)
            webp(image, PUBLIC / 'cards' / f'{rank}{suit}.webp', CARD_QUALITY)
            cards[f'{rank}{suit}'] = f'/cards/{rank}{suit}.webp'
    manifest['cards'] = cards
    manifest['back'] = '/cards/back.svg'


def import_portraits(resources, manifest):
    catalogue = resources / 'images' / 'avatars' / 'avatars.json'
    portraits = {}
    for entry in json.loads(catalogue.read_text()):
        source = resources / 'images' / 'avatars' / entry['file']
        target = PUBLIC / 'portraits'
        target.mkdir(parents=True, exist_ok=True)
        if source.suffix == '.svg':
            name = f"{entry['id']}.svg"
            shutil.copyfile(source, target / name)
        else:
            image = Image.open(source).convert('RGB')
            height = round(image.height * PORTRAIT_WIDTH / image.width)
            name = f"{entry['id']}.webp"
            webp(image.resize((PORTRAIT_WIDTH, height), Image.LANCZOS), target / name, PORTRAIT_QUALITY)
        portraits[entry['id']] = f'/portraits/{name}'
    manifest['portraits'] = portraits
    shutil.copyfile(catalogue, PUBLIC / 'avatars.json')
    shutil.copyfile(resources / 'names' / 'player_names.json', PUBLIC / 'player_names.json')


def import_textures(resources, manifest):
    textures = {}
    for name in ('wood', 'felt'):
        source = resources / 'images' / 'table' / f'table_{name}.png'
        image = Image.open(source)
        webp(image.convert('RGBA' if image.mode == 'RGBA' else 'RGB'), PUBLIC / 'table' / f'{name}.webp',
             TEXTURE_QUALITY)
        textures[name] = f'/table/{name}.webp'
    manifest['textures'] = textures


def import_fonts(resources, manifest):
    fonts = {}
    for directory, (family, weights) in FONTS.items():
        target = PUBLIC / 'fonts' / directory
        target.mkdir(parents=True, exist_ok=True)
        faces = {}
        for weight, stem in weights.items():
            font = TTFont(resources / 'fonts' / directory / f'{stem}.ttf')
            font.flavor = 'woff2'
            font.save(target / f'{stem}.woff2')
            faces[weight] = f'/fonts/{directory}/{stem}.woff2'
        shutil.copyfile(resources / 'fonts' / directory / 'OFL.txt', target / 'OFL.txt')
        fonts[family] = faces
    manifest['fonts'] = fonts


def first_load_bytes(manifest):
    def size(url):
        return (PUBLIC / url.lstrip('/')).stat().st_size

    fonts = sum(size(url) for faces in manifest['fonts'].values() for url in faces.values())
    textures = sum(size(url) for url in manifest['textures'].values())
    back = size(manifest['back'])
    cards = sorted(size(url) for url in manifest['cards'].values())[-FIRST_LOAD_CARDS:]
    portraits = sorted(size(url) for url in manifest['portraits'].values())[-FIRST_LOAD_PORTRAITS:]
    parts = {'fonts': fonts, 'textures': textures, 'card back': back,
             f'{FIRST_LOAD_CARDS} cards (the largest)': sum(cards),
             f'{FIRST_LOAD_PORTRAITS} portraits (the largest)': sum(portraits)}
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--desktop', type=pathlib.Path, default=ROOT.parent / 'romanian_whist_desktop')
    args = parser.parse_args()
    desktop = args.desktop.resolve()
    resources = desktop / 'resources'

    if git(desktop, 'status', '--porcelain', '--', 'resources'):
        sys.exit(f'{resources} has changes that are not committed, so no commit names what is imported')

    manifest = {'desktopCommit': git(desktop, 'rev-parse', 'HEAD')}
    import_cards(resources, manifest)
    import_portraits(resources, manifest)
    import_textures(resources, manifest)
    import_fonts(resources, manifest)

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')

    parts = first_load_bytes(manifest)
    total = sum(parts.values())
    print(f"desktop commit {manifest['desktopCommit']}")
    for name, size in parts.items():
        print(f'  {name:<32}{size / 1024:>9.1f} KiB')
    print(f"  {'first load, at most':<32}{total / 1024:>9.1f} KiB of {BUDGET // 1024} KiB")
    if total > BUDGET:
        sys.exit('the first load is over its budget')


if __name__ == '__main__':
    main()

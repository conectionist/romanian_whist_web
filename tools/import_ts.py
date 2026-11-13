#!/usr/bin/env python3
"""Import the desktop client's Romanian translation into src/i18n/ro.desktop.json.

    python3 tools/import_ts.py [--desktop PATH] [--commit REV] [--output FILE]

--desktop names the desktop client's checkout; without it, the one beside this repository. --commit
is the revision to read the translation at, HEAD by default, and it is read from git rather than the
working tree, so that the commit written into the output names exactly what was imported. --output is
where it writes, src/i18n/ro.desktop.json by default. That file is committed, so the tool runs again
only when the desktop's translation changes.

The input is Qt's i18n/romanian_whist_desktop_ro_RO.ts. Each message becomes one entry, keyed on its
context, its source and its disambiguation comment, as Qt looks a translation up:

    {"context": "BidBubbleItem", "source": "You bid %1", "translation": "Ai licitat %1"}
    {"context": "gameover", "source": "%1 wins with %n points.", "forms": ["...", "...", "..."]}

A message with plural forms keeps all of them, in Qt's order, under "forms". A message with no
translation, or one marked unfinished, vanished or obsolete, is left out: Qt would show its source.

The page's own strings, which the desktop has no entry for, are written by hand in
src/i18n/ro.page.json, so that running this tool never overwrites them.
"""

import argparse
import json
import pathlib
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'src' / 'i18n' / 'ro.desktop.json'
TRANSLATION = 'i18n/romanian_whist_desktop_ro_RO.ts'

# What a translation of that type is not a translation of.
UNUSABLE = {'unfinished', 'vanished', 'obsolete'}


def git(desktop, *args):
    return subprocess.run(['git', '-C', str(desktop), *args], check=True, capture_output=True,
                          text=True).stdout


def text_of(node):
    return '' if node is None or node.text is None else node.text


def entry_of(context, message):
    """The entry for one <message>, or None when Qt would show the source."""
    translation = message.find('translation')
    if translation is None or translation.get('type') in UNUSABLE:
        return None

    entry = {'context': context, 'source': text_of(message.find('source'))}
    comment = message.find('comment')
    if comment is not None:
        entry['comment'] = text_of(comment)

    if message.get('numerus') == 'yes':
        forms = [text_of(form) for form in translation.findall('numerusform')]
        if not forms or any(form == '' for form in forms):
            return None
        entry['forms'] = forms
    else:
        if text_of(translation) == '':
            return None
        entry['translation'] = text_of(translation)
    return entry


def parse(xml):
    entries = []
    seen = set()
    for context in ET.fromstring(xml).iter('context'):
        name = text_of(context.find('name'))
        for message in context.iter('message'):
            entry = entry_of(name, message)
            if entry is None:
                continue
            key = (entry['context'], entry['source'], entry.get('comment', ''))
            if key in seen:
                sys.exit(f'{key} is translated twice in {TRANSLATION}')
            seen.add(key)
            entries.append(entry)
    return entries


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--desktop', type=pathlib.Path, default=ROOT.parent / 'romanian_whist_desktop')
    parser.add_argument('--commit', default='HEAD')
    parser.add_argument('--output', type=pathlib.Path, default=OUTPUT)
    args = parser.parse_args()

    commit = git(args.desktop, 'rev-parse', '--verify', f'{args.commit}^{{commit}}').strip()
    entries = parse(git(args.desktop, 'show', f'{commit}:{TRANSLATION}'))

    document = {'desktopCommit': commit, 'language': 'ro', 'entries': entries}
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    plurals = sum(1 for entry in entries if 'forms' in entry)
    print(f'{len(entries)} entries ({plurals} with plural forms) from {commit[:7]} written to {args.output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

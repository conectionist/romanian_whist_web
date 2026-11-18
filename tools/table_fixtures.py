#!/usr/bin/env python3
"""Write the page's look fixture for a table of two players, tests/look/fixtures/table-2-players.json.

    python3 tools/table_fixtures.py

The server's look fixtures have tables of 3 to 6 players, and the desktop's screenshot tool no table of
two, so this one is the 3-player table with its third seat taken away: the same round, trick and hand,
with Ana leading. The file it writes is committed.
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'libs' / 'romanian_whist_server' / 'protocol' / 'look' / 'table-3-players.json'
OUT = ROOT / 'tests' / 'look' / 'fixtures'

DROPPED = 2


def without_third(seats):
    return [seat for index, seat in enumerate(seats) if index != DROPPED]


def main():
    fixture = json.loads(SOURCE.read_text())
    state = fixture['state']

    state['table']['seats'] = without_third(state['table']['seats'])
    state['table']['settings']['seats'] = without_third(state['table']['settings']['seats'])

    snapshot = state['snapshot']
    snapshot['seats'] = without_third(snapshot['seats'])
    # The bids that are in are the two that are left, and each seat's place in the bidding is its rank among them.
    order = sorted(range(len(snapshot['seats'])), key=lambda index: snapshot['seats'][index]['bidOrder'])
    for rank, index in enumerate(order, start=1):
        snapshot['seats'][index]['bidOrder'] = rank
    snapshot['bets'] = {'placed': 2, 'sum': sum(seat['bet'] for seat in snapshot['seats'])}
    snapshot['table']['cards'] = [played for played in snapshot['table']['cards'] if played['seat'] != DROPPED]

    for round_ in state['history']:
        round_['seats'] = without_third(round_['seats'])
    if state['lastTrick'] is not None:
        state['lastTrick']['cards'] = [played for played in state['lastTrick']['cards'] if played['seat'] != DROPPED]

    fixture['shot'] = {'file': 'table-2-players.png', 'width': 1920, 'height': 1080, 'view': 'window'}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'table-2-players.json').write_text(json.dumps(fixture, indent=2, sort_keys=True) + '\n')
    print('wrote table-2-players.json')


if __name__ == '__main__':
    main()

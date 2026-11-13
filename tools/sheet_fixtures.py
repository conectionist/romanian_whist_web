#!/usr/bin/env python3
"""Write the page's own look fixtures, tests/look/fixtures/*.json: the sheets and the main menu.

    python3 tools/sheet_fixtures.py

The server's look fixtures are real games, played by its tool. The desktop's pictures of its sheets
are not: tests/ScreenshotTool.cpp builds a table by hand and puts each sheet over it, so these are
built by hand too, from its numbers (fullTable() and sheetTable() in tests/TableFixtures.h and
ScreenshotTool.cpp, sheetRound(), sheetHistory(), sheetTrick() and the standings). A fixture is the
look format of protocol/look/README.md, with `sheet`, the sheet the picture shows when it is not the
round sheet or the end of the game, and `messages`, server messages applied after the state.

Run it again after changing a number here; the files it writes are committed.
"""

import json
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'tests' / 'look' / 'fixtures'

# The desktop's six players and the portraits they wear, in seat order. Elena wears Ana's.
PLAYERS = [
    ('Player', 'male', 'man-dark-hair-beard', None),
    ('Ana', 'female', 'woman-long-brown-hair', 'low-risk'),
    ('Bogdan', 'male', 'man-hat-mustache', 'ducking'),
    ('Cristina', 'female', 'woman-long-red-hair', 'low-risk'),
    ('Dan', 'male', 'man-white-hair-hat', 'ducking'),
    ('Elena', 'female', 'woman-long-brown-hair', 'low-risk'),
]


def settings_seats():
    seats = []
    for name, gender, avatar, level in PLAYERS:
        if level is None:
            seats.append({'kind': 'human', 'name': name, 'gender': gender, 'avatar': avatar})
        else:
            seats.append({'kind': 'computer', 'level': level, 'name': name, 'gender': gender, 'avatar': avatar})
    return seats


def table_state():
    seats = []
    for name, gender, avatar, level in PLAYERS:
        if level is None:
            seats.append({'kind': 'human', 'name': name, 'gender': gender, 'avatar': avatar,
                          'presence': 'here', 'you': True})
        else:
            seats.append({'kind': 'computer', 'level': level, 'name': name, 'gender': gender, 'avatar': avatar})
    return {
        'code': 'SHEET1', 'host': 0, 'mode': 'solo', 'paused': False, 'state': 'playing', 'seats': seats,
        'settings': {
            'seats': settings_seats(), 'structure': '1-8-1', 'foreheadAndHidden': True,
            'allOneCardForehead': False, 'botSpeed': 2, 'waitAfterRound': True,
        },
    }


def online_table():
    """The table of a game being played online, which the pause menu cannot hold: what Esc raises there is the
    offer to leave, and on the scaled table the menu's list."""
    table = table_state()
    table['mode'] = 'online'
    table['code'] = 'K7QM4P'
    return table


def lobby_state():
    """A table in its lobby, as its host sees it: you, two open seats and a computer player, with every
    control the host has."""
    seats = [
        {'kind': 'human', 'name': 'Player', 'gender': 'male', 'avatar': 'man-dark-hair-beard', 'presence': 'here', 'you': True},
        {'kind': 'open'},
        {'kind': 'open'},
        {'kind': 'computer', 'level': 'low-risk', 'name': 'Cristina', 'gender': 'female', 'avatar': 'woman-long-red-hair'},
    ]
    settings_seats = [
        {'kind': 'human', 'name': 'Player', 'gender': 'male', 'avatar': 'man-dark-hair-beard'},
        {'kind': 'open'},
        {'kind': 'open'},
        {'kind': 'computer', 'level': 'low-risk', 'name': 'Cristina', 'gender': 'female', 'avatar': 'woman-long-red-hair'},
    ]
    table = {
        'code': 'K7QM4P', 'host': 0, 'mode': 'online', 'paused': False, 'state': 'lobby', 'seats': seats,
        'settings': {
            'seats': settings_seats, 'structure': '1-8-1', 'foreheadAndHidden': True,
            'allOneCardForehead': False, 'botSpeed': 2, 'waitAfterRound': True, 'replacement': 'reckoner-beta',
            'turnTimer': 60000,
        },
    }
    return {'table': table, 'game': None, 'snapshot': None, 'history': [], 'lastTrick': None, 'prompt': None,
            'held': None}


def snapshot():
    """fullTable(): round 10 of 32, trick 3 of 8, every bid 1, five spades on the felt, Ana's King
    taking it, and a hand of eight in the order the desktop's tool lays it out."""
    seats = []
    for index, (name, _gender, _avatar, _level) in enumerate(PLAYERS):
        seat = {'name': name, 'bidOrder': 0, 'bet': 1, 'won': 0, 'cards': 8, 'roundScore': 0,
                'total': 0, 'wins': 0, 'losses': 0}
        if index == 0:
            seat['hand'] = ['2C', '7C', 'JC', '9D', 'QD', 'TH', 'KH', 'AS']
        seats.append(seat)
    return {
        'you': 0, 'status': 'inProgress', 'phase': 'playing',
        'round': {'index': 9, 'count': 32, 'type': 'normal', 'tricks': 8, 'trick': 3, 'trump': None, 'leader': 0},
        'active': None, 'forbiddenBet': None, 'bets': {'placed': 6, 'sum': 6},
        'table': {'ledBy': 1, 'leadSuit': None, 'cards': [
            {'seat': 1, 'card': 'KS', 'winning': True},
            {'seat': 2, 'card': 'QS', 'winning': False},
            {'seat': 3, 'card': 'JS', 'winning': False},
            {'seat': 4, 'card': '8S', 'winning': False},
            {'seat': 5, 'card': '3S', 'winning': False},
        ]},
        'seats': seats,
    }


def round_result():
    """sheetRound(): round 10, five cards, Trump K of hearts. Bogdan has hit four in a row."""
    bets = [1, 2, 0, 1, 2, 0]
    taken = [1, 1, 0, 2, 1, 0]
    totals = [34, 41, 28, 19, 37, 30]
    seats = []
    for index in range(6):
        score = 5 + bets[index] if bets[index] == taken[index] else -abs(bets[index] - taken[index])
        seats.append({'bet': bets[index], 'won': taken[index], 'roundScore': score, 'total': totals[index],
                      'wins': 4 if index == 2 else 0, 'losses': 2 if index == 3 else 0})
    return {'index': 9, 'count': 32, 'tricks': 5, 'type': 'normal', 'trump': 'KH',
            'nextCountsForStreaks': True, 'seats': seats}


def history():
    """sheetHistory(): the first twelve rounds of the six-seat schedule, six of one card and then two to
    seven. The engine's ten for five exact bids in a row lands in the round of six cards; rounds of
    one card count for neither streak."""
    cards = [1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7]
    bets = [[0, 1, 0, 0, 1, 0], [1, 0, 0, 1, 0, 0], [0, 0, 1, 0, 0, 1], [1, 1, 0, 0, 0, 0],
            [0, 0, 0, 1, 1, 0], [0, 1, 1, 0, 0, 0], [1, 1, 0, 0, 1, 0], [0, 1, 1, 0, 1, 1],
            [1, 2, 0, 1, 1, 0], [1, 1, 2, 0, 2, 1], [2, 2, 1, 1, 1, 0], [2, 1, 2, 1, 2, 1]]
    taken = [[0, 1, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1], [0, 1, 0, 0, 0, 0],
             [0, 0, 0, 1, 0, 0], [0, 1, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0], [0, 1, 1, 0, 0, 1],
             [1, 2, 0, 1, 0, 0], [1, 1, 2, 0, 1, 0], [2, 2, 1, 0, 1, 0], [2, 1, 1, 1, 1, 1]]
    totals = [0] * 6
    hits = [0] * 6
    misses = [0] * 6
    rounds = []
    for r in range(12):
        seats = []
        for i in range(6):
            bet, won = bets[r][i], taken[r][i]
            exact = bet == won
            worth = 5 + bet if exact else -abs(bet - won)
            if cards[r] > 1:
                hits[i] = hits[i] + 1 if exact else 0
                misses[i] = 0 if exact else misses[i] + 1
                if hits[i] == 5:
                    worth += 10
                if misses[i] == 5:
                    worth -= 10
            seats.append({'bet': bet, 'won': won, 'roundScore': worth, 'total': totals[i],
                          'wins': hits[i], 'losses': misses[i]})
            totals[i] += worth
        rounds.append({'index': r, 'count': 32, 'tricks': cards[r], 'type': 'normal', 'trump': None,
                       'nextCountsForStreaks': r + 1 < 12 and cards[r + 1] > 1, 'seats': seats})
    return rounds


def last_trick():
    """sheetTrick(): a trick of hearts led by Bogdan, which Dan took with the Ace from the middle of
    the row."""
    return {'round': 9, 'ledBy': 2, 'cards': [
        {'seat': 2, 'card': '9H', 'winning': False},
        {'seat': 3, 'card': 'KH', 'winning': False},
        {'seat': 4, 'card': 'AH', 'winning': True},
        {'seat': 5, 'card': '7H', 'winning': False},
        {'seat': 0, 'card': 'TH', 'winning': False},
        {'seat': 1, 'card': 'QS', 'winning': False},
    ]}


def standings():
    """The game ends in a tie: Ana and Dan on 63."""
    finals = [63, 63, 51, 47, 40, 22]
    places = [1, 1, 3, 4, 5, 6]
    order = [1, 4, 0, 5, 2, 3]
    rows = [{'seat': order[i], 'name': PLAYERS[order[i]][0], 'score': finals[i], 'place': places[i]}
            for i in range(6)]
    return rows, rows[:2]


def state(**changes):
    base = {'table': table_state(), 'game': 1, 'snapshot': snapshot(), 'history': [], 'lastTrick': None,
            'prompt': None, 'held': None}
    base.update(changes)
    return base


# The desktop's picture of each sheet is the table less its menu bar, 1920 x 1034.
SHOT = {'width': 1920, 'height': 1034, 'view': 'table'}


def fixture(file, state, **extra):
    shot = dict(SHOT, file=file)
    shot['handOrder'] = ['2C', '7C', 'JC', '9D', 'QD', 'TH', 'KH', 'AS']
    return {'shot': shot, 'state': state, **extra}


def write(name, content):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'{name}.json').write_text(json.dumps(content, indent=2, sort_keys=True) + '\n')
    print(f'wrote {name}.json')


def main():
    final, winners = standings()
    write('sheet-pause', fixture('sheet-pause.png', state(), sheet='pause'))
    write('sheet-round', fixture('sheet-round.png', state(
        history=[round_result()], held={'round': 9, 'waitingFor': [0], 'deadline': None})))
    write('sheet-game-over', fixture('sheet-game-over.png', state(), messages=[
        {'type': 'game', 'seq': 1, 'game': 1, 'snapshot': None,
         'event': {'kind': 'gameOver', 'standings': final, 'winners': winners}}]))
    write('sheet-rules', fixture('sheet-rules.png', state(), sheet='rules'))
    write('sheet-settings', fixture('sheet-settings.png', state(), sheet='settings'))
    write('sheet-history', fixture('sheet-history.png', state(history=history()), sheet='history'))
    write('sheet-last-trick', fixture('sheet-last-trick.png', state(lastTrick=last_trick()), sheet='last-trick'))
    write('sheet-scores', fixture('sheet-scores.png', state(history=history(), lastTrick=last_trick()), sheet='scores'))
    write('sheet-menu-online', fixture('sheet-menu-online.png', state(table=online_table()), sheet='pause'))
    write('sheet-new-game', fixture('sheet-new-game.png', state(), sheet='new-game'))
    write('sheet-online', fixture('sheet-online.png', state(), sheet='online'))
    write('sheet-create-table', fixture('sheet-create-table.png', state(), sheet='create-table'))
    write('sheet-lobby', {'shot': dict(SHOT, file='sheet-lobby.png'), 'state': lobby_state()})
    # The main menu is the window at no table: the whole 1920 x 1080 picture, menu bar and all.
    write('menu', {'shot': {'file': 'menu.png', 'width': 1920, 'height': 1080, 'view': 'window'},
                   'state': None, 'page': 'menu'})


if __name__ == '__main__':
    main()

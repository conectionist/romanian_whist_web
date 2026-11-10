# Romanian Whist in the browser

The browser page for Romanian Whist: solo games against computer players, and online tables. Every
game is played on [the Romanian Whist server](https://github.com/conectionist/romanian_whist_server),
which is a submodule here, in `libs/romanian_whist_server`.

**Status:** the table page. It draws the table from what the server sends, in the desktop client's
look, and plays a solo game: `/?solo=4` starts one against the computer players (`&seed=42` fixes the
deal). The sheets, the menus, the lobby and Romanian are not built yet.
[`docs/page-plan.md`](docs/page-plan.md) is the plan for them.

## Getting the code

```
git clone --recurse-submodules https://github.com/conectionist/romanian_whist_web.git
```

The submodule is needed to run the page against a server, and by the unit tests, which read the
server's protocol fixtures. Cloned without `--recurse-submodules`? The unit tests need
`git submodule update --init libs/romanian_whist_server`; running the page against a server needs
`git submodule update --init --recursive`.

## Building the page

Node 22.12 or later:

```
npm ci
npm run build
```

## Running it

Build the server in the submodule first, as its README says. Its first build compiles Drogon too
and takes several minutes:

```
cd libs/romanian_whist_server
cmake --preset default
nice -n 19 cmake --build --preset default -j 2
```

Then, from this repository's root, after `npm run build`:

```
libs/romanian_whist_server/build/server/app/whist_server --config server.json
```

and open http://127.0.0.1:8080/?solo=4. `server.json` points the server at `dist/`.

While working on the page, `npm run dev` serves it on port 5173 and passes `/ws` through to the
server on port 8080. For now this is the way to see the pictures: the server does not serve `.webp`
files yet, so the cards, the portraits and the table's textures are missing from a page it serves.

## Tests

```
nice -n 19 npx vitest run --maxWorkers=2    # the unit tests
nice -n 19 npm run e2e -- --workers=1       # the page against the server, in Chromium
nice -n 19 npm run look -- --workers=1      # the look captures, below
```

The unit tests read the server's protocol fixtures, so they need the submodule. The end-to-end tests
start the server built in the submodule, or the one `WHIST_SERVER` names, and play a solo game through
the page. They need Playwright's Chromium once: `npx playwright install chromium`.

## Comparing the look with the desktop client's

The page must look like the desktop client, which decides every difference. Two things make that
checkable without a server:

- `npm run look` builds `look.html` into `dist-look/` (never shipped) and renders each of the
  server's look fixtures, `libs/romanian_whist_server/protocol/look/*.json`, at the desktop picture's
  own size, into `build/shots/web/<name>.png`. Nine captures: `table-3-players` to `table-6-players`,
  `bidding`, `table-empty` and `hand-1-card`, `hand-4-cards` and `hand-8-cards`.
- `npm run compare` pairs each capture with the desktop's picture of the same name, which its
  screenshot tool writes (`WHIST_SHOTS_DIR=build/shots/web-reference ./build/tests/desktop_tests
  "[.screenshot]"` in the desktop's checkout). Put those nine pictures in `build/shots/desktop/`;
  without them it says so and writes nothing. It writes, into `build/shots/compare/`,
  `compare-<name>.png` (the page on the left, the desktop on the right), `diff-<name>.png`, a
  `compare-hand-*-closeup.png` for each hand, and prints each pair's mean absolute difference.

Everything under `build/`, `dist-look/` and `test-results/` is git-ignored.

## The pictures and the fonts

They are the desktop client's, imported once by `tools/import_assets.py` into `public/`, with the
desktop's commit written into `src/assets/manifest.json`:

```
pip install -r tools/requirements.txt
python3 tools/import_assets.py --desktop ../romanian_whist_desktop
```

The cards, the portraits and the table's textures become WebP, the fonts WOFF2 (each with its OFL
licence), and the catalogues are copied. The card back is `public/cards/back.svg`, drawn by hand. The
tool prints the size of a first load against its budget of 2 MiB.

## Licence

AGPL-3.0-or-later, as the server and the engine are.

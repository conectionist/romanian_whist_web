# Romanian Whist in the browser

The browser page for Romanian Whist: solo games against computer players, and online tables. Every
game is played on [the Romanian Whist server](https://github.com/conectionist/romanian_whist_server),
which is a submodule here, in `libs/romanian_whist_server`.

**Status:** the table, the sheets, the menus and the online lobby. It draws the table from what the
server sends, in the desktop client's look. The main menu opens on New Game, with the desktop's
fields, bounds and defaults, and on Play online, which makes a table or joins one by its code or its
link (`/t/` and the code), waits in a lobby, and plays it. The round, history, last trick, game over,
rules, settings and pause sheets are the desktop's. The page is in Romanian and English: it asks which
the first time, with the desktop's language dialog, and keeps the answer in the browser; the flag at
the top right of the main menu opens the dialog again. The foot of the main menu links to the source
of the server and of the page, and opens About. [`docs/page-plan.md`](docs/page-plan.md) is the plan
for it.

For a game the tests and a look at the page can start without the menu, `/?solo=4` starts a solo game
against the computer players. `&seed=42` fixes the deal, `&speed=0` to `4` sets how fast they move (2 is
the desktop's default, 4 is instant, and then their cards do not fly), `&forehead=all` makes every
one-card round a Forehead round, which the first deal then is, and `&wait=1` holds the table after
each round until you continue. `&lang=ro` or `&lang=en` runs the page in that language for the visit,
without asking and without keeping it.

## Deploy with Docker (recommended)

The page is an image for linux/amd64, `ghcr.io/conectionist/romanian_whist_web`: Caddy serving the
built page with automatic HTTPS, passing `/ws`, `/version` and `/health` on to a game server, and answering
a table's link, `/t/` and six capital letters or digits, with the page. Its tags are `latest` (the newest
`master`), a release such as `1.0.0` or `1.0`, and `sha-<commit>`.

**On the public internet.** The server limits what one address can do: connections, tables made in an
hour, failed joins and messages a second. It sends the page's security headers and caching rules itself.
When it is asked to stop, it stops giving out new games and lets the games someone is at end, for as long as
its `drain_ms` says (15 minutes by default); a person at one sees a banner that says until when. The
server's README has the settings and the restart, and what to monitor: `/health` answers 200, and 503 while
it drains.

- **With its server, in one stack:** the server's repository has the compose file that runs both
  images, with this image's Caddy getting the certificate. See "Deploy with Docker" in
  [its README](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/README.md#deploy-with-docker-recommended).
- **Behind your own Caddy or nginx:** the server serves the page itself, from a volume that this
  image fills. See "Behind your own reverse proxy" in the same README.
- **Pointed at any server,** below.
- **Without Docker:** the server serves the built `dist/` as its document root, behind a proxy that
  holds TLS. See "Deploying without Docker" in
  [the server's README](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/README.md#deploying-without-docker)
  and [§12.2 of its plan](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/docs/server-plan.md#122-by-hand).

### The page alone, pointed at a server

[`deploy/docker-compose.yml`](deploy/docker-compose.yml) runs this image only. You need Docker with
Compose, a domain name that points at the machine with ports 80 and 443 open, and a game server the
container can reach:

```
mkdir whist-page && cd whist-page
curl -fsSLO https://raw.githubusercontent.com/conectionist/romanian_whist_web/master/deploy/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/conectionist/romanian_whist_web/master/deploy/.env.example
```

Edit `.env`: `WHIST_DOMAIN` is the domain name (`:80` serves plain HTTP at http://localhost, for a
trial), and `WHIST_SERVER_ADDRESS` is the server, as one of

- `host.docker.internal:8080`, for a server on this machine. On Linux the container reaches it
  over the Docker bridge, so the server must listen on the bridge's address, not on `127.0.0.1`
  alone: with a page that loads but a `502` on `/ws`, that is the cause. Get the address with
  `docker network inspect bridge --format '{{ (index .IPAM.Config 0).Gateway }}'`, usually
  `172.17.0.1`, and use it as `WHIST_LISTEN` in the server's own-proxy compose file
  (`172.17.0.1:8080`), in `-p 172.17.0.1:8080:8080` of `docker run`, or as the `"address"` of a
  server you built. Only this machine and its containers can reach that address. A server you
  built also needs the host's firewall to let Docker's networks reach port 8080, and to start
  after Docker, which creates the address. On Docker Desktop none of this applies: the host's
  `127.0.0.1` is reachable as it is;
- `server:8080`, or another `host:port`, for a server container on a Docker network. This file
  declares no network, so join the page to that one with a `docker-compose.override.yml` beside it
  (`docker network ls` lists them; the server's own-proxy compose file makes `whist_default`).
  Stop the page before you bring that server's compose project down, or the network stays:

  ```yaml
  services:
    web:
      networks: [whist]
  networks:
    whist:
      name: whist_default
      external: true
  ```

- `https://whist.example.org`, for a remote server behind its own TLS.

**The server must trust the page.** The page's Caddy tells the server the visitor's address in
`X-Forwarded-For`, and the server believes that only from the addresses in its `trusted_proxies`. From any
other it counts the address the request came from, so every visitor would count as one address for the limits
per address, and the first few would use them up. The server in the image trusts the private ranges, which is
enough for the stack. Elsewhere:

- A server built by hand, reached through `host.docker.internal`, sees the page at the bridge's address:
  add its range to the server's `trusted_proxies`, such as `"172.16.0.0/12"`.
- A remote server behind its own proxy: that proxy appends the page host's address to `X-Forwarded-For`, after
  the visitor's, as Caddy and nginx's `$proxy_add_x_forwarded_for` do. The server must trust the page host's
  address as well as its own proxy: with only the proxy trusted, the rightmost entry it does not trust is the
  page host, and every visitor counts as that one address. Caddy as the remote proxy must also trust the page
  host, so that it keeps the visitor's entry and does not replace the header (`trusted_proxies static <the page
  host's address>` under `servers` in its global options). nginx keeps it with no step of its own.

Then `docker compose pull && docker compose up -d`. Updating is the same two commands, and the
certificates stay in the `caddy_data` volume. The container has a read-only root and only the right
to bind ports 80 and 443. At `localhost`, which gets a certificate of Caddy's own, it logs that it
could not install Caddy's root certificate. That is harmless: the container's trust store is not
your browser's, which warns about this certificate either way.

The image reads two environment variables: `SITE_ADDRESS` (the default, `:80`, serves plain HTTP) and
`WHIST_SERVER_ADDRESS` (the default, `server:8080`, is the server service of the server's compose
file).

**Pairing.** The page and the server speak the same protocol only when their versions match. Each
image carries the version as the label `io.github.conectionist.whist.protocol`, and this one also
carries the server it was tested with, in `io.github.conectionist.whist.server-revision`:

```
docker image inspect --format '{{ index .Config.Labels "io.github.conectionist.whist.protocol" }}' IMAGE
```

Pin both tags in production, and pick two whose labels are equal.

### Checking a deployment

`tools/smoke.mjs` checks a running page and plays the first moments of a solo game through it. It
needs Node 22 or later and no packages, but also the server's submodule, whose smoke test it uses.
It exits 0 on a pass and 1 otherwise:

```
node tools/smoke.mjs --url http://127.0.0.1:8000 --profile web --server-commit <commit>
```

`--profile` says what the address in front of the page is:

- `web`: this image's Caddy, which compresses, so it requires gzip.
- `proxy`: your own proxy with the server's examples, which forward everything and add nothing: gzip is
  only reported.
- `server`: the server serving the page itself, with no proxy. Gzip is only reported there too.

The server sends the content-security-policy, `nosniff`, the referrer policy and the caching rules
itself, so every profile checks them, on the page, the assets, the status pages, errors and `/ws`, with the
handshake and without, and that an error is not given a rule that keeps it. The `web` and `server` profiles also
check that no answer sends a `Server` header, which the server and our Caddy leave out; a proxy of your own adds
one, so `proxy` does not. Every profile also checks the page, a table's link, the file
types, that `/health` says the server is up, that `/version` and `/health` are `no-store`, and the game
through `/ws`. `--server-commit` is the commit the server was built from, which `/version` and its welcome
report; `--web-commit` is the commit the page was built from, which must be in the page's script. Leave
either out to skip that check: an empty one is refused, since it would match any page. `--timeout` is the seconds to wait for the page, and again for the game
(10 by default). `node tools/smoke.mjs --copies` checks, with no server, that this image's Caddyfile and
the server's own header file send the same content-security-policy; the unit tests check that too.

### The footer and About

The foot of the main menu reads "Source: server · page · About". The two links go to the server's
repository at the commit the server reports, in its welcome and at `/version`, and to this repository at the
commit the page was built from. The AGPL asks that everyone who uses a program over a network can get its
source, and this is how they do. Before the server has answered, and for a server that gives no commit, the
link is to the repository itself.

The page's commit is written into the built page. `npm run build` takes it from `WHIST_WEB_COMMIT`, else from
`git rev-parse HEAD` run in this folder, when the repository is this folder and not one that holds it, else
it has none. A tree with changes is marked, and About says the build has local changes. The image's build has no git history, so the commit is a build
argument: CI gives it the commit, and a local image build is given it as
`WHIST_WEB_COMMIT=$(node tools/buildCommit.mjs) docker compose build web`, which works the commit out by
the same rule, so a tree with changes is marked. A page built with none, or of a tree with changes,
links to the repository, and About says that its commit is unknown or that it has local changes.

About lists the licence (AGPL-3.0-or-later), both links, the versions and commits of the page and the
server, the protocol, and everything the page keeps in the browser, by name: your player token, your name
and portrait for online tables, the last New Game, the pace, the language, and two notes that last until
the tab is closed. There are no accounts and no cookies, and the page asks no other site for anything.
"Forget this browser" asks first, then removes exactly those names from the browser's storage and loads the
page again; a game you are at can then no longer be returned to. "Report a problem" opens this repository's
issues.

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

and open http://127.0.0.1:8080/, which shows the main menu, or http://127.0.0.1:8080/?solo=4 for a game
at once. `server.json` points the server at `dist/`, and lifts the limits per address on connections, tables and
failed joins, since your tabs and tests are all one address.

**An online table on one machine.** Choose Play online, give a name, and Create a table: its lobby shows
the link, `/t/` and the table's code. Open that link in a private window, or another browser: a page
is one member by its token, kept in the browser, so a second tab of the same browser takes the table
from the first (the first is told so). Say who you are there and Join, fill any other seat with a
computer player from the host's lobby, and Start game.

While working on the page, `npm run dev` serves it on port 5173 and passes `/ws` through to the
server on port 8080, so an edit shows without a build.

## Running it with Docker

From a checkout with its submodules (`git submodule update --init --recursive`), the page's image and
the server's, built from this checkout:

```
docker compose build server
docker compose build web
docker compose up
```

Then open http://127.0.0.1:8000/?solo=4. Build one image at a time, the server's first: a bare
`docker compose build`, or `up --build`, builds both at once. The server's compiles Drogon too and
takes several minutes, and `JOBS`, the number of compile jobs, is 2 unless
`WHIST_JOBS` says otherwise, so that the machine stays usable. The server reports as its commit what
`WHIST_SERVER_COMMIT` holds, for example
`WHIST_SERVER_COMMIT=$(git -C libs/romanian_whist_server rev-parse --short HEAD)`, and the page names what
`WHIST_WEB_COMMIT` holds, for example `WHIST_WEB_COMMIT=$(node tools/buildCommit.mjs)`, which marks a tree
with changes as `-dirty` where `git rev-parse HEAD` would call it clean. The page's image alone is
`docker build --build-arg WHIST_WEB_COMMIT=$(node tools/buildCommit.mjs) -t romanian_whist_web .`.

## Tests

```
nice -n 19 npx vitest run --maxWorkers=2    # the unit tests
nice -n 19 npm run e2e -- --workers=1       # the page against the server, in Chromium
nice -n 19 npm run look -- --workers=1      # the look captures, below
```

The unit tests read the server's protocol fixtures, so they need the submodule. They test the pages'
decisions as pure functions: what a sheet shows, what a click sends, a lobby's seats, a New Game's
names and validation. One reads the source for every string the page translates, and fails on one with
no Romanian, a translation that loses a placeholder, or a count without its three forms. The
end-to-end tests start the server built in the submodule, or the one `WHIST_SERVER` names, and play
through the page: solo games, the sheets, New Game, the language dialog, a game in Romanian, the footer and
About, and online tables played by three browsers at once, each in a context of its own. They start with English chosen,
as a browser that has been through the dialog; the tests of the dialog start with nothing. One test starts a
server of its own on port 8091 with a drain of five seconds, stops it with a game in progress, and checks
the banner, the refusal of a new game, the game cut at the deadline and the exit with no failure. The
server's limits per address are lifted in `tests/e2e/server.json`, since every test is one address. The tests need
Playwright's Chromium once: `npx playwright install chromium`.

With the stack above running, one more test loads the page under the image's content-security-policy
and starts a solo game, and fails on a violation, a script error, a failed request or an error answer:

```
WHIST_URL=http://127.0.0.1:8000 npx playwright test --config playwright.docker.config.ts
```

## Comparing the look with the desktop client's

The page must look like the desktop client, which decides every difference. Two things make that
checkable without a server:

- `npm run look` builds `look.html` into `dist-look/` (never shipped) and renders each look fixture
  at the desktop picture's own size, into `build/shots/web/<name>.png`. The server's, in
  `libs/romanian_whist_server/protocol/look/*.json`, are nine captures: `table-3-players` to
  `table-6-players`, `bidding`, `table-empty` and `hand-1-card`, `hand-4-cards` and `hand-8-cards`.
  The page's own, in `tests/look/fixtures/*.json`, are the seven sheets over a table, the main
  menu and the language dialog. The desktop's tool builds those by hand, so `tools/sheet_fixtures.py` does too, from its
  numbers; run it again after changing one, and commit what it writes.
- `npm run compare` pairs each capture with the desktop's picture of the same name, which its
  screenshot tool writes (`WHIST_SHOTS_DIR=build/shots/web-reference ./build/tests/desktop_tests
  "[.screenshot]"` in the desktop's checkout). Put those pictures in `build/shots/desktop/`;
  without them it says so and writes nothing. It writes, into `build/shots/compare/`,
  `compare-<name>.png` (the page on the left, the desktop on the right), `diff-<name>.png`, a
  `compare-hand-*-closeup.png` for each hand, and prints each pair's mean absolute difference.
- The same captures are also taken in Romanian, into `build/shots/web-ro/`, for reading the
  translation. The desktop has no pictures of them, so `npm run compare` leaves them alone. The
  language dialog has no words, so it is taken once, and paired with the desktop's `language.png`.
- `python3 tools/measure_shots.py` says, for each sheet, how many pixels each of its parts sits from
  the desktop's. The spacings in `src/sheets/styles/sheet.css` are numbers taken that way, and the
  tool takes them again after a change of a face, a size or a sheet.

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

## Keyboard, screen readers and touch

- **Keys.** At the table, `0` to `8` bid while the strip asks (the struck-out bid's digit is ignored),
  and `1` to `8` play that card of the hand, counted from the left, if a click on it would. Only bare
  digits, the keypad's too, and never a held key. Left and Right pick a card that can be played, or a
  bid, and Enter takes the pick; it is raised as the cursor raises a card. Space lets a held round
  go, Esc raises the pause menu or closes a sheet, and Alt+N, Alt+S, Alt+R and Alt+X are New Game,
  Settings, Rules and Exit. No key acts while a sheet holds the table, nor while the language dialog is
  over the page, nor in a text field. Tab reaches every control, the hand being one stop, and the
  focus is always drawn.
- **Screen readers.** Every picture of a card has a name ("Queen of spades", "Ana: Queen of hearts" for
  a face in a rack), and a card of the hand says on your turn whether it is playable, and is a pressed
  button while it is the pick, as a bid is; each name panel has a name too ("Ana, Taken/Bid: 1/2, to
  move"). A polite live region says each round begun, with its trump, the question put to you, and each
  bid, card ("Ana played the queen of hearts"), trick taken, round scored and the game's end, in the
  page's language, and nothing else. In Romanian a card is a rank in a word, "de" and its suit:
  "Ana a pus damă de inimă roșie", "Atu: Zece de inimă neagră".
- **Touch.** A first tap on a card picks it, as a key does, and a second tap on the same card plays it;
  a tap anywhere else puts the pick down; a mouse plays at once, and a tap on a bid bids. A touch screen
  gets no double-tap zoom, no callout and no selection. Where the pointer is coarse the bid strip and
  the hand are drawn larger on a small window, so that a bid is 44 pixels from the next and a card of the
  fan 32, and the corner panels are drawn no smaller than half; the look is the mouse's everywhere else.
- **Small windows.** The page works down to 740 by 360: the main menu draws smaller to fit, a sheet taller
  than the window scrolls and opens at its top, and the table is fitted as always. A phone held upright is
  told to turn it.

## The Romanian

The desktop's translation is imported by `tools/import_ts.py` into `src/i18n/ro.desktop.json`, with
the desktop's commit written into it. It needs only Python:

```
python3 tools/import_ts.py --desktop ../romanian_whist_desktop
```

The strings the desktop has no entry for are in `src/i18n/ro.page.json`, written by hand, so that
importing again never overwrites them. English has no catalogue: the source text is English, as in Qt,
and `t()` shows it where a catalogue has no entry. A count is chosen among a translation's three forms
by Qt's rule for Romanian. The language is fixed once, before the page makes any text.

## Licence

AGPL-3.0-or-later, as the server and the engine are.

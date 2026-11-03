# Romanian Whist in the browser: the page's implementation plan

> **Status: phase 1's echo page is built. The page proper, phases 6 to 8, is not.**
>
> Until 2026-11-03 this plan was part of the server's plan, `docs/web-client-plan.md` in
> [`romanian_whist_server`](https://github.com/conectionist/romanian_whist_server). That day the
> owner moved the page to this repository, and this part of the plan with it: its §2 to §11 were
> that plan's §8.1 to §8.10. The server plan still holds what the two share: the six rules, what is
> being built, the protocol, the branch workflow and the review procedure, and every decision but
> D5, D14 and D18.

This plan is for whoever builds the page: the owner, or an agent picking the work up cold. It says
what to build, which existing code each part comes from, in what order, and how to tell each phase
is done. When a phase is finished, its outcome is written under it, as the server plan's phases are.

**Read first, in this order**

1. This file, once, top to bottom.
2. The server plan, [`docs/web-client-plan.md`](https://github.com/conectionist/romanian_whist_server/blob/master/docs/web-client-plan.md) in
   `romanian_whist_server`: above all §1 (the six rules), §2 (what is being built), §5.3 (what the
   others see), §6 (the protocol) and §7 (tables, seats and players). The page shows what the
   server sends.

   The links to it point at the server's `master`, where its work ends up. Until it gets there,
   `master` holds an older plan: read the one in this repository's submodule,
   `libs/romanian_whist_server/docs/web-client-plan.md`, which is the server this page is built
   against, or the one on the parent branch that the server's `CLAUDE.md` names.
3. The desktop client itself, because the page must look like it: run it, or look at the pictures
   its `tests/ScreenshotTool.cpp` takes. Then its `docs/ui-redesign/IMPLEMENTATION_PLAN.md`, whose
   phase outcomes record where the desktop client departed from its mock-up,
   `docs/ui-redesign/mockup/romanian_whist_table.html`. The mock-up's code is a head start and no
   more: wherever it and the desktop client differ, the desktop client wins
   ([§2](#2-the-look-the-desktop-client-wins)).

---

## Contents

1. [Summary](#1-summary)
2. [The look: the desktop client wins](#2-the-look-the-desktop-client-wins)
3. [Technology](#3-technology)
4. [Code layout](#4-code-layout)
5. [The playback queue](#5-the-playback-queue)
6. [Rendering](#6-rendering)
7. [From the mock-up's script](#7-from-the-mock-ups-script)
8. [From the desktop client](#8-from-the-desktop-client)
9. [Assets](#9-assets)
10. [Languages](#10-languages)
11. [Keyboard, screen readers, touch and small screens](#11-keyboard-screen-readers-touch-and-small-screens)
12. [Security](#12-security)
13. [Testing](#13-testing)
14. [Building and running locally](#14-building-and-running-locally)
15. [Phases](#15-phases)
16. [Risks](#16-risks)
17. [Decisions, with defaults](#17-decisions-with-defaults)
18. [References](#18-references)

---

## 1. Summary

**What.** Romanian Whist's browser client: solo games against computer players, and online tables.
Both are played on the server, which is `romanian_whist_server`, a submodule here. The server holds
every rule of the game and the protocol; this repository holds the page.

**How.** TypeScript, built with Vite, with no UI framework. The page talks to the server over one
WebSocket per browser tab, in the server's protocol. It applies no rule of the game: what it may
show, and what the player may do, come from the server.

**Two rules.** They are rules 5 and 6 of the server plan's six.

1. **Events animate; snapshots are the truth.** Each game message carries the whole state after
   the event, as that viewer may see it. The page animates the event, then shows the state. It
   never works state out for itself ([§5](#5-the-playback-queue)).
2. **The desktop client decides how the page looks.** Where the desktop client and the mock-up
   differ, the desktop client wins, even when that means writing new code instead of reusing the
   mock-up's ([§2](#2-the-look-the-desktop-client-wins)).

**Order of work.** The page waits for the server's phase 3, after which it can be built against
fixtures. Then the table (phase 6), the sheets and menus (phase 7), and Romanian, keyboard and
touch (phase 8). Offline solo play is an optional extra (phase 10).
[Section 15](#15-phases) has the phases.

---

## 2. The look: the desktop client wins

**The page must look like the desktop client. Where the desktop client and the mock-up differ, the
desktop client wins, even when that means writing new code and throwing the mock-up's away.**
Decided by the owner, 2026-10-27.

The reference is the desktop client's current release, 2.0.0 as this is written; if its look
changes later, the page follows. The reference is never the mock-up, and never this plan's
description of either. It is the desktop client as it runs, and its source.

The mock-up is useful because the desktop client was built from it: most of its numbers and much of
its CSS are still the desktop client's. But the desktop client departed from it in many places over
the redesign's 13 phases, so the mock-up's code is reused only where it still matches:

1. **Before reusing any mock-up function, CSS rule or value, find the desktop code that draws the
   same thing and compare them.** [§7](#7-from-the-mock-ups-script)'s last column names that
   code for every part of the mock-up's script, and [§8](#8-from-the-desktop-client) for every
   part of the desktop client. Compare sizes, positions, colours, fonts, shadows, motion paths and
   timings, and wording.
2. **The same:** reuse it.
3. **Different:** write what the desktop client does, for the browser, however much of the
   mock-up's code that replaces and whatever it costs. Reuse is never a reason to keep a
   difference.
4. **What the mock-up does not have at all** comes from the desktop client alone: the main menu,
   New Game, the language dialog, pause, the final results, Forehead faces, the 2-player table.
5. **What neither has** is new, and is drawn in the desktop client's style, with its panels, colours
   and fonts (`src/paint/Theme.cpp`, `Panel.cpp`), never in the mock-up's: the online lobby, the
   connection and replacement notices, the turn countdown.

Some known departures, to show the kind. The desktop's redesign plan records them all, phase by
phase, and the desktop's source is the final word:

- Belleza for headings, because the mock-up's Marcellus has no ș or ț;
- the round logo on the table, with the played cards placed round it;
- the scoreboard's RUN column;
- the portraits, which are files;
- projective racks, where the mock-up tilts its fans with `rotateX`;
- the 2-player table;
- faces in the racks in a Forehead round;
- no toasts: the desktop client refuses an illegal card without one;
- every sheet.

**Only two kinds of difference may stay:**

- **Those the browser forces.** For example, Qt and Chrome space the same font slightly
  differently; the desktop's redesign plan found its scoreboard lines a pixel lower than the
  mock-up's for that reason.
- **Those the owner accepts**, named in a phase's outcome.

Each visual phase ends with side-by-side comparisons against the desktop client's own screenshots
([§13.3](#133-the-look)).

---

## 3. Technology

- **TypeScript, built with Vite, and no UI framework.** The table is a fixed design space scaled
  to the window, as in the desktop client, and the state arrives whole, so plain DOM and CSS are
  enough. They also let the mock-up's code be reused directly wherever it matches the desktop
  client. A framework would add a layer without removing any work.
- **CSS** for the look; the **Web Animations API** for motion, set to the desktop client's paths
  and timings; **CSS `matrix3d`** for the racks ([§8](#8-from-the-desktop-client)).
- **Vitest** for unit tests; **Playwright** for end-to-end tests and screenshots.

---

## 4. Code layout

The repository:

```
romanian_whist_web/                 AGPL-3.0-or-later, like the server and the engine
├── libs/romanian_whist_server/     submodule: the server, for its fixtures and the end-to-end tests
├── src/                            TypeScript: net, play, table, sheets, lobby, i18n
├── public/                         generated assets (§9), fonts and their licences
├── tests/                          Vitest (units), Playwright (end to end, screenshots)
├── tools/                          asset import, translation import, screenshot pairing
├── docs/                           this plan, and the mock-up
└── CLAUDE.md                       the owner's machine rules (§14)
```

`src/`:

```
net/       the socket (connect, hello, reconnect with back-off), protocol types, the decoder
play/      the store (table state, snapshot, history, last trick, prompt), the playback queue
table/     stage scaling, seat geometry, name panels, racks, hand, trick, lead mark,
           scoreboard, trick panel, bid strip, bid bubbles
sheets/    round, history, last trick, final results, rules, settings, pause
lobby/     main menu, solo setup, create and join, the table's lobby
i18n/      t(), plural and gender helpers, the generated catalogues
dom/       element builders; text goes in only through textContent
assets/    the generated asset manifest (§9)
```

---

## 5. The playback queue

- **Every server message goes into one queue, handled in order.**
  - A `game` message animates its event (a card's flight, a trick swept to its winner, a bid
    bubble), then renders its snapshot.
  - A `prompt` becomes live when the queue reaches it.
  - A `sync` empties the queue.
- **Animation speed** is the viewer's setting: the desktop client's four stops, Off to Slow.
- **Falling behind.** When more than a few messages are waiting, the queue applies them without
  animation until it has caught up. This covers Instant bots, a slow device, and a tab coming back
  from the background.
- **Your own card moves as soon as you click.** The answer goes out, and the server's
  `cardPlayed` for your seat confirms it without animating it again. An error puts the card back,
  which should not happen, because the page offers only legal moves.
- **The countdown.** A prompt's deadline shows as a ring on your name panel for its last 15 s,
  counted from when the page received the prompt.

---

## 6. Rendering

- **Each element of the table is created once and updated in place** from each snapshot, keyed by
  seat and by card, so animations and keyboard focus survive the updates. The mock-up rebuilds
  everything with `innerHTML` on every change. That is fine for a mock-up, and wrong for a page with
  animations running and names typed by strangers.
- **Seats are turned so that the viewer sits at the bottom:** displayed seat = (seat − you + n)
  mod n. A watcher sees seat 0 at the bottom. The two dozen places where the mock-up assumes that
  you are seat 0 become "displayed seat 0".

---

## 7. From the mock-up's script

Line numbers are those of `docs/ui-redesign/mockup/source/table.js` in the desktop repository.

"Gone" and "Replaced" are about how the page is built. Everywhere else, the desktop client decides
what the page draws, by the procedure of [§2](#2-the-look-the-desktop-client-wins). The
mock-up's code survives only where it already matches the desktop source in the last column. Paths
in that column are in the desktop repository.

| Mock-up | Lines | In the page | Desktop source that decides |
|---|---|---|---|
| The rules: `scheduleFor` to `scoreRound` | 3–169 | **Gone.** The engine decides, and the page shows what it is told. Keeping any of it would give two sets of rules that can disagree | – |
| The bots and the demo game: `botBid`, `botPlay`, `autoRound`, `demoGame` | 171–240 | **Gone.** Fixtures ([§13.3](#133-the-look)) replace the demo's mid-game opening | – |
| `portrait()` | 251–270 | **Gone.** Portraits are the catalogue's files | `src/paint/Avatars.cpp` |
| `backSvg()`, the noise and grain, the textures | 271–291 | The textures are the desktop client's own files. The card back is ported from the desktop client's painted one. The grain is whatever the desktop's table top draws | `src/paint/CardRenderer.cpp`, `src/table/TableTopItem.cpp` |
| `fit()`, `toStage()` | 293–335 | The desktop client fits its fixed table to the window the same way, uniformly and centred, so the idea carries over. The numbers and the corner panels' places are the desktop client's | `src/table/TableView.cpp`, `src/table/TableSpace.cpp` |
| `LAYOUTS`, `trickPos`, `plaqueCenter`, `rackAngle` | 337–373 | The desktop client's numbers, which add the 2-player table and the played cards round the logo | `src/table/SeatLayout.cpp`, `src/table/TrickItem.cpp` |
| `buildSeats` | 379–423 | The seats' elements, created once ([§6](#6-rendering)), placed where the desktop client places them | `src/table/SeatLayout.cpp`, `src/table/RackItem.cpp` |
| `renderPlaques`, `pillFor` | 424–450 | Name panels with the portrait, name, Taken/Bid pill and turn ring, from `snapshot.seats`, plus presence from `tableState` | `src/table/SeatItem.cpp` |
| `renderFans` | 451–462 | Projective racks drawn with `matrix3d`: backs from `cards`, faces from `hand` in a Forehead round | `src/table/RackItem.cpp` |
| `renderHand`, `suitOrder` | 463–495 | Your `hand`, ordered and fanned as the desktop client does it; legality from the prompt | `src/table/HandItem.cpp`, `src/core/HandLayout.cpp`, `src/core/CardOrder.cpp` |
| `renderTrick`, with the lead mark | 496–538 | From `snapshot.table` (`winning`, `ledBy`), placed round the logo; the mark only while playing | `src/table/TrickItem.cpp`, `src/table/LeadMarkItem.cpp` |
| `renderScore` | 539–560 | Each seat's `bet`, `won` and `total`; RUN from `wins` and `losses`; `bets`; the trump | `src/table/ScoreboardItem.cpp` |
| `renderTrickInfo` | 561–601 | From the phase, `active`, the table and the prompt; the desktop client's sentences, from `t()`, with gender agreement | `src/table/TrickPanelItem.cpp`, `src/table/PersonText.cpp` |
| `bubble`, `animateIn`, `sweep`, `finishTrick` | 619–661 | The desktop client's motion, driven by events: its paths, timings, easing and fades | `src/table/Motion.cpp`, `src/table/BidBubbleItem.cpp` |
| `step()` | 662–702 | **Replaced** by the playback queue ([§5](#5-the-playback-queue)) | – |
| `humanPlay`, `showBidStrip`, `humanBid` | 703–747 | Send `play` or `bet` with the prompt's id. The bid strip comes from the prompt's `max` and `forbidden`, and is drawn as the desktop client draws it | `src/table/BidStripItem.cpp` |
| The sheets: `showRoundSheet` to `showSettings` | 749–829 | The desktop client's sheets and overlay, not the mock-up's modal: their layout, sizes, buttons and wording. The data comes from `roundScored`, the sync's history, the last trick and `gameOver` | `src/ui/Overlay.cpp`, `src/ui/*Sheet.cpp`, `src/ui/GameOverPanel.cpp` |
| `toast` | 831–839 | The desktop client has no toasts. The page still needs a notice for connection and replacement news: a new element in the desktop client's style ([§2](#2-the-look-the-desktop-client-wins), point 5) | `src/paint/Theme.cpp`, `src/paint/Panel.cpp` |
| The menu bar and the players switch | 872–886 | The desktop client's menu bar. The lobby replaces the switch | `src/ui/MenuBar.cpp` |

---

## 8. From the desktop client

Paths are in the desktop repository.

| What | Where |
|---|---|
| Fitting the fixed table to the window, uniformly and centred | `src/table/TableView.cpp`, `src/table/TableSpace.cpp` |
| Seat positions for 2 to 6 players, the corner panels | `src/table/SeatLayout.cpp`, `src/table/TableSpace.cpp` |
| The name panels: portrait, name, Taken/Bid pill, turn ring | `src/table/SeatItem.cpp` |
| The racks | `src/table/RackItem.cpp`. It maps each rack with `QTransform::quadToQuad`, a projective transform. A CSS `matrix3d` can hold the same 3×3 matrix (embedded in a 4×4), so port the quad maths and get the same racks exactly, instead of the mock-up's `rotateX` approximation |
| The hand: its fan, raised cards and dimmed ones, its order | `src/table/HandItem.cpp`, `src/core/HandLayout.cpp`, `src/core/CardOrder.cpp` |
| The played cards round the logo, the lead rhombus, the table top | `src/table/TrickItem.cpp`, `src/table/LeadMarkItem.cpp`, `src/table/TableTopItem.cpp` |
| The scoreboard with RUN, the trick panel | `src/table/ScoreboardItem.cpp`, `src/table/TrickPanelItem.cpp` |
| The bid strip and the bid bubbles | `src/table/BidStripItem.cpp`, `src/table/BidBubbleItem.cpp` |
| Colours, gradients, panels, shadows, fonts | `src/paint/Theme.cpp`, `Gradients.cpp`, `Panel.cpp`, `Shadows.cpp`, `Fonts.cpp` |
| The card back, which is painted, not a file | `src/paint/CardRenderer.cpp` (`back()`) |
| Motion and its pace | `src/table/Motion.cpp` |
| The sheets, the overlay, the menu bar, the main menu, New Game, the language dialog | `src/ui/` |
| Sentences about people, with Romanian agreement | `src/table/PersonText.cpp` |
| Every decision about the look, and why it was made | `docs/ui-redesign/IMPLEMENTATION_PLAN.md`, each phase's outcome |

---

## 9. Assets

- **One import tool.** `tools/import_assets.py`, using Pillow as `build_mockup.py` does, takes the
  desktop repository's `resources/` at a given commit and writes the web versions:
  - the cards as WebP, at twice their largest size on screen;
  - the portraits and the table textures as WebP;
  - the fonts (Cinzel Decorative, Belleza, Alegreya Sans) as WOFF2, with their OFL licences;
  - `avatars.json` and `player_names.json`, copied;
  - a manifest that records the desktop commit.
- **The card back** is painted by the desktop client, not loaded from a file. Port it as an SVG.
- **Budget:** under about 2 MB for the first load. Portraits load as seats need them.

---

## 10. Languages

- **`t(context, source, args)` mirrors Qt's `translate()`**, so strings ported from the desktop
  client keep their wording.
- **One import tool.** `tools/import_ts.py` turns `i18n/romanian_whist_desktop_ro_RO.ts` (211
  strings, 8 with plural forms) into `en.json` and `ro.json`.
- **New strings**, for the lobby and the connection notices, are added by hand in both languages.
- **Plurals:** port Qt's own Romanian rule (three forms, one line) instead of using
  `Intl.PluralRules`. The two disagree on some numbers above 100 (101, for one), and Qt's rule is
  the one the reviewed translation was written against.
- **Gender agreement:** port `src/table/PersonText.cpp`.
- **Every string goes through `t()`** from the first phase of the page, even before Romanian
  arrives.

---

## 11. Keyboard, screen readers, touch and small screens

- **Keyboard:** the keys the desktop plan's §20 sets out. Digits bid and select, arrows move the
  selection, Enter commits, Space advances between tricks and rounds, and Esc closes a sheet.
- **Screen readers:**
  - every name panel and card is labelled with the accessible names of the desktop plan's §20
    ("Queen of spades, playable");
  - a polite live region announces moves ("Ana plays the queen of hearts");
  - colour is never the only cue (the desktop plan's §18): legal cards are lifted as well as lit,
    and winners are starred as well as highlighted.
- **Reduced motion:** treat `prefers-reduced-motion` as the desktop client's animation setting,
  Off.
- **Touch:**
  - the first tap selects a card, shown as the desktop client shows a card selected from the
    keyboard, and the second plays it, so a stray tap never plays;
  - controls are at least 44 px;
  - `touch-action: manipulation` on the table.
- **Small screens:** the table scales to fit, as the desktop client's does (`TableView.cpp`), and
  phones held sideways work. In the first version, a phone held upright gets a "turn your phone"
  hint.

---

## 12. Security

The server plan's
[§9](https://github.com/conectionist/romanian_whist_server/blob/master/docs/web-client-plan.md#9-security-and-fairness)
sets the rules. The page's share:

- Player-chosen text goes in only through `textContent`.
- The page works under the strict Content-Security-Policy the server sends: no inline script, and
  `connect-src 'self'`.
- Every asset is served by the server itself, so the page makes no third-party requests. That is
  also a privacy point.
- The token is kept in the browser's storage and sent only in `hello`, never in a URL or a log.
- **The footer** links "Source" to the server at the commit `GET /version` gives, and to this
  repository at the commit the page was built from, which the build writes into the page. The
  AGPL's section 13 needs both (the server plan's
  [§12](https://github.com/conectionist/romanian_whist_server/blob/master/docs/web-client-plan.md#12-deployment-and-operations)).
- **An About page** says what the page keeps: a chosen display name and a random token in the
  browser's storage, with no accounts and no cookies.

Both are built in the server plan's phase 9, as the page's share of it.

---

## 13. Testing

### 13.1 The protocol

The page's tests decode every fixture in the server's `protocol/fixtures/`, read through the
submodule, with the page's own decoder. A field renamed in the server fails them once the
submodule moves to that server (the server plan's
[§6.9](https://github.com/conectionist/romanian_whist_server/blob/master/docs/web-client-plan.md#69-keeping-the-two-sides-in-step)).

### 13.2 End to end

- **Playwright**, headless Chromium, one worker:
  - a solo game;
  - an online game with three browser contexts;
  - a reload mid-trick;
  - a player who drops, is replaced, and comes back.

They run against a real server, built from the submodule ([§14](#14-building-and-running-locally)).

### 13.3 The look

- **The page renders from fixtures without a server**, so screens can be checked in any state.
- **A tool in the server repository, built in phase 6, plays the desktop client's
  `tests/ScreenshotTool.cpp` games** (the server plan's [§10.5](https://github.com/conectionist/romanian_whist_server/blob/master/docs/web-client-plan.md#105-the-look)): the same
  seeds and players, to the same moments. It writes each viewer's snapshot as a fixture. The sheets
  get fixtures built by hand, as the screenshot tool builds theirs.
- **Playwright renders each fixture at the desktop shot's own size**: 1920×1080 for the
  whole-window shots, 1920×1034 for `table-empty`, the hands and the sheets. A script pairs each
  one with the desktop client's shot of the same name as `compare-<name>.png`, web on the left,
  desktop on the right, in a git-ignored folder.
- **Only the desktop client's pictures are a reference.** Never pair the page with the mock-up's
  pictures in `docs/ui-redesign/screenshots/`: they show what the desktop client departed from.
- **Each visual phase ends by linking these comparisons**, with a line or two on what matches and
  what still differs. This is the desktop repository's practice for its redesign phases.
- **Every difference that remains is one the browser forces or the owner has accepted**, and the
  phase's outcome names it ([§2](#2-the-look-the-desktop-client-wins)).

---

## 14. Building and running locally

**The owner's machine rules apply unchanged**, as in the server's `CLAUDE.md`. This repository's
`CLAUDE.md` carries the page's share of them:

- `nice -n 19 npx vitest run --maxWorkers=2`;
- `nice -n 19 npm run e2e -- --workers=1`;
- one heavy command at a time, and long jobs in the background.

**The server for the end-to-end tests** is built from the submodule, by the server's own rules:

```
git submodule update --init --recursive
cd libs/romanian_whist_server
cmake --preset default
nice -n 19 cmake --build --preset default -j 2
```

Its first build compiles Drogon too, which takes several minutes at `-j 2`, so run it in the
background. `WHIST_SERVER` names another server binary instead, for example one built in a
checkout of the server beside this one.

- **Node** 22.12 or later. The owner's machine has Node 24 and npm 11. npm 10 fails to install
  these packages, with an `edgesOut` error, so `package-lock.json` is made with npm 11.
- **Day to day:** the Vite dev server (port 5173) passes `/ws` through to the server (port 8080).
  Or the server serves `dist/` itself, as it does in production.
- **CI:** one Linux job, which builds the page and runs its unit tests. End-to-end tests and
  screenshots run locally, at the end of a phase. Once the server writes its fixtures, the job
  checks out the submodule too, without the submodule's own submodules, so that §13.1's tests run.
- **Python** 3.12 with Pillow, for the mock-up's build script and the import tools.
- **Pull requests:** change a PR's title or description with
  `gh api -X PATCH repos/<owner>/<repo>/pulls/<N> -F body=@<file>`. `gh pr edit` fails on the
  owner's repositories with a "Projects (classic)" GraphQL error.

---

## 15. Phases

The phases are numbered in one sequence with the server's. Phases 0 to 5, 9 and 11 are in the
server plan's
[§13](https://github.com/conectionist/romanian_whist_server/blob/master/docs/web-client-plan.md#13-phases),
and 6, 7, 8 and 10 are here. Phase 9 has a share here too: the footer and the About page (§12).
The branch workflow and the code review procedure are that section's. Its step 5, building and
testing both presets after the fixes, means here the page's build, unit tests and browser tests.
Sizes are relative: S, M, L.

After the server's phase 3, the page can be built against fixtures while the server's phases 4 and
5 go on.

### Phase 6: the table page — L

- **Work:**
  - the stage and seat geometry, name panels, racks, hand, played cards, lead mark, scoreboard,
    trick panel, bid strip and bid bubbles;
  - the playback queue;
  - rendering from fixtures, which the fixture tool writes (§13.3). The tool is built in the server
    repository, on its parent branch;
  - `t()` everywhere, English only so far;
  - every element ported from its desktop source ([§7](#7-from-the-mock-ups-script)'s last
    column), with the mock-up's code kept only where it matches
    ([§2](#2-the-look-the-desktop-client-wins)).
- **Done when:**
  - the comparisons with the desktop client's `table-3-players` to `table-6-players`, `bidding`,
    `table-empty` and `hand-*` shots are linked;
  - no difference from the desktop client remains that the browser does not force or the owner
    has not accepted;
  - the owner approves.

### Phase 7: sheets and menus — L

- **Work:**
  - the round sheet, history, last trick, final results, rules, settings and pause, as the
    desktop client's overlay and sheets draw them, not the mock-up's modal;
  - the main menu and solo setup, as the desktop client's main menu and New Game;
  - the online lobby and its screens, which neither client has, in the desktop client's style
    ([§2](#2-the-look-the-desktop-client-wins), point 5);
  - the menu bar.
- **Done when:**
  - the comparisons with the `sheet-*` and `menu` shots are linked;
  - no difference from the desktop client remains that the browser does not force or the owner
    has not accepted;
  - everything in
    [the server plan's §2.1](https://github.com/conectionist/romanian_whist_server/blob/master/docs/web-client-plan.md#21-carried-over-from-the-desktop-client)
    works in solo play.

### Phase 8: Romanian, keyboard, touch — M

- **Work:**
  - the imported translations, the new strings in Romanian, gender agreement and plurals;
  - keyboard play, the live region, touch, small screens.
- **Done when:**
  - the owner has reviewed the Romanian;
  - a game can be played with the keyboard alone;
  - a phone held sideways finishes a game.

### Phase 10 (optional): offline solo — M to L

- **Work:**
  - `server/core`, without Drogon, compiled with Emscripten (in the server repository) and run in
    a Web Worker. The seat driver's wait becomes an awaited message from the page, using JSPI
    (Chrome and Edge 137+, Firefox 153+, Safari 27+), with Asyncify as the fallback for other
    browsers (about 50% larger code, and its handling of virtual calls needs tuning);
  - the same protocol, over `postMessage`;
  - a service worker that caches the page.
- **Done when:** a solo game finishes with the network off.

---

## 16. Risks

| Risk | What keeps it small |
|---|---|
| Mock-up code kept where the desktop client differs | The check of [§2](#2-the-look-the-desktop-client-wins) before any reuse; [§7](#7-from-the-mock-ups-script)'s last column; comparisons only against the desktop client's pictures |
| The look takes longer than planned, because more of the mock-up's code has to be replaced than hoped | Expected, and never a reason to keep a difference ([§2](#2-the-look-the-desktop-client-wins)); phases 6 and 7 are sized L for it. Port the desktop client's geometry and numbers, not Qt's mechanisms. Fixtures, and comparisons in every visual phase |

---

## 17. Decisions, with defaults

They keep the numbers they have in the server plan's
[§15](https://github.com/conectionist/romanian_whist_server/blob/master/docs/web-client-plan.md#15-decisions-with-defaults),
where the other decisions are. The plan assumes each default until the owner decides otherwise.

| # | Question | Default |
|---|---|---|
| D5 | What is the page built with? | TypeScript and Vite, no UI framework |
| D14 | Phones? | Held sideways: yes. Held upright: later |
| D18 | Which look? | **Decided by the owner, 2026-10-27:** the desktop client. Where it and the mock-up differ, the desktop client wins, even when that means new code instead of the mock-up's ([§2](#2-the-look-the-desktop-client-wins)) |

---

## 18. References

**The server** (`romanian_whist_server`)

- `docs/web-client-plan.md`: §1 (the six rules), §2 (what is being built), §4.8 (pacing, the round
  hold and pause), §5.3 (what the others see), §6 (the protocol), §7 (tables, seats and players)
  and §9 (security).
- Once built: `protocol/PROTOCOL.md` and `protocol/fixtures/`.

**The desktop client** (`romanian_whist_desktop`)

- [§8](#8-from-the-desktop-client)'s table, for the look.
- `tests/ScreenshotTool.cpp`: the screens to compare against.
- `docs/ui-redesign/`: the redesign plan, the mock-up and its source.
- `docs/QT_CLIENT_PLAN_proposal1.md`: §18 (colour is never the only cue) and §20 (keyboard).

**This repository**

- `docs/web-client-mockup/`: the page's mock-up, its `README.md` and its source.

**Outside**

- Emscripten: [asynchronous code, JSPI and Asyncify](https://emscripten.org/docs/porting/asyncify.html).
- [caniuse: WebAssembly JSPI](https://caniuse.com/wf-wasm-jspi).

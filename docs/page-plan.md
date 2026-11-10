# Romanian Whist in the browser: the page's implementation plan

> **Status: phase 1's echo page is built, and phase 6, the table page, is complete (2026-11-10): it
> draws the table and plays a solo game against the server (PR #3). The rest of the page, phases 7
> and 8, is not built.**
>
> Until 2026-11-03 this plan was part of the server's plan, now `docs/server-plan.md` in
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
2. The server plan, [`docs/server-plan.md`](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/docs/server-plan.md) in
   `romanian_whist_server`: above all §1 (the six rules), §2 (what is being built), §5.3 (what the
   others see), §6 (the protocol) and §7 (tables, seats and players). The page shows what the
   server sends.

   The links to it point at the server's parent branch, `ccr-c8ac042f-e6e18n`, which holds the
   current plan. They move to the server's `master` when that branch is merged there. This
   repository's submodule holds the copy this page is built against:
   `libs/romanian_whist_server/docs/server-plan.md`.
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
[§9](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/docs/server-plan.md#9-security-and-fairness)
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
  [§12](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/docs/server-plan.md#12-deployment-and-operations)).
- **An About page** says what the page keeps: a chosen display name and a random token in the
  browser's storage, with no accounts and no cookies.

Both are built in the server plan's phase 9, as the page's share of it. So is the deploy rule:
the page is built from the latest commit of this repository whose submodule points at the server
being deployed, and a server change that no such commit points at gets a submodule update here
first (the server plan's §12).

---

## 13. Testing

### 13.1 The protocol

The page's tests decode every fixture in the server's `protocol/fixtures/`, read through the
submodule, with the page's own decoder. A field renamed in the server fails them once the
submodule moves to that server (the server plan's
[§6.9](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/docs/server-plan.md#69-keeping-the-two-sides-in-step)).

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
  `tests/ScreenshotTool.cpp` games**, with the same seeds and players, to the same moments. It
  writes each viewer's snapshot into the server's `protocol/look/`, which the page reads through
  its submodule (the server plan's
  [§10.5](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/docs/server-plan.md#105-the-look)). The sheets
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
  screenshots run locally, at the end of a phase. From phase 6, which moves the submodule to a
  server with fixtures, the job checks out the submodule too, without the submodule's own
  submodules, so that §13.1's tests run.
- **Python** 3.12 with Pillow, for the mock-up's build script and the import tools.
- **Pull requests:** change a PR's title or description with
  `gh api -X PATCH repos/<owner>/<repo>/pulls/<N> -F body=@<file>`. `gh pr edit` fails on the
  owner's repositories with a "Projects (classic)" GraphQL error.

---

## 15. Phases

The phases are numbered in one sequence with the server's. Phases 0 to 5, 9 and 11 are in the
server plan's
[§13](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/docs/server-plan.md#13-phases),
and 6, 7, 8 and 10 are here. Phase 9 has a share here too: the footer, the About page, and deploying the page with its server
(§12).
The branch workflow and the code review procedure are that section's. Its step 5, building and
testing both presets after the fixes, means here the page's build, unit tests and browser tests.
Sizes are relative: S, M, L.

After the server's phase 3, the page can be built against fixtures while the server's phases 4 and
5 go on.

### Phase 6: the table page — L ✅ COMPLETE

- **Work:**
  - the stage and seat geometry, name panels, racks, hand, played cards, lead mark, scoreboard,
    trick panel, bid strip and bid bubbles;
  - the playback queue;
  - first, in the server repository, the fixture tool (§13.3), on a phase branch of its own off
    the server's parent branch. It is reviewed like any phase, and merged with a merge commit.
    Then the submodule moves to that merge, and CI checks the submodule out (§14);
  - rendering from the tool's fixtures;
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

**Outcome** (branch `web/phase-6-table-page`, PR #3, parent `ccr-209c0806-o444sp`, the last commit
of code `e2eef2e`):

- **The branch.**
  - **The commits,** in the plan's order:
    - the server's fixtures and the parent's name: `9758235` (the submodule moves to `a656cde`, the
      merge of the server's fixture tool), `c962784`;
    - the protocol `b18943f`, the art `2d31580`, `t()` `db62000`, the geometry `362f54f`, the store
      and the table model `031b223`;
    - the table: the room and the felt `4e50382`, the name panels `9517968`, the racks `d49aa8d`,
      the played cards and the lead mark `4bd9a3e`, your hand `2d09f21`, the scoreboard, the trick
      panel and the corner buttons `ae1d1fa`, the bid strip and the bubbles `928a1bb`;
    - the playback queue and the motion `a4e12e8`, the solo game against the server `0291ba5`, the
      docs `13a0d8d`, the look page in CI `d63c560`;
    - the comparison with the desktop's pictures: the scoreboard `17a5ef3`, the trick panel
      `20b3ec1`, the racks `7908bd2`;
    - the first review's fixes: `9c9ea6d`, `6483b2b`, `64184a1`, `e1084f8`, `ee038cb`, `6de5ef3`,
      `ed5075f`, and two the work itself called for, `30aad2e` and `cb5304e`;
    - the second review's fixes: `57a0302`, `d19e162`, `4334fe5`, `e2eef2e`.
  - **The PR** is against the parent, never `master`. The server stays on its own parent branch,
    `ccr-c8ac042f-e6e18n`, and the submodule is at `a656cde`.
- **The owner's choices.** The plan's fifteen questions, all at their defaults:
  - Q1 the branch names; Q2 the reference pictures (below); Q3 a 46 px menu band with no items in the
    window shots; Q4 the corner buttons draw and do nothing; Q5 `?solo=N[&seed=S]` until the page
    has a New Game; Q6 no countdown ring and no presence on the name panels yet;
  - Q7 the WebP gap recorded, and `webp` to be added to the server's `setFileTypes` before phase 7;
    Q8 WebP cards at 310x450, not the desktop's SVGs; Q9 WOFF2 fonts; Q10 the look page built apart
    into `dist-look/`; Q11 `prefers-reduced-motion` reads as Off; Q12 the server plan's tick on a
    docs-only branch after approval; Q13 the desktop commit `5757811`; Q14 D5, D14 and D18 as they
    stand; Q15 the comparisons linked by absolute path;
  - after the first cold review: fix 1 to 8 and 11, skip 9 and 10 and record 10 as a departure, and
    give the fixes a second cold review;
  - after the second: fix all nine, and the helper comment in the controller's test that the
    re-check found backwards; no third review.
- **Built.**
  - **The server's fixtures.** The submodule is at `a656cde`. CI checks it out, not recursively, and
    builds the look page.
  - **The protocol.** Types and a strict decoder: a `DecodeError` names the field. It is tested
    against every file in `protocol/fixtures/` and every look fixture's state.
  - **The art.** `tools/import_assets.py` takes the desktop's cards, portraits, table textures and
    fonts at `5757811` into `public/`, as WebP, WOFF2 with each OFL licence and an SVG card back,
    and writes a manifest. The first load is 457 KiB for the empty table and about 700 KiB with a
    game. The importer's worst case is 945 KiB of its 2 MiB.
  - **`t()`,** English only, with the desktop's contexts and sentences, one-pass `%n` substitution,
    and the gendered sentences about people.
  - **The geometry,** ported from the desktop and tested against its numbers: the stage and its fit,
    the seat layout, the projective racks (`QTransform::quadToQuad` written out, handed to CSS as
    `matrix3d`), the hand's fan, the trick and the lead mark, the card order.
  - **The store and the table model.** The store is applied as pure functions. The model has the shape
    of the desktop's `GameSnapshot`.
  - **The table.** The room, the rim, the felt and the round logo; the name panels; the racks; the
    played cards and the lead mark; your hand; the scoreboard, the trick panel and the corner
    buttons; the bid strip and the bubbles. Every element is made once and updated in place, keyed by
    seat and by card.
  - **Motion.** One playback queue. A card flies from its panel, or from your fan; a full trick is
    swept to its winner; bubbles are said and never waited for. More than four waiting messages catch
    up with no animation. Off, a background tab and `prefers-reduced-motion` animate nothing.
  - **A solo game against the server.**
    - The connection backs off, keeps its token, drops a token the server cannot read and asks once
      without it.
    - A click sends the answer and shows it taken at once: your card leaves the fan and flies, and an
      error puts it back. The answer stays taken until the server says the card was played, and is
      forgotten when the game ends, stops, starts again or its table closes.
    - A blind card keeps its back until the server's word and then flies from the middle back, at the
      fan's size.
    - `/?solo=N` starts a game with the desktop screenshot tool's players, at the desktop's default
      speed. `&seed=S`, `&speed=0` to `4` and `&forehead=all` change the deal, the computer players'
      speed, and make the first deal blind.
  - **The look tool.** `npm run look` renders the nine fixtures at the desktop's own sizes with no
    server, and `npm run compare` pairs them with the desktop's pictures.
- **The reference pictures.** The container cannot build the desktop (no Qt 6.7), and the owner had
  no Qt machine at hand. The nine pictures were taken by the desktop's own `"[.screenshot]"` tool on
  GitHub CI (ubuntu-latest, Qt 6.10.3, the `default` preset, offscreen) at desktop `5757811` plus a
  commit that only changes the workflow, on the desktop's throwaway branch `ccr-209c0806-o444sp`.
  The desktop's `src/` and `resources/` are the same as at `5757811`. The pictures are kept in
  `build/shots/desktop/`, which is git-ignored, and the README has the steps.
- **The comparisons.** Mean absolute difference of each capture from the desktop's picture, 0 to
  255, before and after the three comparison commits (the scoreboard's lines, black suits, the rack
  cards). They are the same after both rounds of fixes.

  | Shot | Before | After |
  |---|---|---|
  | `table-3-players` | 1.93 | 1.73 |
  | `table-4-players` | 2.32 | 1.93 |
  | `table-5-players` | 2.18 | 1.72 |
  | `table-6-players` | 2.66 | 2.04 |
  | `bidding` | 2.02 | 1.51 |
  | `table-empty` | 0.74 | 0.74 |
  | `hand-1-card` | 1.85 | 1.55 |
  | `hand-4-cards` | 1.93 | 1.52 |
  | `hand-8-cards` | 2.06 | 1.73 |

  Every element lands on the same whole pixel as the desktop's: a shift search finds none. The room,
  the felt and the rim agree to within a level or two, and the portraits and the lead mark to within
  half a pixel. Two runs of the look tool can differ by a few hundred pixels in one picture, in the
  logo's lettering, and not in the same picture twice; the means do not change. What remains:

  | Difference | Cause |
  |---|---|
  | The menu band has no items | **Accepted** (Q3) |
  | Card faces are slightly softer and thin lines less crisp; this is most of what remains, and court cards show it most | **Accepted** (Q8): WebP at 310x450 against the desktop's vector SVG drawn at the exact size |
  | Suit glyphs in the trick panel come from the system's fallback font and differ in shape and width | **Browser-forced** |
  | Panel and button hairlines straddle two device rows where the desktop's are crisp: the table is scaled by CSS, and the browser puts a box on a whole local pixel before scaling it | **Browser-forced** |
  | Text lines sit up to a pixel from the desktop's, in the scoreboard's three header lines and the trick panel's title and rows: Qt puts a baseline on a whole device pixel | **Browser-forced** |
  | Wood grain and felt mottling are sampled slightly differently | **Browser-forced** |
  | Scoreboard column spacing when a panel is wider than its columns: the extra width is shared equally, not in proportion; no difference shows in the nine shots | **Browser-forced** (CSS grid) |

- **Where the build departs from the plan, or found what it did not say:**
  - **The server answers 404, not 403, for `.webp`** (Q7). Cards, portraits and the table's
    textures do not load from `whist_server` until it serves WebP. The page and every test still
    work; `npm run dev` shows the pictures. **`webp` must be added to the server's `setFileTypes`
    before phase 7.** Added in the server's PR #11, merged as `b6f59c7`.
  - **The racks copy the desktop's pictures, not its source.** The desktop renders every rack card a
    quarter darker than the mock-up's CSS does, though its source paints only a 1 px hairline in that
    black. It was measured: a uniform 0.75 on every channel, in all four racks, at both ends of the
    card. The page reproduces what the desktop's pictures show. If the owner takes it for a desktop
    bug, the fix is one CSS layer in `rack.css` here and a change in `RackItem.cpp` there.
  - **The trick panel rebuilds its row and run elements with `replaceChildren` when their text
    changes** (the first review's 10), where §6 asks for elements made once and updated in place.
    They are a few small elements, rebuilt only on a change of text; left as they are.
  - **Hooks the plan did not name:**
    - `data-slot` on hand cards, for the tests;
    - `window.look` and `?pace=` on the look page;
    - `&speed=` and `&forehead=all` on `?solo=N`;
    - an extra commit, `d63c560`, adds `npm run build:look` to CI, since the script did not exist at
      the first step.
  - **`?solo=N` is acted on after a sync with no table,** and the page reads `tableState` as "at a
    table", since the server answers `createSolo` with one.
  - **A blind card whose prompt the computer closes** (a turn timer running out, or a replacement)
    keeps its back until the card is played. Solo allows neither, so only unit tests reach this path,
    until online tables exist and the page can be tried against one.
- **Left out:**
  - **The sheets, the menus, the lobby and Romanian** (phases 7 and 8); New Game, which replaces
    `?solo=N`; the countdown ring and presence on the name panels (Q6); the corner buttons' sheets
    (Q4); the menu band's items (Q3).
  - **The page's own JS, CSS and HTML in the asset budget** (the first review's 9). They add about
    1 MiB, so nothing is near the limit.
  - **`storePace`,** which nothing used until a settings sheet exists, and `cardsText`, which the
    scoreboard says in its own words.
- **Tests:** 318 unit tests in 23 files, 8 end-to-end tests and 13 look tests.
  - **Unit:** the protocol against every fixture, the geometry against the desktop's numbers, the
    queue with a fake stage and clock, the controller with a fake table, the connection with a fake
    socket and storage.
  - **End to end,** against `whist_server`:
    - connect and reload, and a stored token the server cannot read;
    - 22 decisions reaching the moment `table-4-players.json` shows, then a reload mid-trick;
    - a game to the end of a round;
    - your own card in the air the moment you click it;
    - a blind card keeping its back until the server's word, then flying from the fan at its size;
    - a game at the default speed with the cards flying, and the table landing where the server says.
  - **Look:** the nine captures, element reuse, seat-count changes, and a real flight and sweep in
    Chromium.
  - **Mutation checks,** each made and reverted:
    - the redraw at a click with no animation fails the flight check (1 animation expected, 0
      received);
    - clearing the answer when its prompt closes fails 3 controller tests;
    - a blind back that vanishes at the click fails the blind end-to-end test (1 back expected, 0
      received);
    - dropping the blind back when the computer closes the prompt fails 1 controller test, and not
      holding it when there was no click fails 2;
    - removing the socket guard in the connection's close handler fails 2 connection tests, and the
      once-only guard on a refused token fails 1.
  - **Two tests that could not fail** were found by the reviews and made able to: the end-to-end
    flight count, which counted only at the end, and the connection test of a refused socket closing.
- **Reviews.**
  - **The first cold review,** of `7908bd2`, found 11 problems, none above severity 3. It found
    sound: the decoder, the store, the queue, the connection, the ported geometry (`matrix3d` checked
    against Qt's source), `t()` and the palette, element reuse, CI, the asset tool and the twelve
    comparisons.
    1. Severity 3: your own card never flew, because the redraw at the click cut its flight short.
    2. Severity 2: the card you played came back into your hand until the server's word.
    3. Severity 2: a blind card's back vanished at the click, and the card flew small and faint.
    4. Severity 2: an answer pending at the end of a game was never forgotten.
    5. Severity 2: a malformed stored token left the page waiting for ever.
    6. Severity 2: `?solo` played at the top speed, so no computer player's card flew.
    7. Severity 1: comments about what the page would have later, and one that sent the reader to
       another function.
    8. Severity 1: the pairing tool was fixed to phase 6.
    9. Severity 1: the asset budget leaves out the page's own code. Skipped.
    10. Severity 1: the trick panel's `replaceChildren`. Skipped, recorded above.
    11. Severity 1: dead code, and a translated sentence passed back to `t()`.

    The owner chose to fix 1 to 8 and 11, in my order, and to skip 9 and 10. The fixes are `9c9ea6d`
    (6), `6483b2b` (1), `64184a1` (2, 3 and 4), `e1084f8` (5), `ee038cb` (7), `6de5ef3` (11) and
    `ed5075f` (8). Two more commits came from the work: `30aad2e`, because a slot taken out of the fan
    kept its `playable` class once a played card stayed out of the hand until the server's word, which
    the end-to-end count of playable cards caught; and `cb5304e`, which makes the test of the cards
    flying play at the default speed and count them.
  - **The second cold review,** of `7908bd2..cb5304e`, found 9 problems, none above severity 2. It
    found sound: all nine fixes, every path of a pending answer, the new end-to-end tests able to
    fail, and the retiring of hand slots with no leak.
    1. Severity 2: a blind back vanished when the computer closed the prompt. My check agreed, and
       found the cause wider than the review said: a timer closing the prompt before any click took
       the back too.
    2. Severity 2: no test reached a blind round in the page.
    3. Severity 1: the test of a refused socket closing could not fail.
    4. Severity 1: a refused token was retried at once with no limit.
    5. Severity 1: a comment in the controller's test did not match its fixture.
    6. Severity 1: `cardsText`, `storePace` and the `CornerButton` interface were still unused.
    7. Severity 1: a comment about what the strip once was.
    8. Severity 1: the controller's class comment was four lines and said a reason twice.
    9. Severity 1: the README did not say what `&speed` does.

    My re-check agreed with all nine, 1 and 4 in part, and found a tenth: a helper comment in the
    controller's test that had the order of the queue and the store backwards. The owner chose to fix
    all nine and that comment, in my order, and to skip a third cold review. They are fixed in `57a0302` (2), `d19e162`
    (1, 5, 8 and the helper), `4334fe5` (3 and 4) and `e2eef2e` (6, 7 and 9). The blind end-to-end
    test found no bug in the page.
- **Builds and CI.**
  - **`npm run build` and `npm run build:look`** pass at `e2eef2e`, and the unit, end-to-end and look
    tests pass: 318, 8 and 13.
  - **CI** (Build (Linux): `npm ci`, the two builds and the unit tests) is green at `7908bd2`,
    `cb5304e`, `e2eef2e` and `647e02a`. It does not run the end-to-end or the look tests, which need
    the server's build and a browser.
  - **The owner approved** the phase on 2026-11-10.

### Phase 7: sheets and menus — L

- **Work:**
  - first, the submodule moves to the server's `b6f59c7`, which serves the page's WebP pictures and
    JSON files;
  - the reference pictures are the `sheet-*`, `menu` and `language` shots from the same CI run as
    phase 6's (desktop commit `03a3244`, in `shots/` on the desktop's throwaway branch
    `ccr-209c0806-o444sp`). If the desktop's look changes, the workflow there takes them again;
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
    [the server plan's §2.1](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/docs/server-plan.md#21-carried-over-from-the-desktop-client)
    works in solo play;
  - a blind card whose prompt the computer closes (the turn timer) keeps its back until it is
    played, tried against a real online table. Phase 6 could only unit-test it;
  - the desktop's throwaway branch `ccr-209c0806-o444sp` is deleted, once its pictures are no longer
    needed.

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
  - `server/core`, without Drogon, compiled with Emscripten and run in a Web Worker. The
    Emscripten build is made in the server repository first, on a phase branch of its own, as
    phase 6's fixture tool is. The seat driver's wait becomes an awaited message from the page, using JSPI
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
[§15](https://github.com/conectionist/romanian_whist_server/blob/ccr-c8ac042f-e6e18n/docs/server-plan.md#15-decisions-with-defaults),
where the other decisions are. The plan assumes each default until the owner decides otherwise.

| # | Question | Default |
|---|---|---|
| D5 | What is the page built with? | TypeScript and Vite, no UI framework |
| D14 | Phones? | Held sideways: yes. Held upright: later |
| D18 | Which look? | **Decided by the owner, 2026-10-27:** the desktop client. Where it and the mock-up differ, the desktop client wins, even when that means new code instead of the mock-up's ([§2](#2-the-look-the-desktop-client-wins)) |

---

## 18. References

**The server** (`romanian_whist_server`)

- `docs/server-plan.md`: §1 (the six rules), §2 (what is being built), §4.8 (pacing, the round
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

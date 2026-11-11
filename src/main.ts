import { soloRequestFrom, createSolo } from "./dev/solo";
import { DecodeError } from "./net/decode";
import { Connection, type Status } from "./net/connection";
import type { Profile, ServerMessage, TableState } from "./net/protocol";
import { socketUrl } from "./net/socket";
import { Controller } from "./play/controller";
import { modelOf } from "./play/model";
import { currentPace, storePace, storedPace } from "./play/motion";
import { Flow, type Memory } from "./play/flow";
import { atTable } from "./play/sheets";
import { PlaybackQueue } from "./play/queue";
import { NO_CHANGE, Store } from "./play/store";
import { el } from "./dom/el";
import { holdNote } from "./sheets/roundSheet";
import { seatingOf } from "./sheets/seating";
import { MenuBar, menuStateFor } from "./menu/menuBar";
import { MenuPage } from "./lobby/menuPage";
import { pathFor, linkFor, tableCodeFrom } from "./lobby/address";
import { Notices, connectionText, errorText, presenceNews, waitingText } from "./lobby/notices";
import { defaults, loadSetup, saveSetup, type Setup } from "./lobby/setup";
import { loadProfile, saveProfile } from "./lobby/profile";
import { t } from "./i18n/t";
import { Sheets } from "./sheets/host";
import { loadFonts } from "./table/fonts";
import { TableScene } from "./table/renderer";
import { TableView } from "./table/view";
import "./table/styles/fonts.css";
import "./table/styles/theme.css";
import "./table/styles/table.css";
import "./table/styles/panel.css";
import "./table/styles/rack.css";
import "./table/styles/cards.css";
import "./table/styles/hud.css";
import "./table/styles/strip.css";
import "./sheets/styles/sheet.css";
import "./lobby/styles/lobby.css";

// The live page: the connection feeds the queue, which draws the table, and a click goes back
// through the controller. A page is told what the connection is doing, and whether it is at a table,
// in the body's data-status, which the browser tests read.
const body = document.body;

function status(value: string): void {
  body.dataset.status = value;
}

const frame = el("div", { class: "window" });
document.getElementById("app")?.append(frame);
// The menu bar is 46 pixels of the window, and the table takes the rest.
frame.style.setProperty("--band", "46px");

const view = new TableView(frame);
const scene = new TableScene(view, { pace: currentPace });
const store = new Store();

// Whether the table moves for what is drawn now: the viewer's pace, and not in a background tab.
const animates = () => currentPace() !== "off" && document.visibilityState !== "hidden";

// Draws the table as it stands, for a click. With the table's pace, so the flight your card has just
// started is not cut short.
const redraw = (): Promise<void> => scene.relayout(controller.adjust(modelOf(store.state)), NO_CHANGE, animates());

const connection: Connection = new Connection({
  url: socketUrl(window.location),
  onStatus: (value: Status) => {
    status(value === "open" ? "connected" : value);
    lastStatus = value;
    wasConnected = wasConnected || value === "open";
    render();
  },
  onUnreadable: (error: DecodeError) => console.error(`The server sent what the page cannot read: ${error.message}`),
  onMessage: (message) => handle(message),
});

const controller: Controller = new Controller({
  send: (message) => connection.send(message),
  store,
  table: {
    playOwn: (card) => void scene.playOwn(card, animates()),
    recallOwn: (card) => scene.recallOwn(card),
  },
  redraw: () => void redraw(),
});

scene.hand.setHandler((slot) => controller.onPlay(slot));
scene.bidStrip.setHandler((bet) => controller.onBid(bet));

// What the page keeps in the browser between visits: the last New Game and who you are online.
let remembered: Setup = loadSetup() ?? defaults(Math.random);
let profile: Profile | null = loadProfile();

const memory: Memory = {
  setup: () => remembered,
  keepSetup: (setup) => {
    remembered = setup;
    saveSetup(setup);
  },
  profile: () => profile,
  keepProfile: (kept) => {
    profile = kept;
    saveProfile(kept);
  },
};

const notices = new Notices();
// What the server last refused while the sheet that asked is up, for that sheet to say.
let problem = "";
// Whether the page has been told yet that it is at a table or at none: until then it shows neither.
let synced = false;
let wasConnected = false;
let lastStatus: Status = "connecting";

// The sheets and the menu bar. What the sheets show is drawn after the table has, so a round sheet
// does not cover the last trick's sweep, and again whenever the player asks for another.
const flow: Flow = new Flow({
  send: (message) => connection.send(message),
  store,
  changed: () => render(),
  keepPace: storePace,
  memory,
});

const sheets = new Sheets(
  {
    closeMenu: () => flow.closeMenu(),
    openMenu: (sheet) => flow.openMenu(sheet),
    continueRound: () => flow.continueRound(),
    playAgain: () => flow.playAgain(),
    mainMenu: () => flow.mainMenu(),
    resume: () => flow.resume(),
    settingsChanged: (values) => flow.changeSettings(values),
    deal: (setup) => flow.deal(setup),
    chooseCreate: (kept) => flow.chooseCreate(kept),
    createTable: (setup) => flow.createTable(setup),
    join: (code, kept) => {
      problem = "";
      flow.join(code, kept);
    },
    cancelJoin: () => {
      problem = "";
      flow.cancelJoin();
    },
    takeSeat: (seat) => flow.takeSeat(seat),
    seat: (seat, choice) => flow.chooseSeat(seat, choice),
    seatCount: (count) => flow.changeSeatCount(count),
    options: (options) => flow.changeOptions(options),
    replacement: (level) => flow.changeReplacement(level),
    turnTimer: (ms) => flow.changeTurnTimer(ms),
    fill: (level) => flow.fillSeats(level),
    start: () => flow.playAgain(),
    leave: () => flow.mainMenu(),
  },
  { setup: () => remembered, profile: () => profile, pace: storedPace },
);

const menuBar = new MenuBar({
  newGame: () => flow.openMenu("new-game"),
  settings: () => flow.openMenu("settings"),
  rules: () => flow.openMenu("rules"),
  exit: () => flow.exit(),
});

const menuPage = new MenuPage({ newGame: () => flow.openMenu("new-game"), playOnline: () => flow.openMenu("online") });
frame.append(menuPage.element, menuBar.element, notices.element, sheets.layer.element);

scene.onHistory(() => flow.openMenu("history"));
scene.onLastTrick(() => flow.openMenu("last-trick"));

// The address follows the table: an online table's is /t/<code>, and the page at no table is at the
// root, unless it was asked to join the table the address names.
function followAddress(): void {
  const table = store.state.table;
  const wanted = table !== null && table.mode === "online" ? pathFor(table.code) : null;
  const at = window.location.pathname;
  if (wanted !== null && at !== wanted) {
    window.history.pushState(null, "", wanted);
  } else if (wanted === null && table === null && synced && flow.ui.joinCode === null && tableCodeFrom(at) !== null) {
    window.history.replaceState(null, "", pathFor(null) + window.location.search);
  }
}

function secondsLeft(): number | null {
  const held = store.state.held;
  return held === null || held.deadlineAt === null ? null : (held.deadlineAt - performance.now()) / 1000;
}

function render(): void {
  const state = store.state;
  const shown = flow.shown();
  const noTable = synced && !atTable(state);
  const waiting = state.held === null ? "" : holdNote(state.held.waitingFor, seatingOf(state), secondsLeft());
  const link = state.table === null ? "" : linkFor(state.table.code, window.location.origin);
  sheets.render(shown, state, { continued: flow.continuedHold(), joinCode: flow.ui.joinCode, address: link, waiting, problem });
  menuBar.update(menuStateFor(state, true));
  menuPage.show(noTable);
  // The table under a sheet or the menu page takes neither clicks nor the keyboard.
  view.root.inert = shown !== null || noTable;
  if (shown === "online" || shown === "create-table") {
    // The sheet that asked has its word on what went wrong.
  } else {
    problem = "";
  }
  followAddress();
  notices.set("waiting", waitingText(state.table, state.tableAt, performance.now()), { kind: "wait" });
  notices.set("connection", connectionText(lastStatus, wasConnected), {
    kind: "warn",
    ...(lastStatus === "elsewhere" ? { action: { label: t("errors", "Play here"), run: () => window.location.reload() } } : {}),
  });
}

// Esc closes the sheet the menu bar or a corner button opened, and otherwise raises the pause menu,
// or drops it again. A key held down acts once.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.repeat) {
    flow.escape();
  }
});

// Time passes: the ring round your name panel counts down a prompt's last 15 seconds, and a game that
// waits for a person or a round hold that has a deadline says how long is left.
window.setInterval(() => {
  scene.updateCountdown(performance.now());
  const state = store.state;
  notices.set("waiting", waitingText(state.table, state.tableAt, performance.now()), { kind: "wait" });
  if (state.held !== null && state.held.deadlineAt !== null) {
    render();
  }
}, 250);

// The table as it was, so that a change of who is here can be told as news.
let previousTable: TableState | null = null;

const queue = new PlaybackQueue(
  store,
  {
    relayout: async (change, animate) => {
      await scene.relayout(controller.adjust(modelOf(store.state)), change, animate);
      render();
    },
    finishMotion: () => scene.finishMotion(),
  },
  {
    pace: currentPace,
    hidden: () => document.visibilityState === "hidden",
    now: () => performance.now(),
    onApply: (message, change) => {
      controller.onApply(message, change);
      flow.onApply(message);
      if (message.type === "error") {
        // A refusal is said once, in words: where the person is looking if a sheet asked, and else in
        // the strip under the bar.
        const text = errorText(message.code, message.detail);
        if (flow.shown() === "online" || flow.shown() === "create-table") {
          problem = text;
        }
        if (message.code !== "stalePrompt" && message.code !== "notYourTurn") {
          notices.set("error", text, { kind: "error", liveMs: 6000 });
        }
      }
      for (const news of presenceNews(previousTable, store.state.table)) {
        notices.set(`news:${news}`, news, { kind: "news", liveMs: 8000 });
      }
      previousTable = store.state.table;
    },
  },
);

// A game asked for in the address is made once, when the server says the member is at no table.
const solo = soloRequestFrom(window.location.search);
let soloAsked = false;
let joinAsked = false;

function handle(message: ServerMessage): void {
  // Making a solo table is answered with its state, and a closed table is the last word from it.
  if (message.type === "tableState") {
    status(message.state === "closed" ? "at no table" : "at a table");
  }
  if (message.type === "sync") {
    status(message.table === null ? "at no table" : "at a table");
    synced = true;
    if (message.table === null && solo !== null && !soloAsked) {
      soloAsked = true;
      connection.send(createSolo(solo));
    } else if (message.table === null && !soloAsked) {
      // The address is a table's link: ask who the person is, and let them sit down.
      const code = tableCodeFrom(window.location.pathname);
      if (code !== null && flow.ui.joinCode === null && !joinAsked) {
        joinAsked = true;
        flow.askToJoin(code);
      }
    }
  }
  if (message.type !== "welcome") {
    queue.push(message);
  }
}

status("connecting");
render();
void scene.relayout(null, { kind: "sync", event: null, fresh: true }, false);
void loadFonts().then(() => scene.refit());
connection.start();

import { soloRequestFrom, createSolo } from "./dev/solo";
import { DecodeError } from "./net/decode";
import { Connection, type Status } from "./net/connection";
import type { ServerMessage } from "./net/protocol";
import { socketUrl } from "./net/socket";
import { Controller } from "./play/controller";
import { modelOf } from "./play/model";
import { currentPace } from "./play/motion";
import { PlaybackQueue } from "./play/queue";
import { NO_CHANGE, Store } from "./play/store";
import { el } from "./dom/el";
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

// The live page: the connection feeds the queue, which draws the table, and a click goes back
// through the controller. A page is told what the connection is doing, and whether it is at a table,
// in the body's data-status, which the browser tests read.
const body = document.body;

function status(value: string): void {
  body.dataset.status = value;
}

const frame = el("div", { class: "window" });
document.getElementById("app")?.append(frame);

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
  onStatus: (value: Status) => status(value === "open" ? "connected" : value),
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

const queue = new PlaybackQueue(
  store,
  {
    relayout: (change, animate) => scene.relayout(controller.adjust(modelOf(store.state)), change, animate),
    finishMotion: () => scene.finishMotion(),
  },
  {
    pace: currentPace,
    hidden: () => document.visibilityState === "hidden",
    now: () => performance.now(),
    onApply: (message, change) => controller.onApply(message, change),
  },
);

// A game asked for in the address is made once, when the server says the member is at no table.
const solo = soloRequestFrom(window.location.search);
let soloAsked = false;

function handle(message: ServerMessage): void {
  // Making a solo table is answered with its state, and a closed table is the last word from it.
  if (message.type === "tableState") {
    status(message.state === "closed" ? "at no table" : "at a table");
  }
  if (message.type === "sync") {
    status(message.table === null ? "at no table" : "at a table");
    if (message.table === null && solo !== null && !soloAsked) {
      soloAsked = true;
      connection.send(createSolo(solo));
    }
  }
  if (message.type !== "welcome") {
    queue.push(message);
  }
}

status("connecting");
void scene.relayout(null, { kind: "sync", event: null, fresh: true }, false);
void loadFonts().then(() => scene.refit());
connection.start();

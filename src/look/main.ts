import { el } from "../dom/el";
import { startIn } from "../i18n/document";
import { languageFromCode } from "../i18n/language";
import { decode } from "../net/decode";
import type { ServerMessage } from "../net/protocol";
import { modelOf, type TableModel } from "../play/model";
import { PACES, storedPace, type Pace } from "../play/motion";
import { NOTHING_ASKED, sheetFor, type MenuSheet, type UiState } from "../play/sheets";
import { NO_CHANGE, Store } from "../play/store";
import { MenuBar, menuStateFor } from "../menu/menuBar";
import { NO_ACTIONS, Sheets } from "../sheets/host";
import { LanguageDialog } from "../lobby/languageDialog";
import { MenuPage } from "../lobby/menuPage";
import { defaults } from "../lobby/setup";
import { seededRandom } from "../lobby/catalogue";
import { loadFonts } from "../table/fonts";
import { LayoutWatch } from "../table/layoutWatch";
import { TableScene } from "../table/renderer";
import { TABLE_PICTURES } from "../table/tableTop";
import { TableView } from "../table/view";
import "../table/styles/fonts.css";
import "../table/styles/theme.css";
import "../table/styles/table.css";
import "../table/styles/panel.css";
import "../table/styles/rack.css";
import "../table/styles/cards.css";
import "../table/styles/hud.css";
import "../table/styles/strip.css";
import "../table/styles/touch.css";
import "../table/styles/scaled.css";
import "../sheets/styles/sheet.css";
import "../lobby/styles/lobby.css";

// A look fixture: the desktop picture it pairs with, and the sync's fields the picture shows. The
// page's own, in tests/look/fixtures, may also name a sheet that is open over the table, server
// messages to apply after the state, and the order the desktop's tool lays out the hand in.
interface Fixture {
  shot: { file: string; width: number; height: number; view: "window" | "table"; raised?: string; handOrder?: string[] };
  state: Record<string, unknown> | null;
  sheet?: "pause" | MenuSheet;
  // The page that is shown when there is no table: the main menu, or the language dialog, which has
  // nothing under it.
  page?: "menu" | "language";
  messages?: unknown[];
}

// The server's, which are real games, and the page's own, which are built by hand.
const fixtures = {
  ...import.meta.glob<Fixture>("../../libs/romanian_whist_server/protocol/look/*.json", { eager: true, import: "default" }),
  ...import.meta.glob<Fixture>("../../tests/look/fixtures/*.json", { eager: true, import: "default" }),
};

function fixtureNamed(name: string): Fixture {
  for (const [path, fixture] of Object.entries(fixtures)) {
    if (path.endsWith(`/${name}.json`)) {
      return fixture;
    }
  }
  throw new Error(`There is no look fixture named ${name}`);
}

// The menu bar is 46 px high in the desktop's window.
const MENU_BAR = 46;

// A hand in the order the desktop's tool lays it out, which is not the order a game deals: the page
// sorts a hand by the trump and the suits.
function inGivenOrder(model: TableModel, order: readonly string[]): TableModel {
  const entries = order.flatMap((card) => model.hand.entries.filter((entry) => entry.card === card));
  return { ...model, hand: { ...model.hand, entries, positions: entries.map((_, slot) => slot) } };
}

async function decoded(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  await image.decode().catch(() => undefined);
}

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  // English unless the capture asks for Romanian, so the desktop's pictures are compared like for like.
  startIn(languageFromCode(params.get("lang")) ?? "en", document);
  const first = fixtureNamed(params.get("shot") ?? "table-empty");
  const then = params.get("then");

  if (first.page === "language") {
    const dialog = new LanguageDialog({ choose: () => undefined });
    document.body.append(dialog.element);
    dialog.focus();
    await loadFonts();
    document.body.dataset.ready = "1";
    return;
  }

  const frame = el("div", { class: "window" });
  document.getElementById("app")?.append(frame);
  // The window has the menu bar over the table; the table alone has not.
  const bar = first.shot.view === "window" ? new MenuBar({ newGame: () => undefined, settings: () => undefined, rules: () => undefined, exit: () => undefined }) : null;
  if (bar !== null) {
    frame.append(bar.element);
    frame.style.setProperty("--band", `${MENU_BAR}px`);
  }
  const view = new TableView(frame);
  // Still by default, so a capture is of one moment; a test of motion asks for a pace.
  const asked = params.get("pace") ?? "off";
  const pace: Pace = (PACES as readonly string[]).includes(asked) ? (asked as Pace) : "off";
  const scene = new TableScene(view, { pace: () => pace });
  const store = new Store();

  // The sheets, as the live page has them, asking for nothing.
  const sheets = new Sheets(NO_ACTIONS, { setup: () => defaults(seededRandom(1)), profile: () => null, pace: storedPace }, seededRandom(1));
  const menuPage = new MenuPage({ newGame: () => undefined, playOnline: () => undefined, language: () => undefined });
  frame.append(menuPage.element, sheets.layer.element);
  let ui: UiState = NOTHING_ASKED;
  let order: readonly string[] | undefined;

  const draw = (change: Parameters<typeof scene.relayout>[1]) => {
    const model = modelOf(store.state);
    return scene.relayout(model !== null && order !== undefined ? inGivenOrder(model, order) : model, change, false);
  };

  // The table the window gets, as the live page chooses it: on a touch screen smaller than the desktop's,
  // the scaled table, which has the whole window and no menu bar.
  new LayoutWatch(frame, ({ choice, size }) => {
    const desktop = choice.kind === "desktop";
    frame.dataset.layout = choice.kind;
    frame.style.setProperty("--scale", String(choice.kind === "scaled" ? choice.scale : 1));
    frame.style.setProperty("--band", bar !== null && desktop ? `${MENU_BAR}px` : "0px");
    if (bar !== null) {
      bar.element.hidden = !desktop;
    }
    scene.setLayout(choice.kind === "scaled" ? { kind: "scaled", size, scale: choice.scale } : { kind: "desktop" });
    if (store.state.snapshot !== null) {
      void draw(NO_CHANGE);
    }
  });

  // Draws the state a fixture holds, as a sync would, at once, and what it says is open over it.
  const show = async (fixture: Fixture) => {
    if (fixture.state !== null) {
      order = fixture.shot.handOrder;
      const message = decode(JSON.stringify({ type: "sync", seq: 0, ...fixture.state }));
      await draw(store.apply(message, 0));
      for (const [index, text] of (fixture.messages ?? []).entries()) {
        await draw(store.apply(decode(JSON.stringify({ seq: index + 1, ...(text as object) })), 0));
      }
      const asked = fixture.sheet;
      ui = asked === undefined ? NOTHING_ASKED : { menu: asked === "pause" ? null : asked, pauseMenu: asked === "pause", joinCode: null, backAtTable: false, dismissedRound: null };
      sheets.render(sheetFor(store.state, ui), store.state, { continued: false, joinCode: null, address: "", waiting: "", asking: false });
    }
    menuPage.show(fixture.page === "menu");
    bar?.update(menuStateFor(store.state, true));
  };

  // For the tests of motion: applies a server message as the queue would, and resolves when the
  // motion it started has ended.
  (window as unknown as { look: unknown }).look = {
    apply: async (text: string, animate: boolean) => {
      const message: ServerMessage = decode(text);
      const change = store.apply(message, 0);
      await scene.relayout(modelOf(store.state), change, animate);
    },
  };

  // So a test can tell the nodes a second state reuses from the ones it makes.
  const stamps = () => Array.from(document.querySelectorAll<HTMLElement>(".seat, .rack"), (node) => node.dataset.created).join(",");

  await scene.relayout(null, { kind: "sync", event: null, fresh: true }, false);
  await show(first);
  document.body.dataset.firstStamps = stamps();
  if (then !== null) {
    await show(fixtureNamed(then));
  }

  document.body.dataset.stamps = stamps();

  await loadFonts();
  scene.refit();
  await Promise.all([...TABLE_PICTURES, ...Array.from(document.images, (image) => image.src)].map(decoded));
  document.body.dataset.ready = "1";
}

main().catch((error: unknown) => {
  document.body.dataset.failed = String(error);
  throw error;
});

import { el } from "../dom/el";
import { decode } from "../net/decode";
import { modelOf } from "../play/model";
import { Store } from "../play/store";
import { loadFonts } from "../table/fonts";
import { TableScene } from "../table/renderer";
import { TABLE_PICTURES } from "../table/tableTop";
import { TableView } from "../table/view";
import "../table/styles/fonts.css";
import "../table/styles/theme.css";
import "../table/styles/table.css";
import "../table/styles/panel.css";

// A look fixture: the desktop picture it pairs with, and the sync's fields the picture shows.
interface Fixture {
  shot: { file: string; width: number; height: number; view: "window" | "table"; raised?: string };
  state: Record<string, unknown> | null;
}

const fixtures = import.meta.glob<Fixture>("../../libs/romanian_whist_server/protocol/look/*.json", {
  eager: true,
  import: "default",
});

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

async function decoded(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  await image.decode().catch(() => undefined);
}

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const first = fixtureNamed(params.get("shot") ?? "table-empty");
  const then = params.get("then");

  const frame = el("div", { class: "window" });
  document.getElementById("app")?.append(frame);
  if (first.shot.view === "window") {
    frame.append(el("div", { class: "menu-band" }));
    frame.style.setProperty("--band", `${MENU_BAR}px`);
  }
  const view = new TableView(frame);
  const scene = new TableScene(view);
  const store = new Store();

  // Draws the state a fixture holds, as a sync would, at once.
  const show = async (fixture: Fixture) => {
    if (fixture.state === null) {
      return;
    }
    const message = decode(JSON.stringify({ type: "sync", seq: 0, ...fixture.state }));
    const change = store.apply(message, 0);
    await scene.relayout(modelOf(store.state), change, false);
  };

  await scene.relayout(null, { kind: "sync", event: null, fresh: true }, false);
  await show(first);
  if (then !== null) {
    await show(fixtureNamed(then));
  }

  await loadFonts();
  scene.refit();
  await Promise.all([...TABLE_PICTURES, ...Array.from(document.images, (image) => image.src)].map(decoded));
  document.body.dataset.ready = "1";
}

main().catch((error: unknown) => {
  document.body.dataset.failed = String(error);
  throw error;
});

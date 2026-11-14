import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { seededRandom } from "../../src/lobby/catalogue";
import { defaults } from "../../src/lobby/setup";
import { modelOf } from "../../src/play/model";
import { Flow } from "../../src/play/flow";
import type { SheetName } from "../../src/play/sheets";
import { fieldsFor as menuFields } from "../../src/sheets/menuListSheet";
import { PAGE_ACTION, SIDE_MOST, placementFor, sideWidthFor, type SheetKey } from "../../src/sheets/placement";
import { TABS, fieldsFor as scoresFields, tabAfter, tabLabel } from "../../src/sheets/scoresSheet";
import { seatingOf } from "../../src/sheets/seating";
import { fullscreenActionFor, fullscreenOffered, smallNoticeFor, type FullscreenFacts } from "../../src/table/fullscreen";
import { storeFor, sender } from "./support/sheetState";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("where a sheet is placed", () => {
  const sides: SheetKey[] = ["history", "last-trick", "scores"];
  const bottoms: SheetKey[] = ["round", "settings", "rules", "pause", "leave", "game-over", "menu"];
  const pages: SheetKey[] = ["new-game", "online", "create-table", "lobby"];

  it("is the centred dialog for every sheet on the desktop's table", () => {
    for (const name of [...sides, ...bottoms, ...pages]) {
      expect(placementFor(name, false), name).toBe("dialog");
    }
  });

  it("is a side sheet for the table's records, a bottom sheet for what ends or pauses the game, and a page for what is filled in before a table", () => {
    for (const name of sides) {
      expect(placementFor(name, true), name).toBe("side");
    }
    for (const name of bottoms) {
      expect(placementFor(name, true), name).toBe("bottom");
    }
    for (const name of pages) {
      expect(placementFor(name, true), name).toBe("page");
    }
  });

  it("is decided for every sheet the flow can name", () => {
    const names: Record<SheetName, true> = {
      history: true,
      "last-trick": true,
      scores: true,
      rules: true,
      settings: true,
      "new-game": true,
      online: true,
      "create-table": true,
      round: true,
      "game-over": true,
      pause: true,
      leave: true,
      lobby: true,
    };
    for (const name of Object.keys(names) as SheetName[]) {
      expect(["side", "bottom", "page"]).toContain(placementFor(name, true));
    }
  });

  it("gives a page the action that does what it is for", () => {
    expect(Object.keys(PAGE_ACTION).sort()).toEqual([...pages].sort());
    expect(PAGE_ACTION).toMatchObject({ "new-game": "deal", online: "join", "create-table": "create", lobby: "start" });
  });

  it("makes a side sheet 0.46 of the window wide, and no wider than 420, so the table stays in view", () => {
    expect(sideWidthFor(780)).toBe(359);
    expect(sideWidthFor(640)).toBe(294);
    expect(sideWidthFor(1099)).toBe(SIDE_MOST);
    expect(sideWidthFor(2000)).toBe(SIDE_MOST);
  });
});

describe("full screen", () => {
  const facts = (changes: Partial<FullscreenFacts> = {}): FullscreenFacts => ({ coarse: true, enabled: true, active: false, installed: false, ...changes });

  it("is offered only on a touch screen whose browser has it, that is not in it, and that did not start from the home screen", () => {
    expect(fullscreenOffered(facts())).toBe(true);
    expect(fullscreenOffered(facts({ coarse: false }))).toBe(false);
    expect(fullscreenOffered(facts({ enabled: false }))).toBe(false);
    expect(fullscreenOffered(facts({ active: true }))).toBe(false);
    expect(fullscreenOffered(facts({ installed: true }))).toBe(false);
  });

  it("is, to a button that may leave it, to enter it, or while the page is in it to leave it, and to one that may not, nothing then", () => {
    expect(fullscreenActionFor(facts(), true)).toBe("enter");
    expect(fullscreenActionFor(facts(), false)).toBe("enter");
    expect(fullscreenActionFor(facts({ active: true }), true)).toBe("exit");
    expect(fullscreenActionFor(facts({ active: true }), false)).toBeNull();
    // Where there is nothing to do, there is no button, in or out of it.
    for (const none of [{ coarse: false }, { enabled: false }, { installed: true }]) {
      expect(fullscreenActionFor(facts(none), true), JSON.stringify(none)).toBeNull();
      expect(fullscreenActionFor(facts({ ...none, active: true }), true), JSON.stringify(none)).toBeNull();
    }
  });

  it("is what a table drawn small offers, or where the browser has none the home screen", () => {
    expect(smallNoticeFor(facts(), true, false)).toBe("fullscreen");
    expect(smallNoticeFor(facts({ enabled: false }), true, false)).toBe("home-screen");
  });

  it("says nothing of a table drawn full size, one put away, a mouse, full screen already, or the home screen", () => {
    expect(smallNoticeFor(facts(), false, false)).toBeNull();
    expect(smallNoticeFor(facts(), true, true)).toBeNull();
    expect(smallNoticeFor(facts({ coarse: false }), true, false)).toBeNull();
    expect(smallNoticeFor(facts({ active: true }), true, false)).toBeNull();
    expect(smallNoticeFor(facts({ installed: true }), true, false)).toBeNull();
    expect(smallNoticeFor(facts({ enabled: false, installed: true }), true, false)).toBeNull();
  });
});

describe("the scoreboard's sheet", () => {
  const state = storeFor("sheet-last-trick").state;
  const model = modelOf(state)!;
  const fields = scoresFields(model, state.history, state.lastTrick, seatingOf(state));

  it("is the round and what was dealt for its title, and the trick's details and three tabs under it", () => {
    expect(fields.title).toBe("Round 10 of 32");
    expect(fields.meta).toBe("8 cards dealt · Normal");
    expect(TABS).toEqual(["scores", "history", "last-trick"]);
    expect(TABS.map(tabLabel)).toEqual(["Scores", "History", "Last trick"]);
  });

  it("takes the history tab and the last trick tab from the fields of the sheets of those names", () => {
    expect(fields.history.meta).toBe("Score per round, then taken/bid");
    expect(fields.history.table.columns.map((column) => column.heading).slice(0, 3)).toEqual(["Round", "Cards", "Player"]);
    expect(fields.lastTrick.cards).toHaveLength(6);
    expect(fields.lastTrick.cards.filter((card) => card.winning)).toHaveLength(1);
    expect(fields.lastTrick.meta).toMatch(/won it/);
  });

  it("moves between its tabs with the arrows, stops at the ends, and goes to the first and last with Home and End", () => {
    expect(tabAfter(0, 3, "ArrowRight")).toBe(1);
    expect(tabAfter(2, 3, "ArrowRight")).toBe(2);
    expect(tabAfter(1, 3, "ArrowLeft")).toBe(0);
    expect(tabAfter(0, 3, "ArrowLeft")).toBe(0);
    expect(tabAfter(1, 3, "Home")).toBe(0);
    expect(tabAfter(1, 3, "End")).toBe(2);
    expect(tabAfter(1, 3, "a")).toBeNull();
    expect(tabAfter(1, 3, "Enter")).toBeNull();
  });
});

describe("the menu as a list", () => {
  it("is Paused with the round for a solo game, which waits, and Main menu and Resume to leave and go on", () => {
    expect(menuFields("solo", { index: 11, count: 29 })).toEqual({
      title: "Paused",
      meta: "Round 11 of 29. The game waits until you come back.",
      leave: "Main menu",
      back: "Resume",
    });
    expect(menuFields("solo", null).meta).toBe("");
  });

  it("is Menu for an online table, which does not pause, and Leave table and Back to the table", () => {
    expect(menuFields("online", { index: 11, count: 29 })).toEqual({
      title: "Menu",
      meta: "Online games do not pause: the table plays on while this is open.",
      leave: "Leave table",
      back: "Back to the table",
    });
  });
});

// A sheet opened from another returns to it when it closes, in both layouts: the flow holds what was asked for,
// and what is on the table shows under it.
describe("a sheet opened from another returns to it", () => {
  function flowFor(name: string, change?: (sync: any) => void) {
    const store = storeFor(name, change);
    const sent = sender();
    const flow = new Flow({ send: sent.send, store, changed: () => undefined, keepPace: () => undefined, memory: memoryOf() });
    return { flow, sent };
  }

  function memoryOf() {
    const setup = defaults(seededRandom(3));
    return { setup: () => setup, keepSetup: () => undefined, profile: () => null, keepProfile: () => undefined };
  }

  it("goes back to the end of a round from the round history", () => {
    const { flow } = flowFor("sheet-round");
    expect(flow.shown()).toBe("round");
    flow.openMenu("history");
    expect(flow.shown()).toBe("history");
    flow.closeMenu();
    expect(flow.shown()).toBe("round");
  });

  it("goes back to the results from the round history", () => {
    const { flow } = flowFor("sheet-game-over");
    expect(flow.shown()).toBe("game-over");
    flow.openMenu("history");
    expect(flow.shown()).toBe("history");
    flow.closeMenu();
    expect(flow.shown()).toBe("game-over");
  });

  it("goes back to a solo game's pause menu from each sheet its list opens, and Esc closes only the top one", () => {
    const { flow, sent } = flowFor("sheet-pause");
    flow.escape();
    expect(flow.shown()).toBe("pause");
    for (const sheet of ["history", "last-trick", "settings", "rules", "scores"] as const) {
      flow.openMenu(sheet);
      expect(flow.shown(), sheet).toBe(sheet);
      flow.escape();
      expect(flow.shown(), `back from ${sheet}`).toBe("pause");
    }
    // The game was held once, and is let go when the last sheet is.
    expect(sent.messages.map((each) => each.type)).toEqual(["pause"]);
    flow.escape();
    expect(flow.shown()).toBeNull();
    expect(sent.messages.map((each) => each.type)).toEqual(["pause", "resume"]);
  });

  it("goes back to an online table's offer to leave, which does not hold the game", () => {
    const { flow, sent } = flowFor("sheet-pause", (sync) => {
      sync.table.mode = "online";
    });
    flow.escape();
    expect(flow.shown()).toBe("leave");
    flow.openMenu("settings");
    expect(flow.shown()).toBe("settings");
    flow.closeMenu();
    expect(flow.shown()).toBe("leave");
    expect(sent.messages).toEqual([]);
  });
});

describe("the web app manifest", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "public/manifest.json"), "utf8"));
  const page = readFileSync(join(ROOT, "index.html"), "utf8");
  const theme = readFileSync(join(ROOT, "src/table/styles/theme.css"), "utf8");

  const pngSize = (path: string) => {
    const bytes = readFileSync(join(ROOT, "public", path.replace(/^\//, "")));
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
  };
  const colour = (name: string) => new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(theme)?.[1];

  it("names the game neutrally, in English, and opens it full screen and sideways from the root", () => {
    expect(manifest).toMatchObject({ name: "Romanian Whist", short_name: "Whist", start_url: "/", scope: "/", display: "fullscreen", orientation: "landscape" });
    expect(manifest.display_override).toEqual(["fullscreen", "standalone"]);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it("takes its colours from the theme", () => {
    expect(manifest.theme_color).toBe(colour("menu-top"));
    expect(manifest.background_color).toBe(colour("room-edge"));
    expect(page).toContain(`<meta name="theme-color" content="${manifest.theme_color}">`);
  });

  it("has icons of 192 and 512 and a maskable 512, files that are the size they say", () => {
    const icons = manifest.icons as { src: string; sizes: string; type: string; purpose: string }[];
    expect(icons.map((icon) => `${icon.sizes} ${icon.purpose}`).sort()).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
    for (const icon of icons) {
      expect(icon.type).toBe("image/png");
      expect(pngSize(icon.src), icon.src).toBe(icon.sizes);
    }
  });

  it("is linked from the page, with the touch icon and the home-screen tags of an iPhone", () => {
    expect(page).toContain('<link rel="manifest" href="/manifest.json">');
    expect(page).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">');
    expect(pngSize("/icons/apple-touch-icon.png")).toBe("180x180");
    expect(page).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(page).toContain('<meta name="mobile-web-app-capable" content="yes">');
  });

  it("is a file the game server serves: its static files are a fixed list of extensions, and a manifest's own is not one", () => {
    const server = readFileSync(join(ROOT, "libs/romanian_whist_server/server/app/Server.cpp"), "utf8");
    const types = /fileTypes\{([^}]*)\}/.exec(server)?.[1] ?? "";
    expect(types).toContain('"json"');
    expect(types).toContain('"png"');
    expect(types).not.toContain("webmanifest");
    expect(page).not.toContain("webmanifest");
  });
});

describe("the Romanian the owner chose", () => {
  const entries = (JSON.parse(readFileSync(join(ROOT, "src/i18n/ro.page.json"), "utf8")) as { entries: { context: string; source: string; translation?: string }[] }).entries;
  const said = (context: string, source: string) => entries.find((each) => each.context === context && each.source === source)?.translation;

  it("is in the page's catalogue, word for word", () => {
    expect(said("fullscreen", "Full screen")).toBe("Pe tot ecranul");
    expect(said("fullscreen", "The table is small here.")).toBe("Masa e cam mică așa.");
    expect(said("fullscreen", "Add the page to the home screen for a bigger table.")).toBe("Pentru o masă mai mare, adaugă pagina pe ecranul principal.");
    expect(said("menulist", "Online games do not pause: the table plays on while this is open.")).toBe(
      "Un joc online nu poate fi pus pe pauză: ceilalți joacă mai departe cât timp meniul este deschis.",
    );
    expect(said("bidstrip", "Not %1: the bids would add up to %2.")).toBe("N-ai voie să zici %1.");
    expect(said("fullscreen", "Exit full screen")).toBe("Ieși de pe tot ecranul");
  });
});

import { describe, expect, it } from "vitest";
import { menuStateFor } from "../../src/menu/menuBar";
import { storeFor } from "./support/sheetState";

describe("what the menu bar offers", () => {
  it("is everything over a game being played", () => {
    expect(menuStateFor(storeFor("sheet-pause").state, true)).toEqual({ newGame: true, settings: true, rules: true, exit: true });
  });

  it("greys Exit over a round sheet that holds the game, where the pause menu would not open", () => {
    expect(menuStateFor(storeFor("sheet-round").state, true).exit).toBe(false);
  });

  it("greys Exit over the end of a game", () => {
    expect(menuStateFor(storeFor("sheet-game-over").state, true).exit).toBe(false);
  });

  it("greys Exit at no table, and keeps Settings and Rules, which apply to the next game", () => {
    const none = storeFor("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    });
    expect(menuStateFor(none.state, true)).toEqual({ newGame: true, settings: true, rules: true, exit: false });
  });

  it("greys Exit at an online table's lobby, where no game is on", () => {
    const lobby = storeFor("sheet-pause", (sync) => {
      sync.table.state = "lobby";
    });
    expect(menuStateFor(lobby.state, true).exit).toBe(false);
  });

  it("greys New Game where this page cannot start a game", () => {
    expect(menuStateFor(storeFor("sheet-pause").state, false).newGame).toBe(false);
  });
});

describe("what the menu bar offers at an online table", () => {
  const online = (state: "lobby" | "playing") =>
    storeFor("sheet-pause", (sync) => {
      sync.table.mode = "online";
      sync.table.state = state;
      if (state === "lobby") {
        sync.snapshot = null;
      }
    }).state;

  it("keeps Exit live in the lobby and in a game in play, where it offers to leave", () => {
    expect(menuStateFor(online("lobby"), true).exit).toBe(true);
    expect(menuStateFor(online("playing"), true).exit).toBe(true);
  });
});

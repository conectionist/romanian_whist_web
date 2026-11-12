import { describe, expect, it } from "vitest";
import { NOTHING_ASKED, canPause, gameFinished, gameOn, sheetFor, wantsPause, type UiState } from "../../src/play/sheets";
import { message, serverFixture, storeFor, syncOf } from "./support/sheetState";

const asked = (change: Partial<UiState>): UiState => ({ ...NOTHING_ASKED, ...change });

describe("which sheet is up", () => {
  it("is none over a game being played with nothing asked for", () => {
    const { state } = storeFor("sheet-pause");
    expect(gameOn(state)).toBe(true);
    expect(sheetFor(state, NOTHING_ASKED)).toBeNull();
  });

  it("is the round sheet while a round is held", () => {
    expect(sheetFor(storeFor("sheet-round").state, NOTHING_ASKED)).toBe("round");
  });

  it("is the end of the game once it has ended", () => {
    expect(sheetFor(storeFor("sheet-game-over").state, NOTHING_ASKED)).toBe("game-over");
  });

  it("is the pause menu when the player asked for it over a game being played", () => {
    expect(sheetFor(storeFor("sheet-pause").state, asked({ pauseMenu: true }))).toBe("pause");
  });

  it("puts a sheet from the menu bar over whatever else is up, and the one under it comes back", () => {
    for (const name of ["sheet-pause", "sheet-round", "sheet-game-over"]) {
      const { state } = storeFor(name);
      const under = sheetFor(state, NOTHING_ASKED);
      for (const menu of ["history", "last-trick", "rules", "settings"] as const) {
        expect(sheetFor(state, asked({ menu }))).toBe(menu);
      }
      expect(sheetFor(state, asked({ menu: null }))).toBe(under);
    }
  });

  it("puts the pause menu under a sheet from the menu bar", () => {
    const { state } = storeFor("sheet-pause");
    expect(sheetFor(state, { menu: "rules", pauseMenu: true, joinCode: null, backAtTable: false, dismissedRound: null })).toBe("rules");
    expect(sheetFor(state, { menu: null, pauseMenu: true, joinCode: null, backAtTable: false, dismissedRound: null })).toBe("pause");
  });

  it("is never the pause menu over a round sheet that holds the game: that sheet has its own way on", () => {
    const { state } = storeFor("sheet-round");
    expect(canPause(state)).toBe(false);
    expect(sheetFor(state, asked({ pauseMenu: true }))).toBe("round");
  });

  it("is never the pause menu over a game that has ended", () => {
    const { state } = storeFor("sheet-game-over");
    expect(canPause(state)).toBe(false);
    expect(sheetFor(state, asked({ pauseMenu: true }))).toBe("game-over");
  });

  it("is the end of the game, not the round sheet, when a hold and an ending are both in the store", () => {
    const { state } = storeFor("sheet-round", (sync) => {
      sync.table.state = "finished";
    });
    expect(gameFinished(state)).toBe(true);
    expect(sheetFor(state, NOTHING_ASKED)).toBe("game-over");
  });

  it("is none at no table, but Rules and Settings can still be opened", () => {
    const { state } = storeFor("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    });
    expect(sheetFor(state, NOTHING_ASKED)).toBeNull();
    expect(sheetFor(state, asked({ pauseMenu: true }))).toBeNull();
    expect(sheetFor(state, asked({ menu: "rules" }))).toBe("rules");
    expect(sheetFor(state, asked({ menu: "settings" }))).toBe("settings");
  });

  it("is none in a table's lobby: no game is on", () => {
    const { state } = storeFor("sheet-pause", (sync) => {
      sync.table.state = "lobby";
    });
    expect(gameOn(state)).toBe(false);
    expect(sheetFor(state, asked({ pauseMenu: true }))).toBeNull();
  });

  it("is the end of the game when a game stopped, and when a sync finds it stopped", () => {
    const stopped = storeFor("sheet-pause");
    stopped.apply(message({ type: "game", game: 1, snapshot: null, event: { kind: "gameStopped" } }), 1);
    expect(sheetFor(stopped.state, NOTHING_ASKED)).toBe("game-over");
    const found = storeFor("sheet-pause", (sync) => {
      sync.snapshot.status = "stopped";
    });
    expect(sheetFor(found.state, NOTHING_ASKED)).toBe("game-over");
  });

  it("is the end of the game for a table that was reloaded once its game was over", () => {
    const sync = serverFixture("sync");
    sync.snapshot = serverFixture("game.gameOver").snapshot;
    sync.table.state = "finished";
    const reloaded = storeFor("sheet-pause");
    reloaded.apply(syncOf(sync), 5);
    expect(reloaded.state.result).toBeNull();
    expect(sheetFor(reloaded.state, NOTHING_ASKED)).toBe("game-over");
  });
});

describe("which sheet is up, as messages arrive in turn", () => {
  const roundScored = serverFixture("game.roundScored");
  const held = serverFixture("held");
  const roundComplete = serverFixture("game.roundComplete");
  const gameOver = serverFixture("game.gameOver");
  const gameStarted = serverFixture("game.gameStarted");
  const sync = serverFixture("sync");

  it("follows a hold from the round scored to the next round", () => {
    const store = storeFor("sheet-pause");
    const seen: (string | null)[] = [];
    const take = (body: object) => {
      store.apply(message(body, 1), 0);
      seen.push(sheetFor(store.state, NOTHING_ASKED));
    };
    take(roundScored);
    take(held);
    take(roundComplete);
    expect(seen).toEqual(["round", "round", null]);
  });

  it("shows a round the game rests on without a hold, until the next game message", () => {
    const store = storeFor("sheet-pause");
    store.apply(message(roundScored, 1), 0);
    expect(store.state.held).toBeNull();
    expect(sheetFor(store.state, NOTHING_ASKED)).toBe("round");
    // A sheet that holds nothing does not keep the pause menu away.
    expect(canPause(store.state)).toBe(true);
    expect(sheetFor(store.state, asked({ pauseMenu: true }))).toBe("pause");
    // Closed by the person, it stays closed for that round.
    expect(sheetFor(store.state, asked({ dismissedRound: 0 }))).toBeNull();
    store.apply(message(roundComplete, 2), 0);
    expect(sheetFor(store.state, NOTHING_ASKED)).toBeNull();
  });

  it("shows no sheet for the last round of a game that does not wait: the results follow", () => {
    const store = storeFor("sheet-pause");
    const last = structuredClone(roundScored);
    last.event.result.index = last.event.result.count - 1;
    store.apply(message(last, 1), 0);
    expect(sheetFor(store.state, NOTHING_ASKED)).toBeNull();
    store.apply(message({ ...held, round: last.event.result.index }, 2), 0);
    expect(sheetFor(store.state, NOTHING_ASKED)).toBe("round");
  });

  it("shows nothing for a hold whose round is not in the history, and keeps a sync from bringing back a rest", () => {
    const store = storeFor("sheet-pause");
    store.apply(message(held, 1), 0);
    expect(sheetFor(store.state, NOTHING_ASKED)).toBeNull();
    store.apply(message(roundScored, 2), 0);
    store.apply(syncOf({ ...sync, held: null }), 0);
    expect(store.state.scored).toBeNull();
  });

  it("follows a game from its last round to its end, and on to the next game", () => {
    const store = storeFor("sheet-pause");
    const seen: (string | null)[] = [];
    const take = (body: object) => {
      store.apply(message(body, 1), 0);
      seen.push(sheetFor(store.state, NOTHING_ASKED));
    };
    store.apply(message(roundScored, 1), 0);
    take(held);
    take(gameOver);
    take(gameStarted);
    expect(seen).toEqual(["round", "game-over", null]);
  });

  it("is re-derived from a sync that finds a hold, an ending or neither", () => {
    const store = storeFor("sheet-pause");
    const hold = structuredClone(sync);
    hold.held = held;
    delete hold.held.type;
    delete hold.held.seq;
    store.apply(syncOf(hold), 1);
    expect(sheetFor(store.state, NOTHING_ASKED)).toBe("round");
    store.apply(syncOf(sync), 2);
    expect(sheetFor(store.state, NOTHING_ASKED)).toBeNull();
    store.apply(message(gameOver, 3), 3);
    expect(sheetFor(store.state, NOTHING_ASKED)).toBe("game-over");
    // A sync forgets the standings the event gave, but the table and its snapshot still say the game
    // is over.
    const ended = structuredClone(sync);
    ended.snapshot = gameOver.snapshot;
    ended.table.state = "finished";
    store.apply(syncOf(ended), 4);
    expect(sheetFor(store.state, NOTHING_ASKED)).toBe("game-over");
  });

  it("is none once the table closes", () => {
    const store = storeFor("sheet-round");
    store.apply(message({ ...serverFixture("tableState"), state: "closed" }, 9), 9);
    expect(sheetFor(store.state, NOTHING_ASKED)).toBeNull();
  });
});

describe("whether the game should be held for what is up", () => {
  it("is so for the pause menu and for every sheet from the menu bar, in a solo game being played", () => {
    const { state } = storeFor("sheet-pause");
    expect(wantsPause(state, NOTHING_ASKED)).toBe(false);
    expect(wantsPause(state, asked({ pauseMenu: true }))).toBe(true);
    for (const menu of ["history", "last-trick", "rules", "settings"] as const) {
      expect(wantsPause(state, asked({ menu }))).toBe(true);
    }
  });

  it("is not so over a round hold, which is a wait of its own, or a game that has ended", () => {
    expect(wantsPause(storeFor("sheet-round").state, asked({ menu: "rules" }))).toBe(false);
    expect(wantsPause(storeFor("sheet-game-over").state, asked({ menu: "history" }))).toBe(false);
  });

  it("is not so for an online table, which cannot be paused", () => {
    const { state } = storeFor("sheet-pause", (sync) => {
      sync.table.mode = "online";
    });
    expect(wantsPause(state, asked({ pauseMenu: true }))).toBe(false);
  });
});

describe("the online table's sheets", () => {
  const online = (state: "lobby" | "playing", change: (sync: any) => void = () => undefined) =>
    storeFor("sheet-pause", (sync) => {
      sync.table.mode = "online";
      sync.table.state = state;
      if (state === "lobby") {
        sync.snapshot = null;
      }
      change(sync);
    }).state;

  it("is the lobby until the game starts, and Exit's offer to leave over it", () => {
    expect(sheetFor(online("lobby"), NOTHING_ASKED)).toBe("lobby");
    expect(sheetFor(online("lobby"), asked({ pauseMenu: true }))).toBe("leave");
  });

  it("is no sheet over a game in play, and the offer to leave, never the pause menu, when Exit is used", () => {
    expect(sheetFor(online("playing"), NOTHING_ASKED)).toBeNull();
    expect(sheetFor(online("playing"), asked({ pauseMenu: true }))).toBe("leave");
  });

  it("puts a sheet from the menu bar over the lobby, and the lobby comes back", () => {
    const state = online("lobby");
    expect(sheetFor(state, asked({ menu: "rules" }))).toBe("rules");
    expect(sheetFor(state, asked({ menu: null }))).toBe("lobby");
  });

  it("does not hold an online game for a sheet, as it cannot be paused", () => {
    expect(wantsPause(online("playing"), asked({ menu: "rules" }))).toBe(false);
  });

  it("shows the join sheet for a table the address names, at no table, and nothing once there is one", () => {
    const none = storeFor("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    }).state;
    expect(sheetFor(none, { ...NOTHING_ASKED, joinCode: "JFXB3J" })).toBe("online");
    expect(sheetFor(none, { ...NOTHING_ASKED, menu: "rules", joinCode: "JFXB3J" })).toBe("rules");
    expect(sheetFor(online("lobby"), { ...NOTHING_ASKED, joinCode: "JFXB3J" })).toBe("lobby");
  });

  it("goes from the lobby to the table when the next game starts, and not by the last results", () => {
    const store = storeFor("sheet-game-over", (sync) => {
      sync.table.mode = "online";
      sync.table.state = "finished";
      sync.table.host = 0;
    });
    const ui = asked({ backAtTable: true });
    expect(sheetFor(store.state, ui)).toBe("lobby");
    // The server's word that the game is on comes before the game's first message.
    store.apply(message({ ...serverFixture("tableState"), mode: "online", state: "playing", host: 0 }, 9), 0);
    expect(sheetFor(store.state, ui)).toBeNull();
  });

  it("is the end of the game for a finished online table", () => {
    expect(sheetFor(online("playing", (sync) => {
      sync.table.state = "finished";
    }), NOTHING_ASKED)).toBe("game-over");
  });
});

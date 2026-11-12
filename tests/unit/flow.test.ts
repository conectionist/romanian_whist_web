import { describe, expect, it } from "vitest";
import type { ClientMessage, Profile, ServerMessage } from "../../src/net/protocol";
import { seededRandom } from "../../src/lobby/catalogue";
import { defaults, type Setup } from "../../src/lobby/setup";
import { Flow, type Memory } from "../../src/play/flow";
import type { Pace } from "../../src/play/motion";
import { lookFixture, serverFixture, message, sender, storeFor, syncOf } from "./support/sheetState";

// What the page keeps, held in memory.
export function fakeMemory(): Memory {
  let setup: Setup = defaults(seededRandom(3));
  let profile: Profile | null = null;
  return {
    setup: () => setup,
    keepSetup: (kept) => {
      setup = kept;
    },
    profile: () => profile,
    keepProfile: (kept) => {
      profile = kept;
    },
  };
}

// A flow over a store that holds a fixture's table, with what it sent and what it kept.
function setup(name: string, change?: (sync: any) => void, accepts = true) {
  const store = storeFor(name, change);
  const sent = sender(accepts);
  const kept: Pace[] = [];
  let redrawn = 0;
  const memory = fakeMemory();
  const flow = new Flow({ send: sent.send, store, changed: () => (redrawn += 1), keepPace: (pace) => kept.push(pace), memory });
  // As the queue does: the message is applied to the store, and then the flow is told of it.
  const receive = (body: ServerMessage) => {
    store.apply(body, 0);
    flow.onApply(body);
  };
  return { store, sent, kept, flow, receive, memory, redrawn: () => redrawn };
}

const types = (messages: ClientMessage[]) => messages.map((each) => each.type);

describe("the sheets from the menu bar hold a solo game", () => {
  it("pauses it while one is open, and lets it go when it closes", () => {
    const { flow, sent } = setup("sheet-pause");
    flow.openMenu("rules");
    expect(flow.shown()).toBe("rules");
    expect(types(sent.messages)).toEqual(["pause"]);
    flow.closeMenu();
    expect(flow.shown()).toBeNull();
    expect(types(sent.messages)).toEqual(["pause", "resume"]);
  });

  it("asks once for a hold that is already asked for, when one sheet gives way to another", () => {
    const { flow, sent } = setup("sheet-pause");
    flow.openMenu("rules");
    flow.openMenu("settings");
    flow.openMenu("history");
    expect(types(sent.messages)).toEqual(["pause"]);
  });

  it("does not pause a round hold, which waits for you already, nor a game that has ended", () => {
    const held = setup("sheet-round");
    held.flow.openMenu("history");
    expect(held.sent.messages).toEqual([]);
    const over = setup("sheet-game-over");
    over.flow.openMenu("history");
    over.flow.closeMenu();
    expect(over.sent.messages).toEqual([]);
  });

  it("does not pause an online table, which has no pause", () => {
    const { flow, sent } = setup("sheet-pause", (sync) => {
      sync.table.mode = "online";
    });
    flow.openMenu("history");
    flow.escape();
    expect(sent.messages).toEqual([]);
  });

  it("opens over the sheet that is up, and that sheet comes back", () => {
    const { flow } = setup("sheet-round");
    expect(flow.shown()).toBe("round");
    flow.openMenu("history");
    expect(flow.shown()).toBe("history");
    flow.closeMenu();
    expect(flow.shown()).toBe("round");
  });
});

describe("Esc and Exit", () => {
  it("raise the pause menu over a game being played, and drop it again", () => {
    const { flow, sent } = setup("sheet-pause");
    flow.escape();
    expect(flow.shown()).toBe("pause");
    expect(types(sent.messages)).toEqual(["pause"]);
    flow.escape();
    expect(flow.shown()).toBeNull();
    expect(types(sent.messages)).toEqual(["pause", "resume"]);
  });

  it("close a sheet from the menu bar first, and keep the game held for the pause menu under it", () => {
    const { flow, sent } = setup("sheet-pause");
    flow.escape();
    flow.openMenu("rules");
    flow.escape();
    expect(flow.shown()).toBe("pause");
    expect(types(sent.messages)).toEqual(["pause"]);
  });

  it("let Exit take the pause menu over a sheet from the menu bar without letting the game go between them", () => {
    const { flow, sent } = setup("sheet-pause");
    flow.openMenu("settings");
    flow.exit();
    expect(flow.shown()).toBe("pause");
    expect(types(sent.messages)).toEqual(["pause"]);
    flow.resume();
    expect(types(sent.messages)).toEqual(["pause", "resume"]);
  });

  it("do nothing over a round sheet that holds the game, or an ended one", () => {
    for (const name of ["sheet-round", "sheet-game-over"]) {
      const { flow, sent } = setup(name);
      const shown = flow.shown();
      flow.escape();
      flow.exit();
      expect(flow.shown()).toBe(shown);
      expect(sent.messages).toEqual([]);
    }
  });

  it("do nothing when there is no game", () => {
    const { flow, sent } = setup("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    });
    flow.escape();
    expect(flow.shown()).toBeNull();
    expect(sent.messages).toEqual([]);
  });
});

describe("Continue", () => {
  it("sends continue for the round that is held, once", () => {
    const { flow, sent } = setup("sheet-round");
    expect(flow.continuedHold()).toBe(false);
    flow.continueRound();
    flow.continueRound();
    expect(sent.messages).toEqual([{ type: "continue", round: 9 }]);
    expect(flow.continuedHold()).toBe(true);
  });

  it("is asked again for a later hold, and after a sync", () => {
    const { flow, sent, receive } = setup("sheet-round");
    flow.continueRound();
    receive(message({ ...serverFixture("held"), round: 10 }, 2));
    expect(flow.continuedHold()).toBe(false);
    flow.continueRound();
    receive(syncOf({ ...serverFixture("sync"), held: { round: 10, waitingFor: [0], deadline: null } }));
    expect(flow.continuedHold()).toBe(false);
    expect(sent.messages.map((each) => (each as { round: number }).round)).toEqual([9, 10]);
  });

  it("is not sent for an online hold that no longer waits for your seat, as after a reload", () => {
    const awaited = setup("sheet-round", (sync) => {
      sync.table.mode = "online";
    });
    awaited.flow.continueRound();
    expect(types(awaited.sent.messages)).toEqual(["continue"]);
    const done = setup("sheet-round", (sync) => {
      sync.table.mode = "online";
      sync.held.waitingFor = [1, 2];
    });
    done.flow.continueRound();
    expect(done.sent.messages).toEqual([]);
  });

  it("closes a round sheet the game only rests on, and sends nothing for it", () => {
    const { flow, sent, receive } = setup("sheet-pause");
    receive(message(serverFixture("game.roundScored"), 3));
    expect(flow.shown()).toBe("round");
    flow.continueRound();
    expect(flow.shown()).toBeNull();
    expect(sent.messages).toEqual([]);
  });

  it("does nothing when the round is not held, or the message was not sent", () => {
    const none = setup("sheet-pause");
    none.flow.continueRound();
    expect(none.sent.messages).toEqual([]);
    const refused = setup("sheet-round", undefined, false);
    refused.flow.continueRound();
    expect(refused.flow.continuedHold()).toBe(false);
  });
});

describe("the ways on from the end of a game", () => {
  it("open New Game for a solo game's Play again, as the desktop does, and send nothing yet", () => {
    const { flow, sent } = setup("sheet-game-over");
    flow.playAgain();
    expect(flow.shown()).toBe("new-game");
    expect(sent.messages).toEqual([]);
    // Cancel puts the results back.
    flow.closeMenu();
    expect(flow.shown()).toBe("game-over");
  });

  it("go back to an online table from its results, where the host starts the next game", () => {
    const { flow, sent, receive } = setup("sheet-game-over", online("finished"));
    expect(flow.shown()).toBe("game-over");
    flow.playAgain();
    expect(flow.shown()).toBe("lobby");
    expect(sent.messages).toEqual([]);
    flow.startGame();
    expect(sent.messages).toEqual([{ type: "startGame" }]);
    receive(message({ type: "game", game: 2, event: { kind: "gameStarted" }, snapshot: serverFixture("game.gameStarted").snapshot }, 4));
    expect(flow.ui.backAtTable).toBe(false);
  });

  it("send leaveTable for Main menu, and show nothing for the table that is being left", () => {
    const { flow, sent, receive } = setup("sheet-game-over");
    flow.mainMenu();
    expect(sent.messages).toEqual([{ type: "leaveTable" }]);
    expect(flow.shown()).toBeNull();
    receive(message({ ...serverFixture("tableState"), state: "closed" }, 3));
    expect(flow.shown()).toBeNull();
    expect(sent.messages).toEqual([{ type: "leaveTable" }]);
  });

  it("show the table again when the way out is refused", () => {
    const { flow, receive } = setup("sheet-game-over");
    flow.mainMenu();
    expect(flow.shown()).toBeNull();
    receive(message({ type: "error", code: "rateLimited" }, 3));
    expect(flow.shown()).toBe("game-over");
  });

  it("send leaveTable from the pause menu without a resume after it, which a table that is gone would refuse", () => {
    const { flow, sent } = setup("sheet-pause");
    flow.escape();
    flow.mainMenu();
    expect(types(sent.messages)).toEqual(["pause", "leaveTable"]);
    expect(flow.shown()).toBeNull();
  });

  it("let go of the pause when a game ends under a sheet, without a resume", () => {
    const { flow, sent, receive } = setup("sheet-pause");
    flow.openMenu("history");
    receive(message(serverFixture("game.gameOver"), 7));
    expect(flow.shown()).toBe("history");
    flow.closeMenu();
    expect(flow.shown()).toBe("game-over");
    expect(types(sent.messages)).toEqual(["pause"]);
  });
});

describe("a sync", () => {
  it("shows the pause menu for a game the server holds, which a reload or a lost connection leaves held", () => {
    const { flow, sent, receive } = setup("sheet-pause");
    expect(flow.shown()).toBeNull();
    const paused = structuredClone(serverFixture("sync"));
    paused.table.paused = true;
    receive(syncOf(paused));
    expect(flow.shown()).toBe("pause");
    expect(sent.messages).toEqual([]);
    flow.resume();
    expect(types(sent.messages)).toEqual(["resume"]);
    expect(flow.shown()).toBeNull();
  });

  it("holds the game again for a sheet that is still open when the connection comes back", () => {
    const { flow, sent, receive } = setup("sheet-pause");
    flow.openMenu("rules");
    receive(syncOf(serverFixture("sync")));
    expect(types(sent.messages)).toEqual(["pause", "pause"]);
    expect(flow.shown()).toBe("rules");
  });

  it("does not raise the pause menu for the table's word that the game it asked to hold is held", () => {
    const { flow, receive } = setup("sheet-pause");
    flow.escape();
    flow.resume();
    receive(message({ ...serverFixture("tableState"), paused: true }, 4));
    expect(flow.shown()).toBeNull();
  });

  it("drops a pause menu the game no longer allows", () => {
    const { flow, receive } = setup("sheet-pause");
    flow.escape();
    receive(message(serverFixture("game.roundScored"), 3));
    expect(flow.shown()).toBe("pause");
    receive(message(serverFixture("held"), 4));
    expect(flow.shown()).toBe("round");
  });
});

describe("the settings", () => {
  it("send the whole settings with the new speed and wait to a solo table, and keep the pace", () => {
    const { flow, sent, kept, store } = setup("sheet-pause");
    flow.changeSettings({ botSpeed: 4, waitAfterRound: false, pace: "slow" });
    expect(kept).toEqual(["slow"]);
    expect(sent.messages).toEqual([
      { type: "updateSettings", settings: { ...store.state.table!.settings, botSpeed: 4, waitAfterRound: false } },
    ]);
  });

  it("keep the pace and send nothing at an online table or no table", () => {
    const online = setup("sheet-pause", (sync) => {
      sync.table.mode = "online";
    });
    online.flow.changeSettings({ botSpeed: 0, waitAfterRound: true, pace: "off" });
    expect(online.kept).toEqual(["off"]);
    expect(online.sent.messages).toEqual([]);
    const none = setup("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    });
    none.flow.changeSettings({ botSpeed: 0, waitAfterRound: true, pace: "quick" });
    expect(none.kept).toEqual(["quick"]);
    expect(none.sent.messages).toEqual([]);
  });

  it("reach a solo table that has just ended, and the next New Game", () => {
    const { flow, sent } = setup("sheet-game-over");
    flow.changeSettings({ botSpeed: 1, waitAfterRound: true, pace: "normal" });
    expect(types(sent.messages)).toEqual(["updateSettings"]);
  });
});

// A table of the screenshot tool's, made an online one in its lobby or its game.
function online(state: "lobby" | "playing" | "finished", change: (sync: any) => void = () => undefined) {
  return (sync: any) => {
    sync.table.mode = "online";
    sync.table.state = state;
    sync.table.host = 0;
    sync.table.code = "JFXB3J";
    if (state === "lobby") {
      sync.snapshot = null;
    }
    change(sync);
  };
}

describe("New Game", () => {
  it("makes a game at no table with createSolo alone, and keeps the setup for the next", () => {
    const { flow, sent, memory } = setup("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    });
    const asked = { ...memory.setup(), botSpeed: 4, seed: 9 };
    flow.openMenu("new-game");
    flow.deal(asked);
    expect(types(sent.messages)).toEqual(["createSolo"]);
    expect(sent.messages[0]).toMatchObject({ settings: { botSpeed: 4, seed: 9 } });
    expect(memory.setup()).toBe(asked);
  });

  it("keeps the sheet up, waiting, until the server answers with the table", () => {
    const { flow, sent, receive } = setup("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    });
    flow.openMenu("new-game");
    flow.deal(defaults(seededRandom(1)));
    expect(flow.shown()).toBe("new-game");
    expect(flow.asking()).toBe(true);
    receive(message(serverFixture("tableState"), 2));
    expect(flow.asking()).toBe(false);
    expect(flow.ui.menu).toBeNull();
    expect(types(sent.messages)).toEqual(["createSolo"]);
  });

  it("keeps the sheet up over the table it left when the new game is refused, for another try", () => {
    const { flow, receive } = setup("sheet-pause");
    flow.openMenu("new-game");
    flow.deal(defaults(seededRandom(1)));
    expect(flow.shown()).toBe("new-game");
    // The old table's own messages do not close the sheet: it waits for the new one.
    receive(message({ ...serverFixture("tableState"), paused: true }, 2));
    expect(flow.shown()).toBe("new-game");
    receive(message({ ...serverFixture("tableState"), state: "closed" }, 3));
    expect(flow.asking()).toBe(true);
    receive(message({ type: "error", code: "badMessage", detail: "name" }, 4));
    expect(flow.asking()).toBe(false);
    expect(flow.lostTable()).toBe(true);
    expect(flow.shown()).toBe("new-game");
  });

  it("waits for an answer only once something was asked, not while a sheet is merely open", () => {
    const { flow } = setup("sheet-pause");
    flow.openMenu("new-game");
    expect(flow.asking()).toBe(false);
    flow.deal(defaults(seededRandom(1)));
    expect(flow.asking()).toBe(true);
  });

  it("stops waiting when the connection comes back at no table, the answer lost with it", () => {
    const { flow, receive } = setup("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    });
    flow.openMenu("new-game");
    flow.deal(defaults(seededRandom(1)));
    expect(flow.asking()).toBe(true);
    receive(syncOf({ ...serverFixture("sync"), table: null, snapshot: null, history: [], lastTrick: null, prompt: null, held: null }));
    expect(flow.asking()).toBe(false);
    expect(flow.shown()).toBe("new-game");
  });

  it("stops waiting when the leaving that goes first is refused, and shows the table again", () => {
    const { flow, receive } = setup("sheet-game-over");
    flow.openMenu("new-game");
    flow.deal(defaults(seededRandom(1)));
    receive(message({ type: "error", code: "rateLimited" }, 3));
    expect(flow.asking()).toBe(false);
    expect(flow.lostTable()).toBe(false);
    flow.closeMenu();
    expect(flow.shown()).toBe("game-over");
  });

  it("asks before leaving an online table for a new game, and Stay goes back to the sheet", () => {
    const online = (sync: any) => {
      sync.table.mode = "online";
    };
    const stays = setup("sheet-pause", online);
    stays.flow.openMenu("new-game");
    stays.flow.deal(defaults(seededRandom(1)));
    expect(stays.flow.shown()).toBe("leave");
    expect(stays.sent.messages).toEqual([]);
    stays.flow.resume();
    expect(stays.flow.shown()).toBe("new-game");
    expect(stays.sent.messages).toEqual([]);

    const leaves = setup("sheet-pause", online);
    leaves.flow.openMenu("new-game");
    leaves.flow.deal(defaults(seededRandom(1)));
    leaves.flow.mainMenu();
    expect(types(leaves.sent.messages)).toEqual(["leaveTable", "createSolo"]);
    expect(leaves.flow.shown()).toBe("new-game");
    // The online table goes on, and can be joined again: a refused game does not lose it.
    expect(leaves.flow.lostTable()).toBe(false);
    // A later Exit is the plain question again.
    const plain = setup("sheet-pause", online);
    plain.flow.openMenu("new-game");
    plain.flow.deal(defaults(seededRandom(1)));
    plain.flow.escape();
    plain.flow.exit();
    plain.flow.mainMenu();
    expect(types(plain.sent.messages)).toEqual(["leaveTable"]);
  });

  it("leaves the table first when there is one, a game running or ended, and then makes the new game", () => {
    const running = setup("sheet-pause");
    running.flow.openMenu("new-game");
    running.flow.deal(running.memory.setup());
    // The game was held for the dialog and is not let go: its table closes.
    expect(types(running.sent.messages)).toEqual(["pause", "leaveTable", "createSolo"]);
    const ended = setup("sheet-game-over");
    ended.flow.deal(ended.memory.setup());
    expect(types(ended.sent.messages)).toEqual(["leaveTable", "createSolo"]);
    expect(ended.flow.shown()).toBeNull();
  });

  it("holds a game that is running while the dialog is up, and lets it go when the dialog is cancelled", () => {
    const { flow, sent } = setup("sheet-pause");
    flow.openMenu("new-game");
    expect(flow.shown()).toBe("new-game");
    flow.closeMenu();
    expect(types(sent.messages)).toEqual(["pause", "resume"]);
  });

  it("does not send createSolo when the connection is down, and keeps the sheet up", () => {
    const { flow, sent } = setup("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    }, false);
    flow.openMenu("new-game");
    flow.deal(flow.ui.menu === "new-game" ? defaults(seededRandom(1)) : defaults(seededRandom(2)));
    expect(sent.messages).toEqual([]);
    expect(flow.shown()).toBe("new-game");
  });
});

describe("Play online", () => {
  const nobody = (sync: any) => {
    sync.table = null;
    sync.snapshot = null;
  };
  const me = { name: "Hana", gender: "female" as const, avatar: "woman-long-red-hair" };

  it("keeps who you are, and joins a table by its code", () => {
    const { flow, sent, memory } = setup("sheet-pause", nobody);
    flow.openMenu("online");
    flow.join("JFXB3J", me);
    expect(sent.messages).toEqual([{ type: "joinTable", code: "JFXB3J", profile: me }]);
    expect(memory.profile()).toEqual(me);
    // The sheet stays up, to say what the server answers, until there is a table.
    expect(flow.shown()).toBe("online");
  });

  it("goes on to the table's own sheet with who you are kept, and makes the table with them", () => {
    const { flow, sent, memory } = setup("sheet-pause", nobody);
    flow.openMenu("online");
    flow.chooseCreate(me);
    expect(flow.shown()).toBe("create-table");
    flow.createTable({
      seats: 2,
      others: [{ kind: "open" }],
      structure: "1-8-1",
      foreheadAndHidden: true,
      allOneCardForehead: false,
      botSpeed: 2,
      waitAfterRound: false,
      replacement: "reckoner-beta",
      turnTimer: 10000,
    });
    expect(memory.profile()).toEqual(me);
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0]).toMatchObject({ type: "createTable", profile: me, settings: { turnTimer: 10000, seats: [{ kind: "open" }, { kind: "open" }] } });
  });

  it("closes the sheets that made a table once the table arrives, and forgets the address's code", () => {
    const { flow, receive } = setup("sheet-pause", nobody);
    flow.askToJoin("JFXB3J");
    expect(flow.shown()).toBe("online");
    flow.openMenu("online");
    receive(syncOf({ ...serverFixture("sync"), table: { ...serverFixture("sync").table, mode: "online", state: "lobby" }, snapshot: null }));
    expect(flow.ui.menu).toBeNull();
    expect(flow.ui.joinCode).toBeNull();
    expect(flow.shown()).toBe("lobby");
  });

  it("asks who you are for the table an address names, only when there is no table, and lets that be cancelled", () => {
    const none = setup("sheet-pause", nobody);
    none.flow.askToJoin("JFXB3J");
    expect(none.flow.shown()).toBe("online");
    none.flow.cancelJoin();
    expect(none.flow.shown()).toBeNull();
    const seated = setup("sheet-pause");
    seated.flow.askToJoin("JFXB3J");
    expect(seated.flow.shown()).toBeNull();
  });

  it("lets Esc close the sheet an address asked for", () => {
    const { flow } = setup("sheet-pause", nobody);
    flow.askToJoin("JFXB3J");
    flow.escape();
    expect(flow.shown()).toBeNull();
    expect(flow.ui.joinCode).toBeNull();
  });

  it("leaves the table you are at before making or joining another", () => {
    const { flow, sent } = setup("sheet-game-over");
    flow.join("JFXB3J", me);
    expect(types(sent.messages)).toEqual(["leaveTable", "joinTable"]);
  });
});

describe("an online table between games", () => {
  it("forgets Back to the table and a closed round sheet when a sync finds the next game on", () => {
    const { flow, receive } = setup("sheet-game-over", online("finished"));
    flow.playAgain();
    expect(flow.ui.backAtTable).toBe(true);
    const next = structuredClone(lookFixture("sheet-pause").state);
    next.table.mode = "online";
    next.table.state = "playing";
    next.table.host = 0;
    next.table.code = "JFXB3J";
    receive(syncOf(next));
    expect(flow.ui.backAtTable).toBe(false);
    expect(flow.ui.dismissedRound).toBeNull();
  });

  it("shows the lobby, not another game's results, to someone who sat down after it", () => {
    // A sync of a finished table to a newcomer holds no game.
    const { flow } = setup("sheet-pause", online("finished", (sync) => {
      sync.snapshot = null;
      sync.history = [];
      sync.lastTrick = null;
    }));
    expect(flow.shown()).toBe("lobby");
  });

  it("is left from its results with leaveTable, and Exit over its lobby offers to leave", () => {
    const { flow, sent } = setup("sheet-game-over", online("finished"));
    flow.playAgain();
    flow.exit();
    expect(flow.shown()).toBe("leave");
    flow.resume();
    expect(flow.shown()).toBe("lobby");
    flow.mainMenu();
    expect(types(sent.messages)).toEqual(["leaveTable"]);
  });
});

describe("an online table's lobby", () => {
  it("is shown while the game has not started, and Exit offers Leave table over it", () => {
    const { flow, sent } = setup("sheet-pause", online("lobby"));
    expect(flow.shown()).toBe("lobby");
    flow.exit();
    expect(flow.shown()).toBe("leave");
    expect(sent.messages).toEqual([]);
    flow.resume();
    expect(flow.shown()).toBe("lobby");
    flow.mainMenu();
    expect(types(sent.messages)).toEqual(["leaveTable"]);
  });

  it("sends the host's choices as messages for the table", () => {
    const { flow, sent } = setup("sheet-pause", online("lobby", (sync) => {
      sync.table.seats[3] = { kind: "open" };
      sync.table.seats[4] = { kind: "open" };
      sync.table.settings.seats[3] = { kind: "open" };
      sync.table.settings.seats[4] = { kind: "open" };
    }));
    flow.takeSeat(3);
    flow.chooseSeat(4, "cyborg");
    flow.changeSeatCount(5);
    flow.changeReplacement("ducking");
    flow.changeTurnTimer(10000);
    flow.changeOptions({ structure: "8-1-8", foreheadAndHidden: false, allOneCardForehead: true, botSpeed: 3, waitAfterRound: true });
    flow.fillSeats("low-risk");
    flow.startGame();
    expect(types(sent.messages)).toEqual(["takeSeat", "setSeat", "updateSettings", "updateSettings", "updateSettings", "updateSettings", "setSeat", "setSeat", "startGame"]);
    expect(sent.messages[1]).toEqual({ type: "setSeat", seat: 4, kind: "computer", level: "cyborg" });
    expect(sent.messages[4]).toMatchObject({ settings: { turnTimer: 10000 } });
    expect(sent.messages[5]).toMatchObject({ settings: { structure: "8-1-8", allOneCardForehead: true, botSpeed: 3, waitAfterRound: true } });
    expect(sent.messages.slice(6, 8).map((each) => (each as { seat: number }).seat)).toEqual([3, 4]);
  });
});

describe("at an online table in play", () => {
  it("has no pause: Esc offers to leave, and the game is never held", () => {
    const { flow, sent } = setup("sheet-pause", online("playing"));
    flow.escape();
    expect(flow.shown()).toBe("leave");
    flow.escape();
    expect(flow.shown()).toBeNull();
    flow.openMenu("history");
    expect(sent.messages).toEqual([]);
  });

  it("leaves with leaveTable, the table's computer player taking the seat", () => {
    const { flow, sent } = setup("sheet-pause", online("playing"));
    flow.exit();
    flow.mainMenu();
    expect(types(sent.messages)).toEqual(["leaveTable"]);
    expect(flow.shown()).toBeNull();
  });

  it("does not change the table's speed or wait from the settings sheet, nor the next game's", () => {
    const { flow, sent, kept, memory } = setup("sheet-pause", online("playing"));
    const before = memory.setup();
    flow.changeSettings({ botSpeed: 4, waitAfterRound: true, pace: "slow" });
    expect(kept).toEqual(["slow"]);
    expect(sent.messages).toEqual([]);
    expect(memory.setup()).toBe(before);
  });
});

describe("the settings sheet's changes", () => {
  it("are kept for the next New Game, at a solo table or at none", () => {
    const solo = setup("sheet-pause");
    solo.flow.changeSettings({ botSpeed: 4, waitAfterRound: true, pace: "off" });
    expect(solo.memory.setup()).toMatchObject({ botSpeed: 4, waitAfterRound: true });
    const none = setup("sheet-pause", (sync) => {
      sync.table = null;
      sync.snapshot = null;
    });
    none.flow.changeSettings({ botSpeed: 0, waitAfterRound: false, pace: "quick" });
    expect(none.memory.setup()).toMatchObject({ botSpeed: 0, waitAfterRound: false });
    expect(none.sent.messages).toEqual([]);
  });
});

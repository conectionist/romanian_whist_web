import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "../../src/net/protocol";
import { Flow } from "../../src/play/flow";
import type { Pace } from "../../src/play/motion";
import { serverFixture, message, sender, storeFor, syncOf } from "./support/sheetState";

// A flow over a store that holds a fixture's table, with what it sent and what it kept.
function setup(name: string, change?: (sync: any) => void, accepts = true) {
  const store = storeFor(name, change);
  const sent = sender(accepts);
  const kept: Pace[] = [];
  let redrawn = 0;
  const flow = new Flow({ send: sent.send, store, changed: () => (redrawn += 1), keepPace: (pace) => kept.push(pace) });
  // As the queue does: the message is applied to the store, and then the flow is told of it.
  const receive = (body: ServerMessage) => {
    store.apply(body, 0);
    flow.onApply(body);
  };
  return { store, sent, kept, flow, receive, redrawn: () => redrawn };
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
  it("send startGame for Play again", () => {
    const { flow, sent } = setup("sheet-game-over");
    flow.playAgain();
    expect(sent.messages).toEqual([{ type: "startGame" }]);
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
    receive(message(serverFixture("held"), 3));
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

  it("reach a solo table that has just ended, so Play again starts the next game at the new speed", () => {
    const { flow, sent } = setup("sheet-game-over");
    flow.changeSettings({ botSpeed: 1, waitAfterRound: true, pace: "normal" });
    expect(types(sent.messages)).toEqual(["updateSettings"]);
  });
});

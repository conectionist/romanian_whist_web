import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decode } from "../../src/net/decode";
import type { ClientMessage, ServerMessage } from "../../src/net/protocol";
import { Controller } from "../../src/play/controller";
import { modelOf } from "../../src/play/model";
import { Store, type Change } from "../../src/play/store";

const LOOK = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/look");

function syncFor(name: string, change: (state: any) => void = () => undefined): ServerMessage {
  const { state } = JSON.parse(readFileSync(join(LOOK, `${name}.json`), "utf8"));
  change(state);
  return decode(JSON.stringify({ type: "sync", seq: 0, ...state }));
}

const NO_CHANGE: Change = { kind: "error", event: null, fresh: false };

function setup(name: string, change?: (state: any) => void, accepts = true) {
  const store = new Store();
  store.apply(syncFor(name, change), 0);
  const sent: ClientMessage[] = [];
  const played: string[] = [];
  const recalled: string[] = [];
  let redraws = 0;
  const controller = new Controller({
    send: (message) => {
      if (accepts) {
        sent.push(message);
      }
      return accepts;
    },
    store,
    table: { playOwn: (card) => played.push(card), recallOwn: (card) => recalled.push(card) },
    redraw: () => {
      redraws += 1;
    },
  });
  // The queue tells the controller what it applies, then the store has it.
  const apply = (message: ServerMessage) => {
    store.apply(message, 0);
    controller.onApply(message, NO_CHANGE);
  };
  return { store, controller, sent, played, recalled, apply, redraws: () => redraws };
}

describe("a click on your hand", () => {
  it("sends the card's index in the server's hand, and moves the card at once", () => {
    const run = setup("table-4-players");
    // Slot 1 is KC, which is index 0 of the server's hand.
    run.controller.onPlay(1);
    expect(run.sent).toEqual([{ type: "play", prompt: 23, index: 0 }]);
    expect(run.played).toEqual(["KC"]);
    expect(run.redraws()).toBe(1);
    expect(run.controller.pendingPlay).toEqual({ prompt: 23, card: "KC" });
  });

  it("sends nothing for a card that cannot be played", () => {
    const run = setup("table-4-players");
    run.controller.onPlay(0);
    expect(run.sent).toEqual([]);
    expect(run.played).toEqual([]);
  });

  it("answers once", () => {
    const run = setup("table-4-players");
    run.controller.onPlay(1);
    run.controller.onPlay(2);
    expect(run.sent).toHaveLength(1);
  });

  it("sends nothing when there is no prompt, or no connection", () => {
    const between = setup("table-4-players", (state) => {
      state.prompt = null;
    });
    between.controller.onPlay(1);
    expect(between.sent).toEqual([]);

    const closed = setup("table-4-players", undefined, false);
    closed.controller.onPlay(1);
    expect(closed.controller.pendingPlay).toBeNull();
    expect(closed.played).toEqual([]);
  });

  it("takes the card out of your hand while its play waits, and ends your turn", () => {
    const run = setup("table-4-players");
    run.controller.onPlay(1);
    const model = run.controller.adjust(modelOf(run.store.state));
    expect(model?.hand.entries.map((entry) => entry.card)).toEqual(["8H", "7C", "QD"]);
    expect(model?.hand.positions).toEqual([3, 2, 1]);
    expect(model?.hand.playable).toBe(false);
    expect(model?.prompt).toBeNull();
  });

  it("does not move the card again when the server says it was played", () => {
    const run = setup("table-4-players");
    run.controller.onPlay(1);
    run.apply({ type: "promptClosed", seq: 1, id: 23, by: "you" });
    const snapshot = JSON.parse(readFileSync(join(LOOK, "table-4-players.json"), "utf8")).state.snapshot;
    snapshot.table.cards.push({ card: "KC", seat: 0, winning: false });
    run.apply(decode(JSON.stringify({ type: "game", seq: 2, game: 1, event: { kind: "cardPlayed", seat: 0, card: "KC" }, snapshot })));
    expect(run.played).toEqual(["KC"]);
    expect(run.controller.pendingPlay).toBeNull();
    expect(run.recalled).toEqual([]);
  });

  it("puts the card back when the server refuses it", () => {
    const run = setup("table-4-players");
    run.controller.onPlay(1);
    run.apply({ type: "error", seq: 3, code: "illegal" });
    expect(run.recalled).toEqual(["KC"]);
    expect(run.controller.pendingPlay).toBeNull();
    const model = run.controller.adjust(modelOf(run.store.state));
    expect(model?.hand.entries.map((entry) => entry.card)).toEqual(["8H", "KC", "7C", "QD"]);
  });

  it("puts it back for a stale prompt and for no turn, but not for any other error", () => {
    for (const code of ["stalePrompt", "notYourTurn"] as const) {
      const run = setup("table-4-players");
      run.controller.onPlay(1);
      run.apply({ type: "error", seq: 3, code });
      expect(run.recalled).toEqual(["KC"]);
    }
    const run = setup("table-4-players");
    run.controller.onPlay(1);
    run.apply({ type: "error", seq: 3, code: "rateLimited" });
    expect(run.recalled).toEqual([]);
    expect(run.controller.pendingPlay).not.toBeNull();
  });

  it("forgets what it sent when a sync says what is open now", () => {
    const run = setup("table-4-players");
    run.controller.onPlay(1);
    run.apply(syncFor("table-4-players"));
    expect(run.controller.pendingPlay).toBeNull();
  });

  it("takes the card back when the timer ran out and the computer played another", () => {
    const run = setup("table-4-players");
    run.controller.onPlay(1);
    run.apply({ type: "promptClosed", seq: 4, id: 23, by: "computer" });
    expect(run.recalled).toEqual(["KC"]);
    expect(run.controller.pendingPlay).toBeNull();
  });

  it("plays a blind card without showing it, and empties the hand", () => {
    const run = setup("table-4-players", (state) => {
      state.prompt = { id: 24, kind: "play", deadline: null, handSize: 1, legal: [0], blind: true };
    });
    run.controller.onPlay(0);
    expect(run.sent).toEqual([{ type: "play", prompt: 24, index: 0 }]);
    expect(run.played).toEqual([]);
    const model = run.controller.adjust(modelOf(run.store.state));
    expect(model?.hand).toEqual({ entries: [], backs: 0, positions: [], playable: false });
  });
});

describe("a click on a bid", () => {
  it("sends the bid and hides the strip", () => {
    const run = setup("bidding");
    run.controller.onBid(1);
    expect(run.sent).toEqual([{ type: "bet", prompt: 1, value: 1 }]);
    expect(run.controller.adjust(modelOf(run.store.state))?.prompt).toBeNull();
    run.controller.onBid(0);
    expect(run.sent).toHaveLength(1);
  });

  it("shows the strip again when the server refuses the bid", () => {
    const run = setup("bidding");
    run.controller.onBid(1);
    run.apply({ type: "error", seq: 2, code: "illegal" });
    expect(run.controller.pendingBid).toBeNull();
    expect(run.controller.adjust(modelOf(run.store.state))?.prompt).toMatchObject({ kind: "bet" });
  });

  it("is done when the prompt is closed", () => {
    const run = setup("bidding");
    run.controller.onBid(1);
    run.apply({ type: "promptClosed", seq: 2, id: 1, by: "you" });
    expect(run.controller.pendingBid).toBeNull();
  });

  it("does not bid where a card is asked for", () => {
    const run = setup("table-4-players");
    run.controller.onBid(1);
    expect(run.sent).toEqual([]);
  });
});

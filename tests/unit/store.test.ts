import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decode } from "../../src/net/decode";
import type { ServerMessage } from "../../src/net/protocol";
import { Store, apply, applyPromptClosed, emptyStore } from "../../src/play/store";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/fixtures");

function fixture(name: string): ServerMessage {
  return decode(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
}

function of<T extends ServerMessage["type"]>(name: string, type: T): Extract<ServerMessage, { type: T }> {
  const message = fixture(name);
  if (message.type !== type) {
    throw new Error(`${name} is a ${message.type}`);
  }
  return message as Extract<ServerMessage, { type: T }>;
}

describe("the store", () => {
  it("starts empty", () => {
    const state = emptyStore();
    expect(state.table).toBeNull();
    expect(state.snapshot).toBeNull();
    expect(state.history).toEqual([]);
  });

  it("takes a sync whole, and counts the prompt's deadline from when it was received", () => {
    const sync = of("sync", "sync");
    const message = { ...sync, prompt: sync.prompt === null ? null : { ...sync.prompt, deadline: 60000 } };
    const { state, change } = apply(emptyStore(), message, 1000);
    expect(change).toEqual({ kind: "sync", event: null, fresh: true });
    expect(state.table?.code).toBe("6BR92T");
    expect(state.game).toBe(1);
    expect(state.history).toHaveLength(7);
    expect(state.lastTrick?.round).toBe(7);
    expect(state.prompt?.body.id).toBe(30);
    expect(state.prompt?.receivedAt).toBe(1000);
    expect(state.prompt?.deadlineAt).toBe(61000);
  });

  it("has no deadline for a prompt with no timer", () => {
    const { state } = apply(emptyStore(), of("prompt.play", "prompt"), 5);
    expect(state.prompt?.deadlineAt).toBeNull();
  });

  it("replaces everything on a sync, so what was held before it is gone", () => {
    const store = new Store();
    store.apply(of("sync", "sync"), 0);
    store.apply(of("held", "held"), 10);
    expect(store.state.held?.waitingFor).toEqual([0]);
    const empty = { ...of("sync", "sync"), table: null, game: null, snapshot: null, history: [], lastTrick: null, prompt: null, held: null };
    store.apply(empty, 20);
    expect(store.state.table).toBeNull();
    expect(store.state.snapshot).toBeNull();
    expect(store.state.held).toBeNull();
    expect(store.state.history).toEqual([]);
  });

  it("pushes the round's result to the history on roundScored", () => {
    const store = new Store();
    store.apply(of("sync", "sync"), 0);
    const before = store.state.history.length;
    const change = store.apply(of("game.roundScored", "game"), 1);
    expect(change.kind).toBe("game");
    expect(change.event?.kind).toBe("roundScored");
    expect(store.state.history).toHaveLength(before + 1);
    expect(store.state.history[before].index).toBe(0);
    expect(store.state.snapshot?.phase).toBe("roundScored");
  });

  it("keeps the trick that was won as the last trick", () => {
    const store = new Store();
    store.apply(of("game.trickWon", "game"), 1);
    expect(store.state.lastTrick).toEqual({
      round: 0,
      ledBy: 0,
      cards: [
        { card: "JS", seat: 0, winning: true },
        { card: "TS", seat: 1, winning: false },
        { card: "KC", seat: 2, winning: false },
      ],
    });
  });

  it("starts a game with nothing of the last one", () => {
    const store = new Store();
    store.apply(of("sync", "sync"), 0);
    store.apply(of("game.gameStarted", "game"), 1);
    expect(store.state.history).toEqual([]);
    expect(store.state.lastTrick).toBeNull();
    expect(store.state.prompt).toBeNull();
  });

  it("ends a hold with the round's completion", () => {
    const store = new Store();
    store.apply(of("held", "held"), 0);
    expect(store.state.held).not.toBeNull();
    store.apply(of("game.roundComplete", "game"), 1);
    expect(store.state.held).toBeNull();
  });

  it("keeps the last snapshot when a stopped game has none, and drops the prompt", () => {
    const store = new Store();
    store.apply(of("sync", "sync"), 0);
    const stopped = { ...of("game.gameStopped", "game"), snapshot: null };
    store.apply(stopped, 1);
    expect(store.state.snapshot?.round.index).toBe(7);
    expect(store.state.prompt).toBeNull();
  });

  it("takes the same prompt again, with the time left now", () => {
    const store = new Store();
    const first = of("prompt.play", "prompt");
    store.apply({ ...first, deadline: 60000 }, 1000);
    store.apply({ ...first, deadline: 45000 }, 16000);
    expect(store.state.prompt?.body.id).toBe(first.id);
    expect(store.state.prompt?.deadlineAt).toBe(61000);
    expect(store.state.prompt?.receivedAt).toBe(16000);
  });

  it("ignores a close for a prompt it does not hold", () => {
    const store = new Store();
    store.apply(of("prompt.play", "prompt"), 0);
    const before = store.state;
    expect(applyPromptClosed(before, 999)).toBe(before);
    expect(applyPromptClosed(emptyStore(), 1)).toEqual(emptyStore());
  });

  it("closes a prompt it holds, and keeps a closed id closed", () => {
    const store = new Store();
    const prompt = of("prompt.play", "prompt");
    store.apply(prompt, 0);
    store.apply(of("promptClosed.you", "promptClosed"), 1);
    expect(store.state.prompt?.body.id).toBe(prompt.id);
    store.apply({ type: "promptClosed", seq: 9, id: prompt.id, by: "you" }, 2);
    expect(store.state.prompt).toBeNull();
    store.apply(prompt, 3);
    expect(store.state.prompt).toBeNull();
  });

  it("takes the table state, without the envelope", () => {
    const store = new Store();
    store.apply(of("tableState", "tableState"), 0);
    expect(store.state.table?.code).toBe("6BR92T");
    expect(store.state.table).not.toHaveProperty("type");
    expect(store.state.table).not.toHaveProperty("seq");
  });

  it("notes an error", () => {
    const store = new Store();
    const change = store.apply(of("error", "error"), 0);
    expect(change.kind).toBe("error");
    expect(store.state.lastError).toEqual({ code: "illegal" });
  });
});

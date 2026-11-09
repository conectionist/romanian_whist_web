import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decode } from "../../src/net/decode";
import type { ServerMessage } from "../../src/net/protocol";
import type { Pace } from "../../src/play/motion";
import { PlaybackQueue, type Stage } from "../../src/play/queue";
import { Store, type Change } from "../../src/play/store";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/fixtures");
const fixture = (name: string): ServerMessage => decode(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));

const closed = (id: number): ServerMessage => ({ type: "promptClosed", seq: id, id, by: "you" });

// A stage whose relayouts wait to be let go, so a test decides when each ends.
class FakeStage implements Stage {
  calls: { change: Change; animate: boolean }[] = [];
  finished = 0;
  private readonly waiting: (() => void)[] = [];

  relayout(change: Change, animate: boolean): Promise<void> {
    this.calls.push({ change, animate });
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  finishMotion(): void {
    this.finished += 1;
    // Whatever was in the air lands, which lets the queue go on.
    this.release();
  }

  // Ends the oldest relayout still running.
  release(): void {
    this.waiting.shift()?.();
  }

  get running(): number {
    return this.waiting.length;
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: { pace?: Pace; hidden?: boolean } = {}) {
  const store = new Store();
  const stage = new FakeStage();
  const clock = { now: 0 };
  const applied: ServerMessage[] = [];
  const queue = new PlaybackQueue(store, stage, {
    pace: () => options.pace ?? "normal",
    hidden: () => options.hidden ?? false,
    now: () => clock.now,
    onApply: (message) => applied.push(message),
  });
  return { store, stage, clock, queue, applied };
}

describe("the playback queue", () => {
  it("handles messages in order, each awaiting its relayout", async () => {
    const { stage, queue, applied } = setup();
    queue.push(closed(1));
    queue.push(closed(2));
    queue.push(closed(3));
    expect(stage.calls).toHaveLength(1);
    expect(applied.map((message) => (message as { id: number }).id)).toEqual([1]);

    stage.release();
    await tick();
    expect(stage.calls).toHaveLength(2);
    stage.release();
    await tick();
    expect(stage.calls).toHaveLength(3);
    expect(applied.map((message) => (message as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it("drops what is queued when a sync arrives, and lets the motion land", async () => {
    const { stage, queue, store, applied } = setup();
    queue.push(closed(1));
    queue.push(closed(2));
    queue.push(closed(3));
    expect(queue.waiting).toBe(2);

    queue.push(fixture("sync"));
    expect(stage.finished).toBe(1);
    expect(queue.waiting).toBe(1);

    await tick();
    // The sync is next: the two before it were never drawn.
    expect(applied.map((message) => message.type)).toEqual(["promptClosed", "sync"]);
    expect(store.state.table?.code).toBe("6BR92T");
  });

  it("starts catching up above 4 waiting messages, and draws the last one in full", async () => {
    const { stage, queue } = setup();
    for (let id = 1; id <= 6; id++) {
      queue.push(closed(id));
    }
    for (let step = 0; step < 6; step++) {
      stage.release();
      await tick();
    }
    expect(stage.calls.map((call) => call.animate)).toEqual([true, false, false, false, false, true]);
  });

  it("does not catch up for 4 waiting messages", async () => {
    const { stage, queue } = setup();
    for (let id = 1; id <= 5; id++) {
      queue.push(closed(id));
    }
    for (let step = 0; step < 5; step++) {
      stage.release();
      await tick();
    }
    expect(stage.calls.map((call) => call.animate)).toEqual([true, true, true, true, true]);
  });

  it("takes a prompt live only once it is reached, counting its deadline from when it was received", async () => {
    const { stage, queue, store, clock } = setup();
    queue.push(closed(1));
    clock.now = 1000;
    const prompt = fixture("prompt.play");
    queue.push(prompt.type === "prompt" ? { ...prompt, deadline: 60000 } : prompt);
    clock.now = 9000;
    expect(store.state.prompt).toBeNull();

    stage.release();
    await tick();
    expect(store.state.prompt?.receivedAt).toBe(1000);
    expect(store.state.prompt?.deadlineAt).toBe(61000);
  });

  it("animates nothing at Off, or in a tab in the background", async () => {
    const off = setup({ pace: "off" });
    off.queue.push(closed(1));
    expect(off.stage.calls[0].animate).toBe(false);

    const hidden = setup({ hidden: true });
    hidden.queue.push(closed(1));
    expect(hidden.stage.calls[0].animate).toBe(false);
  });

  it("animates at every pace but Off", () => {
    for (const pace of ["quick", "normal", "slow"] as const) {
      const run = setup({ pace });
      run.queue.push(closed(1));
      expect(run.stage.calls[0].animate, pace).toBe(true);
    }
  });

  it("says what each message changed", async () => {
    const { stage, queue } = setup();
    queue.push(fixture("game.cardPlayed"));
    expect(stage.calls[0].change).toMatchObject({ kind: "game", event: { kind: "cardPlayed", seat: 0, card: "JS" }, fresh: false });
    stage.release();
    await tick();
    queue.push(fixture("sync"));
    expect(stage.calls[1].change).toMatchObject({ kind: "sync", fresh: true });
  });

  it("goes on with the messages behind one it could not draw, and reports it", async () => {
    const store = new Store();
    let first = true;
    const drawn: string[] = [];
    const stage: Stage = {
      relayout: (change) => {
        drawn.push(change.kind);
        if (first) {
          first = false;
          return Promise.reject(new Error("could not draw"));
        }
        return Promise.resolve();
      },
      finishMotion: () => undefined,
    };
    const reported: unknown[] = [];
    const queue = new PlaybackQueue(store, stage, {
      pace: () => "off",
      hidden: () => false,
      now: () => 0,
      onError: (error) => reported.push(error),
    });
    queue.push(closed(1));
    queue.push(closed(2));
    await tick();
    expect(drawn).toEqual(["promptClosed", "promptClosed"]);
    expect(reported).toHaveLength(1);
  });
});

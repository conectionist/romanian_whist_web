import { describe, expect, it } from "vitest";
import { BACKOFF_MS, Connection, TOKEN_KEY, delayFor, type Status } from "../../src/net/connection";
import type { ServerMessage } from "../../src/net/protocol";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, ((event: any) => void)[]>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.fire("close", {});
  }

  fire(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

function setup(initial: Record<string, string> = {}) {
  FakeSocket.instances = [];
  const storage = memory(initial);
  const session = memory();
  const statuses: Status[] = [];
  const messages: ServerMessage[] = [];
  const unreadable: string[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  let reloads = 0;
  const connection = new Connection({
    url: "ws://example/ws",
    storage,
    session,
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
    setTimer: (run, ms) => timers.push({ run, ms }),
    clearTimer: () => undefined,
    reload: () => {
      reloads += 1;
    },
    onStatus: (status) => statuses.push(status),
    onMessage: (message) => messages.push(message),
    onUnreadable: (error) => unreadable.push(error.field),
  });
  connection.start();
  const socket = () => FakeSocket.instances[FakeSocket.instances.length - 1];
  return { connection, storage, session, statuses, messages, unreadable, timers, socket, reloads: () => reloads };
}

const welcome = JSON.stringify({ type: "welcome", seq: 1, token: "LXF33D9tR1EIzH3GPvWDpw", member: 1, server: { version: "0.1.0", commit: "abc" } });
const error = (code: string) => JSON.stringify({ type: "error", seq: 2, code });

describe("the back-off", () => {
  it("waits 1, 2, 4, 8 and then 15 seconds", () => {
    expect(BACKOFF_MS).toEqual([1000, 2000, 4000, 8000, 15000]);
    expect([0, 1, 2, 3, 4, 5, 50].map(delayFor)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });
});

describe("the connection", () => {
  it("says hello first, with no token the first time", () => {
    const { socket, statuses } = setup();
    socket().readyState = 1;
    socket().fire("open", {});
    expect(JSON.parse(socket().sent[0])).toEqual({ type: "hello", protocol: 1, lang: "en" });
    expect(statuses).toEqual(["connecting", "open"]);
  });

  it("sends the token it keeps, only in hello", () => {
    const { socket } = setup({ [TOKEN_KEY]: "LXF33D9tR1EIzH3GPvWDpw" });
    socket().readyState = 1;
    socket().fire("open", {});
    expect(JSON.parse(socket().sent[0])).toEqual({ type: "hello", protocol: 1, lang: "en", token: "LXF33D9tR1EIzH3GPvWDpw" });
  });

  it("keeps the token the welcome gives, whichever it is", () => {
    const { socket, storage, messages } = setup({ [TOKEN_KEY]: "old" });
    socket().fire("message", { data: welcome });
    expect(storage.values.get(TOKEN_KEY)).toBe("LXF33D9tR1EIzH3GPvWDpw");
    expect(messages.map((message) => message.type)).toEqual(["welcome"]);
  });

  it("reconnects with a back-off, starting over once welcomed", () => {
    const { socket, timers, statuses } = setup();
    socket().close();
    expect(statuses[statuses.length - 1]).toBe("closed");
    expect(timers.map((timer) => timer.ms)).toEqual([1000]);
    timers[0].run();
    socket().close();
    expect(timers.map((timer) => timer.ms)).toEqual([1000, 2000]);
    timers[1].run();
    socket().fire("message", { data: welcome });
    socket().close();
    expect(timers.map((timer) => timer.ms)).toEqual([1000, 2000, 1000]);
  });

  it("does not reconnect once another tab has taken the member over", () => {
    const { socket, timers, statuses } = setup();
    socket().fire("message", { data: error("openElsewhere") });
    socket().close();
    expect(timers).toEqual([]);
    expect(statuses).toContain("elsewhere");
  });

  it("reloads once for a new version, and then gives up", () => {
    const { socket, reloads, timers, statuses } = setup();
    socket().fire("message", { data: error("version") });
    expect(reloads()).toBe(1);
    expect(statuses[statuses.length - 1]).toBe("closed");
    socket().close();
    expect(timers).toEqual([]);

    const again = setup();
    again.session.setItem("whist.reloaded", "1");
    again.socket().fire("message", { data: error("version") });
    expect(again.reloads()).toBe(0);
  });

  it("drops a token the server refuses and says hello again without it", () => {
    const { socket, storage, statuses } = setup({ [TOKEN_KEY]: "not a token" });
    socket().readyState = 1;
    socket().fire("open", {});
    expect(JSON.parse(socket().sent[0]).token).toBe("not a token");
    const refused = socket();
    refused.fire("message", { data: JSON.stringify({ type: "error", seq: 1, code: "badMessage", detail: "token" }) });

    expect(storage.values.has(TOKEN_KEY)).toBe(false);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(socket()).not.toBe(refused);
    socket().readyState = 1;
    socket().fire("open", {});
    expect(JSON.parse(socket().sent[0])).toEqual({ type: "hello", protocol: 1, lang: "en" });
    expect(statuses[statuses.length - 1]).toBe("open");
    // The refused socket closing on its own is not a lost connection.
    refused.fire("close", {});
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("leaves a badMessage about anything else, or after the welcome, alone", () => {
    const other = setup({ [TOKEN_KEY]: "LXF33D9tR1EIzH3GPvWDpw" });
    other.socket().fire("message", { data: JSON.stringify({ type: "error", seq: 1, code: "badMessage", detail: "lang" }) });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(other.storage.values.has(TOKEN_KEY)).toBe(true);

    const welcomed = setup();
    welcomed.socket().fire("message", { data: welcome });
    welcomed.socket().fire("message", { data: JSON.stringify({ type: "error", seq: 2, code: "badMessage", detail: "token" }) });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(welcomed.storage.values.get(TOKEN_KEY)).toBe("LXF33D9tR1EIzH3GPvWDpw");
  });

  it("goes on after a message it cannot read", () => {
    const { socket, messages, unreadable } = setup();
    socket().fire("message", { data: JSON.stringify({ type: "dance", seq: 1 }) });
    socket().fire("message", { data: welcome });
    expect(unreadable).toEqual(["type"]);
    expect(messages.map((message) => message.type)).toEqual(["welcome"]);
  });

  it("sends only while open", () => {
    const { connection, socket } = setup();
    expect(connection.send({ type: "pause" })).toBe(false);
    socket().readyState = WebSocket.OPEN;
    expect(connection.send({ type: "pause" })).toBe(true);
    expect(JSON.parse(socket().sent[0])).toEqual({ type: "pause" });
  });
});

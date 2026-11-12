import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "../../../src/net/decode";
import type { ClientMessage, RoundResult, ServerMessage } from "../../../src/net/protocol";
import { Store } from "../../../src/play/store";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OWN = join(ROOT, "tests/look/fixtures");
const FIXTURES = join(ROOT, "libs/romanian_whist_server/protocol/fixtures");

// One of the page's own look fixtures: the six-seat table the desktop's pictures of its sheets sit
// on, as a sync, with the messages it applies after it.
export function lookFixture(name: string): { state: any; messages: any[]; shot: any; sheet?: string } {
  return JSON.parse(readFileSync(join(OWN, `${name}.json`), "utf8"));
}

export function serverFixture(name: string): any {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
}

export function syncOf(state: object): ServerMessage {
  return decode(JSON.stringify({ type: "sync", seq: 0, ...state }));
}

export function message(body: object, seq = 1): ServerMessage {
  return decode(JSON.stringify({ seq, ...body }));
}

// A store holding what a fixture shows, changed by `change` before it is read.
export function storeFor(name: string, change: (state: any) => void = () => undefined): Store {
  const { state, messages } = lookFixture(name);
  const copy = structuredClone(state);
  change(copy);
  const store = new Store();
  store.apply(syncOf(copy), 0);
  messages?.forEach((each, index) => store.apply(message(each, index + 1), 0));
  return store;
}

// What the page sent, for a test of the flow.
export interface Sent {
  messages: ClientMessage[];
  send(message: ClientMessage): boolean;
}

export function sender(accepts = true): Sent {
  const messages: ClientMessage[] = [];
  return {
    messages,
    send: (each) => {
      if (accepts) {
        messages.push(each);
      }
      return accepts;
    },
  };
}

// The first round of a fixture's history, as the page's decoder reads it.
export function roundOf(name = "sheet-round"): RoundResult {
  const sync = syncOf(lookFixture(name).state);
  if (sync.type !== "sync") {
    throw new Error("not a sync");
  }
  return sync.history[0];
}

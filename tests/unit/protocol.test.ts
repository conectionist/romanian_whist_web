import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DecodeError, decode } from "../../src/net/decode";

const PROTOCOL = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol");

function read(directory: string, file: string): string {
  return readFileSync(join(PROTOCOL, directory, file), "utf8");
}

function jsonFiles(directory: string): string[] {
  return readdirSync(join(PROTOCOL, directory)).filter((name) => name.endsWith(".json"));
}

function failure(text: string): DecodeError {
  try {
    decode(text);
  } catch (error) {
    if (error instanceof DecodeError) {
      return error;
    }
    throw error;
  }
  throw new Error("decode did not throw");
}

describe("the server's fixtures", () => {
  const fixtures = jsonFiles("fixtures");

  it("are all there", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(28);
  });

  for (const file of fixtures) {
    it(`decode ${file}`, () => {
      const text = read("fixtures", file);
      const message = decode(text);
      expect(message.type).toBe(JSON.parse(text).type);
      expect(message.seq).toBe(JSON.parse(text).seq);
    });
  }
});

describe("the look fixtures", () => {
  const looks = jsonFiles("look");

  it("are all there", () => {
    expect(looks).toHaveLength(9);
  });

  for (const file of looks) {
    const { state } = JSON.parse(read("look", file));
    if (state === null) {
      it(`${file} has no state to decode`, () => {
        expect(file).toBe("table-empty.json");
      });
      continue;
    }
    it(`decode ${file}'s state, wrapped as a sync`, () => {
      const message = decode(JSON.stringify({ type: "sync", seq: 0, ...state }));
      expect(message.type).toBe("sync");
    });
  }
});

describe("decode", () => {
  const sync = JSON.parse(read("fixtures", "sync.json"));
  const prompt = JSON.parse(read("fixtures", "prompt.play.json"));

  it("keeps what a message says", () => {
    const message = decode(read("fixtures", "game.cardPlayed.json"));
    if (message.type !== "game") {
      throw new Error("not a game message");
    }
    expect(message.event).toEqual({ kind: "cardPlayed", seat: 0, card: "JS" });
    expect(message.snapshot?.table.cards[0]).toEqual({ seat: 0, card: "JS", winning: true });
  });

  it("keeps a prompt's hand, and a blind prompt's size", () => {
    expect(decode(JSON.stringify(prompt))).toMatchObject({ type: "prompt", kind: "play", hand: ["JS"], legal: [0] });
    const blind = decode(read("fixtures", "prompt.play-blind.json"));
    expect(blind).toMatchObject({ type: "prompt", handSize: 1, blind: true });
    expect("hand" in blind).toBe(false);
  });

  it("refuses text that is not JSON", () => {
    expect(failure("not json").field).toBe("");
  });

  it("refuses an unknown type, naming the type field", () => {
    expect(failure(JSON.stringify({ type: "dance", seq: 1 })).field).toBe("type");
  });

  it("refuses an unknown field, naming it", () => {
    expect(failure(JSON.stringify({ ...prompt, flavour: "mint" })).field).toBe("flavour");
  });

  it("refuses an unknown field deep in a message, with its path", () => {
    const deep = structuredClone(sync);
    deep.snapshot.round.extra = 1;
    expect(failure(JSON.stringify(deep)).field).toBe("snapshot.round.extra");
  });

  it("refuses a missing field, naming it", () => {
    const { legal: _legal, ...without } = prompt;
    expect(failure(JSON.stringify(without)).field).toBe("legal");
  });

  it("refuses a missing field deep in a message, with its path", () => {
    const deep = structuredClone(sync);
    delete deep.snapshot.seats[1].total;
    expect(failure(JSON.stringify(deep)).field).toBe("snapshot.seats[1].total");
  });

  it("refuses a value of the wrong kind, naming the field", () => {
    expect(failure(JSON.stringify({ ...prompt, id: "7" })).field).toBe("id");
    expect(failure(JSON.stringify({ ...prompt, legal: [0.5] })).field).toBe("legal[0]");
  });

  it("refuses a card that is not one", () => {
    const deep = structuredClone(sync);
    deep.prompt.hand = ["ZZ"];
    expect(failure(JSON.stringify(deep)).field).toBe("prompt.hand[0]");
  });
});

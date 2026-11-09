import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSolo, soloRequestFrom, soloSettings } from "../../src/dev/solo";
import { decodeSyncBody } from "../../src/net/decode";

const LOOK = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/look");

describe("a solo game from the address", () => {
  it("asks for none without ?solo", () => {
    expect(soloRequestFrom("")).toBeNull();
    expect(soloRequestFrom("?seed=4")).toBeNull();
  });

  it("reads the players and the seed", () => {
    expect(soloRequestFrom("?solo=4")).toEqual({ players: 4 });
    expect(soloRequestFrom("?solo=4&seed=42")).toEqual({ players: 4, seed: 42 });
  });

  it("refuses a table the page has no seats for, and what is not a number", () => {
    expect(soloRequestFrom("?solo=1")).toBeNull();
    expect(soloRequestFrom("?solo=7")).toBeNull();
    expect(soloRequestFrom("?solo=four")).toBeNull();
    expect(soloRequestFrom("?solo=4&seed=x")).toEqual({ players: 4 });
  });

  it("sends createSolo with the settings of the desktop's screenshot tool", () => {
    expect(createSolo({ players: 3, seed: 42 })).toEqual({
      type: "createSolo",
      settings: soloSettings({ players: 3, seed: 42 }),
    });
  });

  for (const players of [3, 4, 5, 6]) {
    it(`seats ${players} players as table-${players}-players.json's settings do`, () => {
      const { state } = JSON.parse(readFileSync(join(LOOK, `table-${players}-players.json`), "utf8"));
      const fixture = decodeSyncBody(state).table?.settings;
      expect(soloSettings({ players, seed: 42 })).toEqual(fixture);
    });
  }

  it("leaves the deal to the server without a seed", () => {
    expect(soloSettings({ players: 2 })).not.toHaveProperty("seed");
    expect(soloSettings({ players: 2 }).seats).toHaveLength(2);
  });
});

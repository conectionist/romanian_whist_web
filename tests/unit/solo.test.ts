import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SPEED, createSolo, soloRequestFrom, soloSettings } from "../../src/dev/solo";
import { setLanguage } from "../../src/i18n/language";
import { decodeSyncBody } from "../../src/net/decode";

const LOOK = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/look");

afterEach(() => setLanguage("en"));

describe("a solo game from the address", () => {
  it("asks for none without ?solo", () => {
    expect(soloRequestFrom("")).toBeNull();
    expect(soloRequestFrom("?seed=4")).toBeNull();
  });

  it("reads the players and the seed", () => {
    expect(soloRequestFrom("?solo=4")).toEqual({ players: 4 });
    expect(soloRequestFrom("?solo=4&seed=42")).toEqual({ players: 4, seed: 42 });
    expect(soloRequestFrom("?solo=3&speed=4")).toEqual({ players: 3, speed: 4 });
    expect(soloRequestFrom("?solo=3&seed=7&speed=0")).toEqual({ players: 3, seed: 7, speed: 0 });
  });

  it("names the person Player, or Jucător in a Romanian page, and the computer players the same", () => {
    expect(soloSettings({ players: 3 }).seats.map((seat) => (seat.kind === "open" ? "" : seat.name))).toEqual(["Player", "Ana", "Bogdan"]);
    setLanguage("ro");
    expect(soloSettings({ players: 3 }).seats.map((seat) => (seat.kind === "open" ? "" : seat.name))).toEqual(["Jucător", "Ana", "Bogdan"]);
  });

  it("reads &forehead=all, and nothing else for it", () => {
    expect(soloRequestFrom("?solo=4&forehead=all")).toEqual({ players: 4, foreheadAll: true });
    expect(soloRequestFrom("?solo=4&forehead=some")).toEqual({ players: 4 });
    expect(soloSettings({ players: 4, foreheadAll: true }).allOneCardForehead).toBe(true);
    expect(soloSettings({ players: 4 }).allOneCardForehead).toBe(false);
  });

  it("reads &wait=1, which makes the round sheet wait for you, and nothing else for it", () => {
    expect(soloRequestFrom("?solo=4&wait=1")).toEqual({ players: 4, wait: true });
    expect(soloRequestFrom("?solo=4&wait=0")).toEqual({ players: 4 });
    expect(soloSettings({ players: 4, wait: true }).waitAfterRound).toBe(true);
    expect(soloSettings({ players: 4 }).waitAfterRound).toBe(false);
  });

  it("ignores a speed that is not one of the five", () => {
    expect(soloRequestFrom("?solo=4&speed=5")).toEqual({ players: 4 });
    expect(soloRequestFrom("?solo=4&speed=fast")).toEqual({ players: 4 });
  });

  it("refuses a table the page has no seats for, and what is not a number", () => {
    expect(soloRequestFrom("?solo=1")).toBeNull();
    expect(soloRequestFrom("?solo=7")).toBeNull();
    expect(soloRequestFrom("?solo=four")).toBeNull();
    expect(soloRequestFrom("?solo=4&seed=x")).toEqual({ players: 4 });
  });

  it("plays at the desktop's default speed unless the address says otherwise", () => {
    expect(DEFAULT_SPEED).toBe(2);
    expect(soloSettings({ players: 4 }).botSpeed).toBe(2);
    expect(soloSettings({ players: 4, speed: 4 }).botSpeed).toBe(4);
    expect(soloSettings({ players: 4, speed: 0 }).botSpeed).toBe(0);
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
      expect(soloSettings({ players, seed: 42, speed: 4 })).toEqual(fixture);
    });
  }

  it("leaves the deal to the server without a seed", () => {
    expect(soloSettings({ players: 2 })).not.toHaveProperty("seed");
    expect(soloSettings({ players: 2 }).seats).toHaveLength(2);
  });
});

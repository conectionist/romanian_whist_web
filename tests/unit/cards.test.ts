import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeSyncBody } from "../../src/net/decode";
import {
  cardLabel,
  inDisplayOrder,
  layOutHand,
  sizeForHeight,
  sortForDisplay,
  suitPosition,
} from "../../src/table/cards";
import { handCardHeight, playedCardHeight } from "../../src/table/space";

const LOOK = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/look");

function look(name: string) {
  const { state } = JSON.parse(readFileSync(join(LOOK, `${name}.json`), "utf8"));
  return decodeSyncBody(state);
}

describe("card sizes", () => {
  it("draws a hand card 155 by 225", () => {
    expect(sizeForHeight(handCardHeight)).toEqual({ w: 155, h: 225 });
  });

  it("draws a played card 141 by 205 up to four players, and 125 by 181 from five", () => {
    expect(sizeForHeight(playedCardHeight(4))).toEqual({ w: 141, h: 205 });
    expect(sizeForHeight(playedCardHeight(5))).toEqual({ w: 125, h: 181 });
  });

  it("has no size for no height", () => {
    expect(sizeForHeight(0)).toEqual({ w: 0, h: 0 });
  });
});

describe("the display order", () => {
  it("puts the trump suit first, then spades, hearts, clubs, diamonds", () => {
    expect(suitPosition("C", "7C")).toBe(0);
    expect(suitPosition("S", "7C")).toBe(1);
    expect(suitPosition("H", null)).toBe(2);
    expect(suitPosition("C", null)).toBe(3);
    expect(suitPosition("D", null)).toBe(4);
  });

  it("puts high before low inside a suit", () => {
    expect(inDisplayOrder("AS", "TS", null)).toBe(true);
    expect(inDisplayOrder("TS", "9S", null)).toBe(true);
    expect(inDisplayOrder("3S", "4S", null)).toBe(false);
  });

  it("sorts a hand", () => {
    expect(sortForDisplay(["KC", "QD", "7C", "8H"], "9S")).toEqual(["8H", "KC", "7C", "QD"]);
    expect(sortForDisplay(["KC", "QD", "7C", "8H"], "QD")).toEqual(["QD", "8H", "KC", "7C"]);
  });

  it("lays out table 4's hand as the desktop does: 8H KC 7C QD, with KC and 7C legal", () => {
    const sync = look("table-4-players");
    const prompt = sync.prompt;
    if (prompt === null || prompt.kind !== "play" || prompt.hand === undefined) {
      throw new Error("no play prompt");
    }
    const legal = prompt.legal.map((index) => (prompt.hand as string[])[index]);
    const layout = layOutHand(prompt.hand, legal, sync.snapshot?.round.trump ?? null);
    expect(layout.entries.map((entry) => entry.card)).toEqual(["8H", "KC", "7C", "QD"]);
    expect(layout.entries.map((entry) => entry.legal)).toEqual([false, true, true, false]);
    // KC is index 0 and 7C index 2 of the server's hand.
    expect(layout.positions).toEqual([3, 0, 2, 1]);
  });

  it("maps every slot back to the server's index", () => {
    const hand = ["TD", "AS", "3C", "KH", "9S"];
    const layout = layOutHand(hand, [], "QH");
    layout.positions.forEach((position, slot) => {
      expect(hand[position]).toBe(layout.entries[slot].card);
    });
    expect(new Set(layout.positions).size).toBe(hand.length);
  });

  it("greys nothing out when nothing is being chosen", () => {
    expect(layOutHand(["TD", "AS"], [], null).entries.every((entry) => entry.legal)).toBe(true);
  });

  it("shows the hand-* fixtures' hands in their prompt order, which is the display order", () => {
    for (const name of ["hand-1-card", "hand-4-cards", "hand-8-cards"]) {
      const sync = look(name);
      const prompt = sync.prompt;
      if (prompt === null || prompt.hand === undefined) {
        throw new Error(`${name} has no hand`);
      }
      const layout = layOutHand(prompt.hand, [], sync.snapshot?.round.trump ?? null);
      expect(layout.entries.map((entry) => entry.card), name).toEqual(prompt.hand);
    }
  });

  it("has every look fixture's prompt hand in some order the layout can sort", () => {
    for (const file of readdirSync(LOOK).filter((name) => name.endsWith(".json"))) {
      const { state } = JSON.parse(readFileSync(join(LOOK, file), "utf8"));
      if (state?.prompt?.hand === undefined) {
        continue;
      }
      const layout = layOutHand(state.prompt.hand, [], state.snapshot.round.trump);
      expect(layout.positions.length).toBe(state.prompt.hand.length);
    }
  });
});

describe("card text", () => {
  it("spells a card as a player reads it", () => {
    expect(cardLabel("KH")).toBe("K♥");
    expect(cardLabel("TS")).toBe("10♠");
    expect(cardLabel("AD")).toBe("A♦");
    expect(cardLabel("7C")).toBe("7♣");
    expect(cardLabel("JH")).toBe("J♥");
    expect(cardLabel("QS")).toBe("Q♠");
  });
});

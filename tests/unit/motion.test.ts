import { describe, expect, it } from "vitest";
import {
  BUBBLE_MS,
  BUBBLE_STILL_MS,
  FLIGHT_CURVE,
  SWEEP_CURVE,
  animates,
  effectivePace,
  factorFor,
  flightDuration,
  paceAt,
  stopOf,
  sweepDuration,
} from "../../src/play/motion";
import { arrivalsFor, sweepWinner, type TrickMemory } from "../../src/table/trick";
import { newBids } from "../../src/table/renderer";

describe("the pace", () => {
  it("has the desktop's four stops, Off to Slow", () => {
    expect([0, 1, 2, 3].map(paceAt)).toEqual(["off", "quick", "normal", "slow"]);
    expect(stopOf("slow")).toBe(3);
  });

  it("takes a stop out of range for the nearest one", () => {
    expect(paceAt(-4)).toBe("off");
    expect(paceAt(17)).toBe("slow");
    expect(paceAt(1.9)).toBe("quick");
  });

  it("scales the lengths by 0, 0.5, 1 and 1.6", () => {
    expect(["off", "quick", "normal", "slow"].map((pace) => factorFor(pace as never))).toEqual([0, 0.5, 1, 1.6]);
  });

  it("flies a card for 360 ms at Normal and sweeps a trick for 480", () => {
    expect(flightDuration("normal")).toBe(360);
    expect(sweepDuration("normal")).toBe(480);
    expect(flightDuration("quick")).toBe(180);
    expect(sweepDuration("quick")).toBe(240);
    expect(flightDuration("slow")).toBe(576);
    expect(sweepDuration("slow")).toBe(768);
  });

  it("moves nothing at Off", () => {
    expect(flightDuration("off")).toBe(0);
    expect(sweepDuration("off")).toBe(0);
    expect(animates("off")).toBe(false);
    expect(animates("quick")).toBe(true);
  });

  it("shows a bubble for as long at every pace but Off, and a little less still", () => {
    expect(BUBBLE_MS).toBe(1600);
    expect(BUBBLE_STILL_MS).toBe(1500);
  });

  it("reads a request for reduced motion as Off", () => {
    expect(effectivePace("slow", true)).toBe("off");
    expect(effectivePace("slow", false)).toBe("slow");
  });

  it("lands a card with an ease out and clears a trick with an ease in", () => {
    expect(FLIGHT_CURVE).toBe("cubic-bezier(0.2, 0.75, 0.25, 1)");
    expect(SWEEP_CURVE).toBe("cubic-bezier(0.5, 0, 0.75, 0)");
  });
});

const trick = (cards: [number, string, boolean][], round = 8): TrickMemory => ({
  round,
  cards: cards.map(([seat, card, winning]) => ({ seat, card, winning })),
});

const frame = (cards: [number, string, boolean][], round = 8, seats = 4) => ({
  roundNumber: round,
  table: cards.map(([seat, card, winning]) => ({ seat, card, winning })),
  seats: Array.from({ length: seats }, () => ({}) as never),
});

describe("which cards fly", () => {
  const last = trick([[1, "8C", false], [2, "7S", true]]);

  it("flies the cards past the ones that were already down", () => {
    const next = frame([[1, "8C", false], [2, "7S", false], [3, "QS", true]]);
    expect(arrivalsFor(last, next, true)).toEqual({ agrees: true, first: 2 });
  });

  it("flies nothing that was there before, nor when nothing moves", () => {
    expect(arrivalsFor(last, frame([[1, "8C", false], [2, "7S", true]]), true)).toEqual({ agrees: true, first: 2 });
    expect(arrivalsFor(last, frame([[1, "8C", false], [2, "7S", false], [3, "QS", true]]), false).agrees).toBe(false);
  });

  it("places everything at once with no last frame to fly from", () => {
    expect(arrivalsFor(null, frame([[1, "8C", true]]), true).agrees).toBe(false);
  });

  it("takes a new round's table for a new table, whatever it holds", () => {
    expect(arrivalsFor(last, frame([[1, "8C", false], [2, "7S", false], [3, "QS", true]], 9), true).agrees).toBe(false);
  });

  it("does not follow a table that has shrunk, or been rewritten", () => {
    expect(arrivalsFor(last, frame([[1, "8C", true]]), true).agrees).toBe(false);
    expect(arrivalsFor(last, frame([[1, "9C", false], [2, "7S", true], [3, "QS", false]]), true).agrees).toBe(false);
  });
});

describe("where a trick is swept to", () => {
  const full = trick([[1, "8C", false], [2, "7S", false], [3, "QS", true], [0, "KC", false]]);

  it("is the winner of the full trick the last frame showed, once the felt is bare", () => {
    expect(sweepWinner(full, frame([]), true)).toBe(3);
  });

  it("is nobody while a card is still down, or a trick was not full, or nothing moves", () => {
    expect(sweepWinner(full, frame([[1, "9C", false]]), true)).toBeNull();
    expect(sweepWinner(trick([[1, "8C", true]]), frame([]), true)).toBeNull();
    expect(sweepWinner(full, frame([]), false)).toBeNull();
    expect(sweepWinner(null, frame([]), true)).toBeNull();
  });

  it("leaves a round's last trick alone: the next round is another table", () => {
    expect(sweepWinner(full, frame([], 9), true)).toBeNull();
  });
});

describe("which seats bid", () => {
  const seats = (bids: boolean[]) => bids.map((hasBet) => ({ hasBet }) as never);

  it("is the seats whose bid is in now and was not in the last frame", () => {
    expect(newBids({ roundNumber: 3, seats: seats([false, true, false]) }, { roundNumber: 3, seats: seats([false, true, true]) })).toEqual([2]);
  });

  it("is nobody when nothing changed, and nobody in a new round's first frame", () => {
    const same = { roundNumber: 3, seats: seats([true, true]) };
    expect(newBids(same, same)).toEqual([]);
    expect(newBids(same, { roundNumber: 4, seats: seats([true, false]) })).toEqual([]);
  });

  it("has nothing to compare with the first time, or at another table", () => {
    expect(newBids(null, { roundNumber: 1, seats: seats([true]) })).toBeNull();
    expect(newBids({ roundNumber: 1, seats: seats([true, true]) }, { roundNumber: 1, seats: seats([true]) })).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decode } from "../../src/net/decode";
import { modelOf, type TableModel } from "../../src/play/model";
import { Store } from "../../src/play/store";
import { cubicBezier, easeOut } from "../../src/play/bezier";
import { anchorOver, frameAt, keyframes, textFor } from "../../src/table/bidBubble";
import { fieldsFor, offers } from "../../src/table/bidStrip";

const LOOK = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/look");

function modelFor(name: string, change: (state: any) => void = () => undefined): TableModel {
  const { state } = JSON.parse(readFileSync(join(LOOK, `${name}.json`), "utf8"));
  change(state);
  const store = new Store();
  store.apply(decode(JSON.stringify({ type: "sync", seq: 0, ...state })), 0);
  const model = modelOf(store.state);
  if (model === null) {
    throw new Error(`${name} has no game`);
  }
  return model;
}

describe("the bid strip", () => {
  it("asks the question and says how the bids stand", () => {
    const fields = fieldsFor(modelFor("bidding"));
    expect(fields).toEqual({
      question: "How many tricks will you take?",
      note: "0 bid so far, totalling 0 of 1 trick.",
      highest: 1,
      forbidden: null,
    });
  });

  it("says tricks in the plural, with the bids that are in", () => {
    const fields = fieldsFor(
      modelFor("bidding", (state) => {
        state.prompt.max = 5;
        state.snapshot.bets = { placed: 3, sum: 4 };
      }),
    );
    expect(fields?.note).toBe("3 bid so far, totalling 4 of 5 tricks.");
    expect(fields?.highest).toBe(5);
  });

  it("says which bid you may not make when you bid last, as a man or as a woman", () => {
    const last = (gender: string) =>
      fieldsFor(
        modelFor("bidding", (state) => {
          state.prompt.forbidden = 1;
          state.table.seats[0].gender = gender;
        }),
      );
    expect(last("male")?.note).toBe("You bid last. 1 would make the bids add up to 1, and somebody has to be wrong.");
    expect(last("female")?.note).toBe("You bid last. 1 would make the bids add up to 1, and somebody has to be wrong.");
    expect(last("male")?.forbidden).toBe(1);
  });

  it("has nothing to say when no bid is asked for", () => {
    expect(fieldsFor(modelFor("table-4-players"))).toBeNull();
    expect(
      fieldsFor(
        modelFor("bidding", (state) => {
          state.prompt = null;
        }),
      ),
    ).toBeNull();
  });

  it("offers every bid from 0 to the most the hand allows, and not the forbidden one", () => {
    const fields = { question: "", note: "", highest: 3, forbidden: 1 };
    expect([0, 1, 2, 3, 4].map((bet) => offers(fields, bet))).toEqual([true, false, true, true, false]);
  });

  it("still refuses a forbidden bid of zero, which is a legal bid", () => {
    const fields = { question: "", note: "", highest: 2, forbidden: 0 };
    expect([0, 1, 2].map((bet) => offers(fields, bet))).toEqual([false, true, true]);
    expect(offers({ ...fields, forbidden: null }, 0)).toBe(true);
  });
});

describe("the bid bubble", () => {
  it("says Bids for others and You bid for you", () => {
    expect(textFor(false, 2)).toBe("Bids 2");
    expect(textFor(true, 0)).toBe("You bid 0");
  });

  it("rises 6 and fades in over the first 12%", () => {
    expect(frameAt(0)).toEqual({ opacity: 0, rise: 6 });
    const half = frameAt(0.06);
    expect(half.opacity).toBeGreaterThan(0.5);
    expect(half.opacity).toBeLessThan(1);
    expect(half.rise).toBeCloseTo(6 * (1 - half.opacity), 12);
    expect(frameAt(0.12)).toEqual({ opacity: 1, rise: 0 });
  });

  it("holds to 80%, then fades out", () => {
    expect(frameAt(0.5)).toEqual({ opacity: 1, rise: 0 });
    expect(frameAt(0.8)).toEqual({ opacity: 1, rise: 0 });
    expect(frameAt(0.9).opacity).toBeGreaterThan(0);
    expect(frameAt(0.9).opacity).toBeLessThan(1);
    expect(frameAt(1).opacity).toBe(0);
  });

  it("gives the Web Animations API the same stretches, each easing out", () => {
    const frames = keyframes();
    expect(frames.map((frame) => frame.offset)).toEqual([0, 0.12, 0.8, 1]);
    expect(frames.map((frame) => frame.opacity)).toEqual([0, 1, 1, 0]);
    expect(frames[0].easing).toBe("ease-out");
    expect(frames[2].easing).toBe("ease-out");
  });

  it("floats 18 above the panel's padding box, centred on it", () => {
    expect(anchorOver({ x: 100, y: 200, w: 259, h: 118 })).toEqual({ x: 229.5, y: 183 });
  });
});

describe("the cubic bezier", () => {
  it("runs from 0 to 1", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });

  it("is the identity for a straight line", () => {
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75);
    for (const progress of [0.1, 0.3, 0.5, 0.9]) {
      expect(linear(progress)).toBeCloseTo(progress, 6);
    }
  });

  it("eases out: fast at the start", () => {
    expect(easeOut(0.25)).toBeGreaterThan(0.25);
    expect(easeOut(0.5)).toBeCloseTo(0.6846, 3);
  });

  it("eases in for the sweep's curve, slow at the start", () => {
    const sweep = cubicBezier(0.5, 0, 0.75, 0);
    expect(sweep(0.25)).toBeLessThan(0.25);
  });
});

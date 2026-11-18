import { describe, expect, it } from "vitest";
import { forgetHeard } from "../../src/net/forgotten";
import { FORGET_SIGNAL, TOKEN_KEY } from "../../src/storage/keys";

const local = {} as Storage;
const other = {} as Storage;

describe("another tab forgetting the browser", () => {
  it("is the signal Forget sets", () => {
    expect(forgetHeard({ key: FORGET_SIGNAL, newValue: "1763400000000", storageArea: local }, local)).toBe(true);
  });

  it("is all of storage cleared, which the event says with no key", () => {
    expect(forgetHeard({ key: null, newValue: null, storageArea: local }, local)).toBe(true);
  });

  it("is not the signal being cleared away with the rest, which comes after it", () => {
    expect(forgetHeard({ key: FORGET_SIGNAL, newValue: null, storageArea: local }, local)).toBe(false);
  });

  it("is not a token dropped on its own, as a page does with one the server refuses, nor a new one", () => {
    expect(forgetHeard({ key: TOKEN_KEY, newValue: null, storageArea: local }, local)).toBe(false);
    expect(forgetHeard({ key: TOKEN_KEY, newValue: "LXF33D9tR1EIzH3GPvWDpw", storageArea: local }, local)).toBe(false);
    expect(forgetHeard({ key: "whist.pace", newValue: null, storageArea: local }, local)).toBe(false);
  });

  it("is not another storage's, nor anything where the page has none", () => {
    expect(forgetHeard({ key: FORGET_SIGNAL, newValue: "1", storageArea: other }, local)).toBe(false);
    expect(forgetHeard({ key: FORGET_SIGNAL, newValue: "1", storageArea: local }, null)).toBe(false);
  });
});

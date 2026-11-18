import { describe, expect, it } from "vitest";
import { tokenForgotten } from "../../src/net/forgotten";
import { TOKEN_KEY } from "../../src/storage/keys";

const local = {} as Storage;
const other = {} as Storage;

describe("another tab forgetting the browser", () => {
  it("is the token removed from local storage", () => {
    expect(tokenForgotten({ key: TOKEN_KEY, newValue: null, storageArea: local }, local)).toBe(true);
  });

  it("is all of storage cleared, which the event says with no key", () => {
    expect(tokenForgotten({ key: null, newValue: null, storageArea: local }, local)).toBe(true);
  });

  it("is not another tab's welcome that gives a new token, nor another key, nor another storage", () => {
    expect(tokenForgotten({ key: TOKEN_KEY, newValue: "LXF33D9tR1EIzH3GPvWDpw", storageArea: local }, local)).toBe(false);
    expect(tokenForgotten({ key: "whist.pace", newValue: null, storageArea: local }, local)).toBe(false);
    expect(tokenForgotten({ key: TOKEN_KEY, newValue: null, storageArea: other }, local)).toBe(false);
  });

  it("is nothing where the page has no storage", () => {
    expect(tokenForgotten({ key: TOKEN_KEY, newValue: null, storageArea: local }, null)).toBe(false);
  });
});

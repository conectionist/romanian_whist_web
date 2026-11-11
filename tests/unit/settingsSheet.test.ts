import { describe, expect, it } from "vitest";
import { PACES, paceAt, stopOf } from "../../src/play/motion";
import { DEFAULT_BOT_SPEED, FASTEST_SPEED, SPEED_STOPS, speedAt } from "../../src/sheets/settingsSheet";
import { configOf } from "../../src/sheets/rulesSheet";
import { storeFor } from "./support/sheetState";

describe("the settings' sliders", () => {
  it("have five stops for the bots, Slow to Instant, with the default in the middle", () => {
    expect([SPEED_STOPS, FASTEST_SPEED, DEFAULT_BOT_SPEED]).toEqual([5, 4, 2]);
  });

  it("take a speed out of range, or not whole, for a stop the table accepts", () => {
    expect([-3, 0, 2, 4, 9, 1.9].map(speedAt)).toEqual([0, 0, 2, 4, 4, 1]);
  });

  it("have four stops for the cards, Off to Slow, as the pace has them", () => {
    expect(PACES).toHaveLength(4);
    expect([0, 1, 2, 3].map(paceAt)).toEqual(["off", "quick", "normal", "slow"]);
    expect(PACES.map(stopOf)).toEqual([0, 1, 2, 3]);
  });

  it("open on the table's own speed and wait, as the screenshot tool's picture has them", () => {
    const { settings } = storeFor("sheet-settings").state.table!;
    expect(settings.botSpeed).toBe(DEFAULT_BOT_SPEED);
    expect(settings.waitAfterRound).toBe(true);
    expect(configOf(settings).seats).toBe(6);
  });
});

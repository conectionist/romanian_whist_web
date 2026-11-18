import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decode } from "../../src/net/decode";
import { modelOf, type TableModel } from "../../src/play/model";
import { Store } from "../../src/play/store";
import { shortNoteFor, stripFlowFor } from "../../src/table/bidStrip";
import { CHIP_HEIGHT, CHIP_WIDTH, CORNER_INSET, PLATE_GAP, layoutScaled, stripArea, toTable } from "../../src/table/geometry/scaled";
import { place } from "../../src/table/geometry/seats";
import { desktopArrangement, scaledArrangement } from "../../src/table/geometry/spots";
import { cardPlacement, leadMarkPlacement } from "../../src/table/geometry/trick";
import { sameLayout } from "../../src/table/renderer";
import { promptLineFor } from "../../src/table/scaledChrome";
import { shortPillFor } from "../../src/table/seatPanel";
import { centre, playedCardHeight } from "../../src/table/space";
import { sameWindowLayout } from "../../src/table/layoutWatch";
import { layoutChoiceFor } from "../../src/table/layoutChoice";
import { woodTransform } from "../../src/table/view";

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

const window = (w: number, h: number) => ({ w, h, top: 0, bottom: 0 });

describe("the bid strip in the band", () => {
  it("keeps the label beside the bids while they fit, and moves it to the note when they do not", () => {
    // 600 wide: 600 - 24 - 108 = 468 holds eight bids of 56 less the last gap.
    expect(stripFlowFor(8, 600)).toEqual({ inline: true, columns: 8 });
    expect(stripFlowFor(9, 600)).toEqual({ inline: false, columns: 9 });
    expect(stripFlowFor(2, 300)).toEqual({ inline: true, columns: 2 });
  });

  it("splits bids that need two rows evenly", () => {
    // 440 wide, no label: 440 - 24 + 8 = 424 holds seven; nine bids make two rows of five.
    expect(stripFlowFor(9, 440)).toEqual({ inline: false, columns: 5 });
    expect(stripFlowFor(8, 440)).toEqual({ inline: false, columns: 4 });
    // Never less than one to a row.
    expect(stripFlowFor(3, 20).columns).toBe(1);
  });

  it("gives the short reason a bid is refused, or how the bids stand", () => {
    expect(shortNoteFor(modelFor("bidding", (state) => (state.prompt.forbidden = 1)))).toBe("Not 1: the bids would add up to 1.");
    expect(shortNoteFor(modelFor("bidding"))).toBe("Bids so far: 0 of 1 trick");
    expect(shortNoteFor(modelFor("table-4-players"))).toBeNull();
  });

  it("keeps clear of the round chip where the two meet, and leaves the band alone where they do not", () => {
    const layout = layoutScaled(window(780, 360), 4);
    const area = stripArea(layout, 780);
    expect(area.top).toBeGreaterThanOrEqual(CORNER_INSET + CHIP_HEIGHT + PLATE_GAP);
    expect(area.mid).toBeCloseTo((area.top + area.bottom) / 2, 9);
    expect(area.bottom).toBe(layout.band.bottom);
    // A window so wide that the strip stops short of the chip.
    const wide = layoutScaled(window(1500, 360), 4);
    expect(wide.bid.x + wide.bid.w).toBeLessThan(1500 - CORNER_INSET - CHIP_WIDTH);
    expect(stripArea(wide, 1500).top).toBe(wide.band.top);
  });
});

describe("a flat plate's pill", () => {
  const seat = (changes: object) => ({ ...modelFor("table-4-players").seats[1], ...changes });

  it("says the taken and the bid with no words", () => {
    expect(shortPillFor(seat({ hasBet: true, tricksWon: 1, bet: 2 }), false, false)).toBe("1/2");
    expect(shortPillFor(seat({ hasBet: true, tricksWon: 0, bet: 0 }), true, true)).toBe("0/0");
  });

  it("says no bid, or that the bid is being made, in a few letters", () => {
    expect(shortPillFor(seat({ hasBet: false }), false, true)).toBe("No bid");
    expect(shortPillFor(seat({ hasBet: false }), true, true)).toBe("Bidding…");
    expect(shortPillFor(seat({ hasBet: false }), true, false)).toBe("No bid");
  });
});

describe("the line above your hand", () => {
  it("says what to do on your turn to play, and nothing while a bid is asked for or between turns", () => {
    const play = modelFor("table-3-players");
    expect(promptLineFor(play)?.map((run) => run.text).join("")).toMatch(/^Your turn/);
    expect(promptLineFor(modelFor("bidding"))).toBeNull();
    expect(promptLineFor({ ...play, activeSeat: 1 })).toBeNull();
    expect(promptLineFor({ ...play, humanSeat: -1 })).toBeNull();
  });
});

describe("telling the layouts apart", () => {
  it("compares layouts by their kind, and for the scaled one by its window and scale", () => {
    expect(sameLayout({ kind: "desktop" }, { kind: "desktop" })).toBe(true);
    expect(sameLayout({ kind: "desktop" }, { kind: "scaled", size: { w: 832, h: 384 }, scale: 1.06 })).toBe(false);
    const scaled = { kind: "scaled", size: { w: 832, h: 384 }, scale: 1.06 } as const;
    expect(sameLayout(scaled, { ...scaled })).toBe(true);
    expect(sameLayout(scaled, { ...scaled, size: { w: 900, h: 384 } })).toBe(false);
    expect(sameLayout(scaled, { ...scaled, scale: 1.1 })).toBe(false);
  });

  it("draws the scaled table again for a window of another size at the same scale, and not the desktop's", () => {
    const at = (w: number, h: number, coarse = true) => ({ choice: layoutChoiceFor({ w, h }, coarse), size: { w, h } });
    expect(sameWindowLayout(at(832, 384), at(832, 384))).toBe(true);
    expect(sameWindowLayout(at(832, 384), at(900, 384))).toBe(false);
    expect(sameWindowLayout(at(1280, 800), at(1400, 900))).toBe(true);
    expect(sameWindowLayout(at(1280, 800), at(832, 384))).toBe(false);
    expect(sameWindowLayout(null, at(832, 384))).toBe(false);
    expect(sameWindowLayout(at(832, 384), at(832, 384, false))).toBe(false);
  });

  it("writes the transform that puts the table's centre at the wood's and scales its units to the wood", () => {
    const text = woodTransform({ cx: 400, cy: 180, R: 153 });
    expect(text).toBe(`translate(${400 - 768 * 0.3}px, ${180 - 512 * 0.3}px) scale(0.3)`);
  });
});

describe("what each layout draws a seat from", () => {
  it("gives the desktop's table the places it always had", () => {
    for (let count = 2; count <= 6; count++) {
      for (const human of [0, count - 1]) {
        const arrangement = desktopArrangement(count, human);
        expect(arrangement.playedHeight).toBe(playedCardHeight(count));
        arrangement.spots.forEach((spot, seat) => {
          const own = place(count, human, seat)!;
          expect(spot?.panel).toEqual(own.panel);
          expect(spot?.look).toBe("plaque");
          expect(spot?.played).toEqual(cardPlacement(count, own));
          expect(spot?.leadMark).toEqual(leadMarkPlacement(count, own));
          expect(spot?.rack === null).toBe(own.human);
          expect(spot?.centre).toEqual({ x: own.panel.x + own.panel.w / 2, y: own.panel.y + own.panel.h / 2 });
        });
      }
    }
  });

  it("seats the player at the bottom whichever seat they hold, and the others clockwise from them", () => {
    const layout = layoutScaled(window(780, 360), 4);
    const turned = scaledArrangement(layout, 4, 2);
    expect(turned.spots[2]?.look).toBe("mine");
    expect(turned.spots[2]?.human).toBe(true);
    expect(turned.spots[2]?.rack).toBeNull();
    expect(turned.spots[3]?.panel).toMatchObject({ x: layout.seats[1].x, y: layout.seats[1].y });
    expect(turned.spots[0]?.panel).toMatchObject({ x: layout.seats[2].x, y: layout.seats[2].y });
    expect(turned.spots[1]?.panel).toMatchObject({ x: layout.seats[3].x, y: layout.seats[3].y });
    for (const seat of [0, 1, 3]) {
      expect(turned.spots[seat]?.look).toBe("plate");
      expect(turned.spots[seat]?.rack?.radius).toBe(layout.rackR);
    }
  });

  it("puts a watcher's first seat at the bottom, drawn as yours is but not yours", () => {
    const layout = layoutScaled(window(780, 360), 3);
    const watched = scaledArrangement(layout, 3, -1);
    expect(watched.spots[0]).toMatchObject({ look: "mine", human: false });
    expect(watched.spots[0]?.rack?.angle).toBeCloseTo(Math.PI / 2, 12);
  });

  it("lays the played cards on the lines the seats are on, and sizes them by the layout's boost", () => {
    const layout = layoutScaled(window(780, 360), 5);
    const arrangement = scaledArrangement(layout, 5, 0);
    expect(arrangement.playedHeight).toBeCloseTo(181.2 * layout.boost, 9);
    // Yours is straight down from the centre and unturned.
    expect(arrangement.spots[0]?.played.x).toBeCloseTo(centre.x, 9);
    expect(arrangement.spots[0]?.played.rotation).toBe(0);
    expect(arrangement.spots[0]?.played.y).toBeGreaterThan(centre.y);
    // A seat's card is in its direction from the centre, and its plate's centre is where a flight from it starts.
    arrangement.spots.forEach((spot, seat) => {
      const angle = layout.angles[seat];
      const card = spot!.played;
      expect(Math.atan2(card.y - centre.y, card.x - centre.x)).toBeCloseTo(Math.atan2(Math.sin(angle), Math.cos(angle)), 9);
      const plate = layout.seats[seat];
      const middle = toTable(layout, { x: plate.x + plate.w / 2, y: plate.y + plate.h / 2 });
      expect(spot!.centre.x).toBeCloseTo(middle.x, 9);
      expect(spot!.centre.y).toBeCloseTo(middle.y, 9);
    });
  });
});

import type { Card } from "../net/protocol";
import type { Change } from "../play/store";
import type { TableModel } from "../play/model";
import { animates, type Pace } from "../play/motion";
import { t } from "../i18n/t";
import { BidBubble, textFor } from "./bidBubble";
import { BidStrip, shortNoteFor } from "./bidStrip";
import { CornerButtons } from "./buttons";
import { layoutScaled, stripArea, type ScaledLayout } from "./geometry/scaled";
import { humanSeated } from "./geometry/seats";
import { desktopArrangement, scaledArrangement, scaledFan, type Arrangement } from "./geometry/spots";
import { leadSeat } from "./geometry/trick";
import { HandView } from "./hand";
import { LeadMark } from "./leadMark";
import { RackView, shownFor } from "./rack";
import { ScaledChrome } from "./scaledChrome";
import { Scoreboard } from "./scoreboard";
import { SeatPanel, countdownFor } from "./seatPanel";
import { TableTop } from "./tableTop";
import { TrickView } from "./trick";
import { TrickPanel } from "./trickPanel";
import type { TableView, ViewLayout } from "./view";

export interface SceneOptions {
  // How much the table moves now: the viewer's setting.
  pace(): Pace;
  // Whether the table is an online one, which the scaled table's corner button says.
  online?(): boolean;
}

// Whether two layouts draw the same table: the same kind, and for the scaled one the same window and scale.
export function sameLayout(a: ViewLayout, b: ViewLayout): boolean {
  if (a.kind === "desktop" || b.kind === "desktop") {
    return a.kind === b.kind;
  }
  return a.scale === b.scale && a.size.w === b.size.w && a.size.h === b.size.h;
}

// Which seats bid in this frame and not the last: the bubbles' business. The last frame must be of
// the same round, at the same table, to compare with; a new round's first frame has no bids in yet.
export function newBids(
  last: Pick<TableModel, "roundNumber" | "seats"> | null,
  next: Pick<TableModel, "roundNumber" | "seats">,
): number[] | null {
  if (last === null || last.seats.length !== next.seats.length) {
    return null;
  }
  if (next.roundNumber !== last.roundNumber) {
    return [];
  }
  return next.seats.flatMap((seat, index) => (!last.seats[index].hasBet && seat.hasBet ? [index] : []));
}

// The table's scene: it owns every element, creates each once and updates it in place from the
// model, keyed by seat and by card (TableScene.cpp's relayout()). When the seat count falls,
// elements are hidden, never deleted.
export class TableScene {
  readonly top = new TableTop();
  readonly hand = new HandView();
  readonly bidStrip = new BidStrip();
  private readonly panels: SeatPanel[] = [];
  private readonly racks: RackView[] = [];
  private readonly bubbles: BidBubble[] = [];
  private readonly trick = new TrickView();
  private readonly leadMark = new LeadMark();
  private readonly scoreboard = new Scoreboard();
  private readonly trickPanel = new TrickPanel();
  private readonly buttons = new CornerButtons();
  private readonly chrome: ScaledChrome;
  private readonly handlers: Record<"history" | "lastTrick" | "menu" | "scores", () => void> = {
    history: () => undefined,
    lastTrick: () => undefined,
    menu: () => undefined,
    scores: () => undefined,
  };
  private layout: ViewLayout = { kind: "desktop" };
  private scaledLayouts = new Map<number, ScaledLayout>();
  private last: TableModel | null = null;
  private arrangement: Arrangement | null = null;

  constructor(
    readonly view: TableView,
    private readonly options: SceneOptions = { pace: () => "off" },
  ) {
    view.space.append(this.top.element, this.trick.element, this.leadMark.element, this.hand.element);
    view.hud.append(this.trickPanel.element, this.scoreboard.element, this.buttons.element);
    view.top.append(this.bidStrip.element);
    this.buttons.onHistory(() => this.handlers.history());
    this.buttons.onLastTrick(() => this.handlers.lastTrick());
    this.chrome = new ScaledChrome({
      menu: () => this.handlers.menu(),
      history: () => this.handlers.history(),
      lastTrick: () => this.handlers.lastTrick(),
      scores: () => this.handlers.scores(),
    });
    view.stage.append(...this.chrome.elements);
  }

  // Draws the table in this layout. Whatever is in the air lands first, and a bid said out loud is let go:
  // both were placed for the layout that is going. The next relayout draws the whole table again.
  setLayout(layout: ViewLayout): void {
    if (sameLayout(layout, this.layout)) {
      return;
    }
    this.trick.finishAll();
    for (const bubble of this.bubbles) {
      bubble.dismiss();
    }
    const kind = this.layout.kind;
    this.layout = layout;
    this.scaledLayouts.clear();
    this.view.setLayout(layout);
    if (layout.kind !== kind) {
      this.mount();
    }
  }

  // Puts each element in the layer its layout draws it in. The desktop's are all in the table's space, in the
  // order they were made; the scaled table's panels, hand and bid strip are in the stage, which is the
  // window's own units.
  private mount(): void {
    const { space, stage, top } = this.view;
    if (this.layout.kind === "desktop") {
      this.trick.element.style.transform = "";
      this.top.setLogoScale(1);
      space.append(this.top.element, this.trick.element, this.leadMark.element, this.hand.element);
      this.racks.forEach((rack, seat) => space.append(rack.element, this.panels[seat].element, this.bubbles[seat].element));
      top.append(this.bidStrip.element);
      this.hand.setFan(null);
      this.bidStrip.place(null);
      return;
    }
    this.trick.element.append(this.leadMark.element);
    stage.append(this.trick.element, this.hand.element, ...this.panels.map((panel) => panel.element), ...this.bubbles.map((bubble) => bubble.element), this.bidStrip.element);
    stage.append(...this.chrome.elements);
  }

  // The scaled table's layout for this many seats, in the window's own units.
  private scaledFor(seatCount: number): ScaledLayout | null {
    if (this.layout.kind !== "scaled") {
      return null;
    }
    let layout = this.scaledLayouts.get(seatCount);
    if (layout === undefined) {
      const { size, scale } = this.layout;
      layout = layoutScaled({ w: size.w / scale, h: size.h / scale, top: 0, bottom: 0 }, seatCount);
      this.scaledLayouts.set(seatCount, layout);
    }
    return layout;
  }

  // The scaled table's wood where the layout has it, with the logo and the played cards drawn to suit.
  private placeScaled(layout: ScaledLayout): void {
    const into = this.view.placeWood(layout.table);
    this.trick.element.style.transform = into;
    this.top.setLogoScale(layout.logoK);
    this.view.stage.style.setProperty("--lift-legal", `${layout.hand.liftLegal}px`);
    this.view.stage.style.setProperty("--lift-sel", `${layout.hand.liftSel}px`);
  }

  // Draws the ring on your name panel for the last seconds of the prompt that is open, and takes it
  // away when there is none. Asked as time passes, since nothing else about the table moves.
  updateCountdown(now: number): void {
    const model = this.last;
    this.panels.forEach((panel, seat) => {
      const mine = model !== null && seat === model.humanSeat;
      panel.countdown(mine ? countdownFor(model.prompt?.deadlineAt ?? null, now) : null);
    });
  }

  // Told when a corner button is clicked.
  onHistory(handler: () => void): void {
    this.handlers.history = handler;
  }

  onLastTrick(handler: () => void): void {
    this.handlers.lastTrick = handler;
  }

  // Told when the scaled table's menu or pause button, or its round chip or side panels, are tapped.
  onMenu(handler: () => void): void {
    this.handlers.menu = handler;
  }

  onScores(handler: () => void): void {
    this.handlers.scores = handler;
  }

  private ensureSeats(count: number): void {
    // The scaled table keeps the racks in the table's space and the panels and bubbles in the stage.
    const into = this.layout.kind === "scaled" ? this.view.stage : this.view.space;
    while (this.panels.length < count) {
      const rack = new RackView();
      this.view.space.append(rack.element);
      this.racks.push(rack);
      const panel = new SeatPanel();
      into.append(panel.element);
      this.panels.push(panel);
      const bubble = new BidBubble();
      into.append(bubble.element);
      this.bubbles.push(bubble);
    }
    for (let seat = count; seat < this.panels.length; seat++) {
      this.panels[seat].hide();
      this.racks[seat].hide();
      this.bubbles[seat].dismiss();
    }
  }

  private motion(model: TableModel, animate: boolean, fresh: boolean) {
    return {
      animate,
      pace: this.options.pace(),
      fresh,
      fromHand: (card: Card) => (model.humanSeat >= 0 ? this.hand.restingPlacement(card) : null),
      handHeight: () => this.hand.handHeight(),
    };
  }

  // Draws the model at once and resolves when the motion it started has ended. No model draws the
  // table alone, with no seats and no corner panels.
  async relayout(model: TableModel | null, change: Change, animate: boolean): Promise<void> {
    const scaledTable = this.scaledFor(model === null ? 4 : model.seats.length);
    this.view.hud.hidden = model === null || scaledTable !== null;
    if (scaledTable !== null) {
      this.placeScaled(scaledTable);
    }
    if (model === null) {
      this.ensureSeats(0);
      this.trick.clear();
      this.leadMark.set(null);
      this.hand.element.hidden = true;
      this.bidStrip.update(null);
      this.chrome.hide();
      this.last = null;
      this.arrangement = null;
      return;
    }

    const seatCount = model.seats.length;
    this.ensureSeats(seatCount);
    const arrangement = scaledTable === null ? desktopArrangement(seatCount, model.humanSeat) : scaledArrangement(scaledTable, seatCount, model.humanSeat);
    this.arrangement = arrangement;

    // A new game starts with nothing of the last one on the table.
    if (change.event?.kind === "gameStarted") {
      this.trick.clear();
      this.last = null;
    }
    const last = change.fresh ? null : this.last;

    // Whether anyone has still to bid, which is all the pills need to know of the phase.
    const biddingOpen = model.betsPlaced < seatCount;

    model.seats.forEach((seat, index) => {
      const spot = arrangement.spots[index];
      // A player count the layout has no row for: the seat is not drawn rather than drawn
      // somewhere invented.
      if (spot === null) {
        this.panels[index].hide();
        this.racks[index].hide();
        return;
      }
      this.panels[index].update(seat, spot.panel, {
        // activeSeat is -1 between turns: no ring anywhere is what the table shows then.
        active: model.activeSeat === index,
        biddingOpen,
        human: index === model.humanSeat,
        look: spot.look,
      });

      // Every rack but yours: your hand is the fan at the bottom. A watcher's seat 0 has one on the
      // rim, in line with its panel.
      if (spot.rack === null) {
        this.racks[index].hide();
      } else {
        this.racks[index].update(shownFor(seat), spot.rack);
      }
    });

    // The trick, each card in front of its owner's rack, before the fan is drawn again: a card of
    // yours that is new on the felt flies from where it stood in the fan, which still holds it.
    const motion = this.motion(model, animate, change.fresh);
    const flights = this.trick.update(model, arrangement, motion);

    const lead = leadSeat(model.phase, seatCount, model.table, model.leadSeat);
    const leadSpot = lead === null ? null : (arrangement.spots[lead] ?? null);
    this.leadMark.set(leadSpot === null ? null : leadSpot.leadMark);

    // Nobody seated, no hand: a watcher's table has none at the bottom.
    this.hand.setFan(scaledTable === null ? null : scaledFan(scaledTable));
    this.hand.update(model.hand, humanSeated(seatCount, model.humanSeat));

    // The corner panels, shown from the first game state on.
    this.scoreboard.update(model);
    this.trickPanel.update(model);

    // And the strip, while you are asked for a bid.
    this.bidStrip.update(model);
    this.fitChrome(model, scaledTable);

    // Bids said out loud, never waited for.
    this.announceBids(last, model, arrangement, animate && animates(this.options.pace()));
    this.last = model;

    await flights;
  }

  // The scaled table's controls and bid strip, placed for the table as it stands. The strip drops its note
  // when it and the note are taller than the band; the line above your hand gives the short reason then.
  private fitChrome(model: TableModel, layout: ScaledLayout | null): void {
    if (layout === null) {
      this.chrome.hide();
      return;
    }
    const area = stripArea(layout, this.layout.kind === "scaled" ? this.layout.size.w / this.layout.scale : 0);
    this.bidStrip.place({ x: area.x, y: area.mid, w: area.w });
    this.bidStrip.showNote(true);
    const reason = shortNoteFor(model);
    let short: string | null = null;
    if (reason !== null && this.bidStrip.crowded(area.bottom - area.top)) {
      this.bidStrip.showNote(false);
      short = this.bidStrip.leadsNote ? `${t("bidstrip", "Your bid")}. ${reason}` : reason;
    }
    this.chrome.update(model, layout, { online: this.options.online?.() ?? false, short });
  }

  // The bubbles over the seats that bid in this frame.
  private announceBids(last: TableModel | null, next: TableModel, arrangement: Arrangement, animate: boolean): void {
    const bids = newBids(last, next);
    if (bids === null) {
      for (const bubble of this.bubbles) {
        bubble.dismiss();
      }
      return;
    }
    for (const index of bids) {
      const spot = arrangement.spots[index];
      if (spot === null || spot === undefined) {
        continue;
      }
      // On the scaled table the pill stays inside the window, over the plate if the plate is at the top.
      this.bubbles[index].say(textFor(index === next.humanSeat, next.seats[index].bet), spot.panel, animate, this.layout.kind === "scaled" ? 2 : undefined);
    }
  }

  // Your card goes to the felt the moment you click, and leaves the fan. The server's word that it
  // was played confirms it without flying it again; an error calls it back.
  playOwn(card: Card, animate: boolean): Promise<unknown> {
    const model = this.last;
    if (model === null || this.arrangement === null) {
      return Promise.resolve();
    }
    const flight = this.trick.flyOwn(card, model, this.arrangement, this.motion(model, animate, false));
    this.hand.hideCard(card);
    return flight;
  }

  // A card of yours that went early and was not taken: the next relayout puts it back in the fan.
  recallOwn(card: Card): void {
    this.trick.recall(card);
  }

  // Everything in the air lands where it was going.
  finishMotion(): void {
    this.trick.finishAll();
  }

  // The table's own measurements again, once its faces have loaded.
  refit(): void {
    this.top.fit();
    this.scoreboard.measureSizers();
    this.view.refit();
    // The scaled table's strip, line and pills fit what their faces measure.
    if (this.last !== null) {
      for (const panel of this.panels) {
        panel.fit();
      }
      this.fitChrome(this.last, this.scaledFor(this.last.seats.length));
    }
  }
}

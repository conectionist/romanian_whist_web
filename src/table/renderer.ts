import type { Card } from "../net/protocol";
import { NO_CHANGE, type Change } from "../play/store";
import type { TableModel } from "../play/model";
import { animates, type Pace } from "../play/motion";
import { BidBubble, textFor } from "./bidBubble";
import { BidStrip } from "./bidStrip";
import { CornerButtons } from "./buttons";
import { grownPlaces, type Room } from "./geometry/grown";
import { type Place, humanSeated, places as placesOf } from "./geometry/seats";
import { leadMarkPlacement, leadSeat } from "./geometry/trick";
import { HandView } from "./hand";
import { LeadMark } from "./leadMark";
import { RackView, shownFor } from "./rack";
import { Scoreboard, tallestScoreboard } from "./scoreboard";
import { SeatPanel, countdownFor } from "./seatPanel";
import { TableTop } from "./tableTop";
import { TrickView } from "./trick";
import { TrickPanel, tallestTrickPanel } from "./trickPanel";
import { touched } from "./pointer";
import { seatPanelMinimumScale, type Rect } from "./space";
import type { TableView } from "./view";

export interface SceneOptions {
  // How much the table moves now: the viewer's setting.
  pace(): Pace;
  // Whether the table is touched with a finger, which has the other players' panels drawn larger.
  coarse?(): boolean;
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
  private last: TableModel | null = null;
  private where: (Place | null)[] = [];
  private grown: { key: string; places: (Place | null)[] } | null = null;

  constructor(
    readonly view: TableView,
    private readonly options: SceneOptions = { pace: () => "off" },
  ) {
    view.space.append(this.top.element, this.trick.element, this.leadMark.element, this.hand.element);
    view.hud.append(this.trickPanel.element, this.scoreboard.element, this.buttons.element);
    view.top.append(this.bidStrip.element);
    view.onFit(() => this.fitSeats());
  }

  // Where the seats stand: the table's own, or on a touch screen with the other players' panels no smaller
  // than the minimum and clear of what is round them. That is worked out once for a window, a seat count and
  // where you sit, against the corner panels at their tallest, so that no panel moves in a game.
  private placesFor(seatCount: number, humanSeat: number): (Place | null)[] {
    const wanted = (this.options.coarse ?? touched)() ? Math.max(1, seatPanelMinimumScale / this.view.scale) : 1;
    if (wanted <= 1) {
      return placesOf(seatCount, humanSeat);
    }
    const { w, h } = this.view.size;
    const key = [seatCount, humanSeat, wanted.toFixed(4), w, h].join("|");
    if (this.grown?.key !== key) {
      const room = this.roomFor(seatCount, humanSeat);
      this.grown = { key, places: room === null ? placesOf(seatCount, humanSeat) : grownPlaces(seatCount, humanSeat, wanted, room).places };
    }
    return this.grown.places;
  }

  // What the panels keep clear of, measured with the corner panels as they would be at their tallest.
  private roomFor(seatCount: number, humanSeat: number): Room | null {
    const trick = tallestTrickPanel();
    const score = tallestScoreboard(seatCount);
    for (const probe of [trick, score]) {
      probe.style.visibility = "hidden";
      probe.setAttribute("aria-hidden", "true");
      this.view.hud.append(probe);
    }
    const fan = humanSeated(seatCount, humanSeat) ? [this.hand.fanBounds()] : [];
    const room = this.view.room([trick, score, this.buttons.element], fan);
    trick.remove();
    score.remove();
    return room;
  }

  // The table was fitted to a view: the seats are laid out again if they stand differently in it.
  private fitSeats(): void {
    const model = this.last;
    if (model === null || this.where.length === 0) {
      return;
    }
    const was = this.where;
    const now = this.placesFor(model.seats.length, model.humanSeat);
    const same = (a: Rect | undefined, b: Rect | undefined) => a?.x === b?.x && a?.y === b?.y && a?.w === b?.w && a?.h === b?.h;
    if (now.some((place, seat) => !same(place?.panel, was[seat]?.panel) || place?.angle !== was[seat]?.angle)) {
      void this.relayout(model, NO_CHANGE, false);
    }
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
    this.buttons.onHistory(handler);
  }

  onLastTrick(handler: () => void): void {
    this.buttons.onLastTrick(handler);
  }

  private ensureSeats(count: number): void {
    while (this.panels.length < count) {
      const rack = new RackView();
      this.view.space.append(rack.element);
      this.racks.push(rack);
      const panel = new SeatPanel();
      this.view.space.append(panel.element);
      this.panels.push(panel);
      const bubble = new BidBubble();
      this.view.space.append(bubble.element);
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
      handScale: () => this.hand.drawnScale().scale,
    };
  }

  // Draws the model at once and resolves when the motion it started has ended. No model draws the
  // table alone, with no seats and no corner panels.
  async relayout(model: TableModel | null, change: Change, animate: boolean): Promise<void> {
    this.view.hud.hidden = model === null;
    if (model === null) {
      this.ensureSeats(0);
      this.trick.clear();
      this.leadMark.set(null);
      this.hand.element.hidden = true;
      this.bidStrip.update(null);
      this.last = null;
      this.where = [];
      return;
    }

    const seatCount = model.seats.length;
    this.ensureSeats(seatCount);
    // The corner panels first: the seats keep clear of them, where they are drawn.
    this.scoreboard.update(model);
    this.trickPanel.update(model);
    const where = this.placesFor(seatCount, model.humanSeat);
    this.where = where;

    // A new game starts with nothing of the last one on the table.
    if (change.event?.kind === "gameStarted") {
      this.trick.clear();
      this.last = null;
    }
    const last = change.fresh ? null : this.last;

    // Whether anyone has still to bid, which is all the pills need to know of the phase.
    const biddingOpen = model.betsPlaced < seatCount;

    model.seats.forEach((seat, index) => {
      const place = where[index];
      // A player count the layout has no row for: the seat is not drawn rather than drawn
      // somewhere invented.
      if (place === null) {
        this.panels[index].hide();
        this.racks[index].hide();
        return;
      }
      this.panels[index].update(seat, place.panel, {
        // activeSeat is -1 between turns: no ring anywhere is what the table shows then.
        active: model.activeSeat === index,
        biddingOpen,
        human: index === model.humanSeat,
      });

      // Every rack but yours: your hand is the fan at the bottom. A watcher's seat 0 has one on the
      // rim, in line with its panel.
      if (place.human || place.angle === null) {
        this.racks[index].hide();
      } else {
        this.racks[index].update(shownFor(seat), place.angle);
      }
    });

    // The trick, each card in front of its owner's rack, before the fan is drawn again: a card of
    // yours that is new on the felt flies from where it stood in the fan, which still holds it.
    const motion = this.motion(model, animate, change.fresh);
    const flights = this.trick.update(model, where, motion);

    const lead = leadSeat(model.phase, seatCount, model.table, model.leadSeat);
    const leadPlace = lead === null ? null : (where[lead] ?? null);
    this.leadMark.set(leadPlace === null ? null : leadMarkPlacement(seatCount, leadPlace));

    // Nobody seated, no hand: a watcher's table has none at the bottom.
    this.hand.update(model.hand, humanSeated(seatCount, model.humanSeat));

    // And the strip, while you are asked for a bid.
    this.bidStrip.update(model);

    // Bids said out loud, never waited for.
    this.announceBids(last, model, where, animate && animates(this.options.pace()));
    this.last = model;

    await flights;
  }

  // The bubbles over the seats that bid in this frame.
  private announceBids(last: TableModel | null, next: TableModel, where: readonly (Place | null)[], animate: boolean): void {
    const bids = newBids(last, next);
    if (bids === null) {
      for (const bubble of this.bubbles) {
        bubble.dismiss();
      }
      return;
    }
    for (const index of bids) {
      const place = where[index];
      if (place === null || place === undefined) {
        continue;
      }
      this.bubbles[index].say(textFor(index === next.humanSeat, next.seats[index].bet), place.panel, animate);
    }
  }

  // Your card goes to the felt the moment you click, and leaves the fan. The server's word that it
  // was played confirms it without flying it again; an error calls it back.
  playOwn(card: Card, animate: boolean): Promise<unknown> {
    const model = this.last;
    if (model === null) {
      return Promise.resolve();
    }
    const flight = this.trick.flyOwn(card, model, this.where, this.motion(model, animate, false));
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
    // The corner panels were measured before the faces loaded, so what they keep clear of is measured again.
    this.grown = null;
    this.view.refit();
  }
}

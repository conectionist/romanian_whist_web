import type { Change } from "../play/store";
import type { TableModel } from "../play/model";
import { leadSeat, leadMarkPlacement } from "./geometry/trick";
import { places } from "./geometry/seats";
import { CornerButtons } from "./buttons";
import { HandView } from "./hand";
import { LeadMark } from "./leadMark";
import { humanSeated } from "./geometry/seats";
import { RackView, shownFor } from "./rack";
import { Scoreboard } from "./scoreboard";
import { SeatPanel } from "./seatPanel";
import { TableTop } from "./tableTop";
import { TrickPanel } from "./trickPanel";
import { TrickView } from "./trick";
import type { TableView } from "./view";

// The table's scene: it owns every element, creates each once and updates it in place from the
// model, keyed by seat and by card (TableScene.cpp's relayout()). When the seat count falls,
// elements are hidden, never deleted.
export class TableScene {
  readonly top = new TableTop();
  private readonly panels: SeatPanel[] = [];
  private readonly racks: RackView[] = [];
  private readonly trick = new TrickView();
  private readonly leadMark = new LeadMark();
  readonly hand = new HandView();
  private readonly scoreboard = new Scoreboard();
  private readonly trickPanel = new TrickPanel();
  private readonly buttons = new CornerButtons();

  constructor(readonly view: TableView) {
    view.space.append(this.top.element, this.trick.element, this.leadMark.element, this.hand.element);
    view.hud.append(this.trickPanel.element, this.scoreboard.element, this.buttons.element);
  }

  private ensureSeats(count: number): void {
    while (this.panels.length < count) {
      const rack = new RackView();
      this.view.space.append(rack.element);
      this.racks.push(rack);
      const panel = new SeatPanel();
      this.view.space.append(panel.element);
      this.panels.push(panel);
    }
    for (let seat = count; seat < this.panels.length; seat++) {
      this.panels[seat].hide();
      this.racks[seat].hide();
    }
  }

  // Draws the model at once and resolves when the motion it started has ended. No model draws the
  // table alone, with no seats and no corner panels.
  async relayout(model: TableModel | null, _change: Change, _animate: boolean): Promise<void> {
    this.view.hud.hidden = model === null;
    if (model === null) {
      this.ensureSeats(0);
      this.trick.clear();
      this.leadMark.set(null);
      this.hand.element.hidden = true;
      return;
    }

    const seatCount = model.seats.length;
    this.ensureSeats(seatCount);
    const where = places(seatCount, model.humanSeat);

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

    // The trick, each card in front of its owner's rack, and the mark on the felt in line with the
    // leader's.
    this.trick.update(model, where);
    const lead = leadSeat(model.phase, seatCount, model.table, model.leadSeat);
    const leadPlace = lead === null ? null : (where[lead] ?? null);
    this.leadMark.set(leadPlace === null ? null : leadMarkPlacement(seatCount, leadPlace));

    // Nobody seated, no hand: a watcher's table has none at the bottom.
    this.hand.update(model.hand, humanSeated(seatCount, model.humanSeat));

    // The corner panels, shown from the first game state on.
    this.scoreboard.update(model);
    this.trickPanel.update(model);
  }

  // Everything in the air lands where it was going.
  finishMotion(): void {}

  // The table's own measurements again, once its faces have loaded.
  refit(): void {
    this.top.fit();
    this.scoreboard.measureSizers();
    this.view.refit();
  }
}

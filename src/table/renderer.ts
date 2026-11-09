import type { Change } from "../play/store";
import type { TableModel } from "../play/model";
import { places } from "./geometry/seats";
import { SeatPanel } from "./seatPanel";
import { TableTop } from "./tableTop";
import type { TableView } from "./view";

// The table's scene: it owns every element, creates each once and updates it in place from the
// model, keyed by seat and by card (TableScene.cpp's relayout()). When the seat count falls,
// elements are hidden, never deleted.
export class TableScene {
  readonly top = new TableTop();
  private readonly panels: SeatPanel[] = [];

  constructor(readonly view: TableView) {
    view.space.append(this.top.element);
  }

  private ensureSeats(count: number): void {
    while (this.panels.length < count) {
      const panel = new SeatPanel();
      this.view.space.append(panel.element);
      this.panels.push(panel);
    }
    for (let seat = count; seat < this.panels.length; seat++) {
      this.panels[seat].hide();
    }
  }

  // Draws the model at once and resolves when the motion it started has ended. No model draws the
  // table alone, with no seats and no corner panels.
  async relayout(model: TableModel | null, _change: Change, _animate: boolean): Promise<void> {
    this.view.hud.hidden = model === null;
    if (model === null) {
      this.ensureSeats(0);
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
        return;
      }
      this.panels[index].update(seat, place.panel, {
        // activeSeat is -1 between turns: no ring anywhere is what the table shows then.
        active: model.activeSeat === index,
        biddingOpen,
        human: index === model.humanSeat,
      });
    });
  }

  // Everything in the air lands where it was going.
  finishMotion(): void {}

  // The table's own measurements again, once its faces have loaded.
  refit(): void {
    this.top.fit();
    this.view.refit();
  }
}

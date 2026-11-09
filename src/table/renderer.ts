import type { Change } from "../play/store";
import type { TableModel } from "../play/model";
import { TableTop } from "./tableTop";
import type { TableView } from "./view";

// The table's scene: it owns every element, creates each once and updates it in place from the
// model (TableScene.cpp's relayout()).
export class TableScene {
  readonly top = new TableTop();

  constructor(readonly view: TableView) {
    view.space.append(this.top.element);
  }

  // Draws the model at once and resolves when the motion it started has ended. No model draws the
  // table alone, with no seats and no corner panels.
  async relayout(model: TableModel | null, _change: Change, _animate: boolean): Promise<void> {
    this.view.hud.hidden = model === null;
  }

  // Everything in the air lands where it was going.
  finishMotion(): void {}

  // The table's own measurements again, once its faces have loaded.
  refit(): void {
    this.top.fit();
    this.view.refit();
  }
}

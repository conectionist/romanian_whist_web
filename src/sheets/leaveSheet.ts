import { el, setText } from "../dom/el";
import { t } from "../i18n/t";
import type { Sheet } from "./layer";
import { SheetButton, actions } from "./parts";

// What Exit and Esc raise at an online table, in the pause sheet's layout: a way back and a way out.
// An online game cannot be paused, since one person would hold up everyone, so the game goes on
// behind it and a computer player takes the seat of anyone who leaves.

export interface LeaveActions {
  leave(): void;
  stay(): void;
}

export class LeaveSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly meta = el("div", { class: "sheet-meta" });
  private readonly leave = new SheetButton(t("online", "Leave table"), "quiet", "leave");
  private readonly stay = new SheetButton(t("online", "Stay"), "primary", "stay");

  constructor(handlers: LeaveActions) {
    this.element = el(
      "section",
      { class: "sheet", data: { sheet: "leave" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-leave-title" } },
      el("h2", { class: "sheet-title", attrs: { id: "sheet-leave-title" }, text: t("online", "Leave the table?") }),
      this.meta,
      actions(this.leave, this.stay),
    );
    this.leave.onClick(handlers.leave);
    this.stay.onClick(handlers.stay);
  }

  // What leaving costs: in a game, a computer player plays on in your seat; before it, your seat is open.
  update(inGame: boolean): void {
    setText(this.meta, inGame ? t("online", "The game goes on without you: a computer player takes your seat.") : t("online", "Your seat is open for someone else."));
  }

  // Enter stays, so every quick way out of this sheet puts the player back where they were.
  focusDefault(): void {
    this.stay.focus();
  }
}

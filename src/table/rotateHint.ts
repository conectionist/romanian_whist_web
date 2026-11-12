import { el } from "../dom/el";
import { t } from "../i18n/t";

// What a phone held upright is told: the table is fitted to the window's width, which makes it small
// there. The stylesheet shows it, only to a narrow upright touch screen, below the table.
export function rotateHint(): HTMLElement {
  return el("div", { class: "panel rotate-hint", attrs: { role: "note" } }, el("span", { text: t("hint", "Turn your phone sideways: the table needs the room.") }));
}

import { cardUrl } from "../assets/assets";
import { el, setAttr, setSrc, setText, stamp } from "../dom/el";
import { icon } from "../dom/icons";
import { renderRuns, renderSuited, textOf, type Line } from "../dom/runs";
import { t } from "../i18n/t";
import type { TableModel } from "../play/model";
import { cardNameFor } from "./cardNames";
import { fullscreenButton, type SmallNotice } from "./fullscreen";
import type { PageLayout } from "./geometry/page";
import { SIDE_RUN } from "./geometry/scaled";
import { DASH } from "./hudText";
import { roundText } from "./roundText";
import { rowsFor, tensionFor, trumpFor } from "./scoreboard";
import { fieldsFor as trickFields } from "./trickPanel";
import { z } from "./space";

// What the scaled table draws in place of the desktop's menu bar and corner panels: the pause button top left, the
// round chip top right, the two round buttons bottom left and the trump bottom right, the trick's details and the
// scores in the gaps beside the table, and the line above your hand. Each is made once and filled from the model.

export interface ChromeActions {
  menu(): void;
  history(): void;
  lastTrick(): void;
  scores(): void;
  // The notice about a small table was put away.
  dismissNotice(): void;
}

function roundButton(name: string, label: string, picture: Parameters<typeof icon>[0]): HTMLButtonElement {
  return el("button", { class: "panel round-btn", attrs: { type: "button", "aria-label": label, title: label }, data: { roundButton: name } }, icon(picture));
}

// The line above your hand says what to do, in the voice of the trick panel's prompt. Null when there is
// nothing to do: the strip asks for a bid, and between turns the table shows whose it is.
export function promptLineFor(model: TableModel): Line | null {
  if (model.prompt?.kind === "bet") {
    return null;
  }
  const yours = model.humanSeat >= 0 && model.activeSeat === model.humanSeat && model.phase === "playing";
  return yours ? trickFields(model).prompt : null;
}

export class ScaledChrome {
  readonly menu: HTMLButtonElement;
  readonly history: HTMLButtonElement;
  readonly lastTrick: HTMLButtonElement;
  readonly chip: HTMLButtonElement;
  // The trump, bottom right under the scores: the word, and the card or, where there is no trump, the words for it.
  readonly trump: HTMLButtonElement;
  readonly sideTrick: HTMLButtonElement;
  readonly sideScores: HTMLButtonElement;
  readonly prompt: HTMLElement;
  // The full-screen notice, at the top between the two corner controls. It stands over the plate that is at the top
  // of the table, and over nothing else: the hand, the bid strip and the chip are below it or beside it.
  readonly notice: HTMLElement;
  readonly elements: HTMLElement[];

  private readonly corner: HTMLElement;
  private readonly rail: HTMLElement;
  private readonly roundLine = el("span", { class: "l1" });
  private readonly trickLine = el("span", { class: "l2" });
  private readonly trumpLabel = el("span", { class: "lbl", text: t("scoreboard", "Trump") });
  private readonly trumpCard = el("img", { class: "trump-card", attrs: { alt: "", draggable: "false" } });
  private readonly trumpNone = el("span", { class: "trump-none" });
  private readonly trickTitle = el("div", { class: "st" });
  private readonly trickRows = el("div");
  private readonly scoreTension = el("div", { class: "sr" });
  private readonly scoreRows = el("tbody");
  private online = false;
  private lastTrump: string | null | undefined;
  private lastKey = "";
  private promptKey = "";
  private readonly noticeText = el("span", { class: "scaled-notice-text" });
  private readonly noticeButton = fullscreenButton("notice-btn");

  constructor(actions: ChromeActions) {
    this.menu = roundButton("menu", "", "pause");
    this.menu.addEventListener("click", () => actions.menu());
    this.history = roundButton("history", t("TableScene", "Round history"), "round-history");
    this.history.addEventListener("click", () => actions.history());
    this.lastTrick = roundButton("last-trick", t("TableScene", "Last trick"), "last-trick");
    this.lastTrick.addEventListener("click", () => actions.lastTrick());

    this.chip = el(
      "button",
      { class: "panel round-chip", attrs: { type: "button" }, data: { roundButton: "scores" } },
      el("span", { class: "lines" }, this.roundLine, this.trickLine),
    );
    this.chip.addEventListener("click", () => actions.scores());
    this.trump = el("button", { class: "trump-corner", attrs: { type: "button" }, data: { roundButton: "trump" } }, this.trumpLabel, this.trumpCard, this.trumpNone);
    this.trump.addEventListener("click", () => actions.scores());
    this.corner = el("div", { class: "corner-chip" }, this.chip);
    this.rail = el("div", { class: "rail-buttons" }, this.history, this.lastTrick);

    this.sideTrick = el("button", { class: "panel side-panel side-trick", attrs: { type: "button" } }, this.trickTitle, this.trickRows);
    this.sideTrick.addEventListener("click", () => actions.scores());
    this.sideScores = el(
      "button",
      { class: "panel side-panel side-scores", attrs: { type: "button" } },
      el("div", { class: "lbl", text: t("scoreboard", "Scores") }),
      this.scoreTension,
      el("table", {}, this.scoreRows),
    );
    this.sideScores.addEventListener("click", () => actions.scores());

    this.prompt = el("div", { class: "panel prompt-line", attrs: { role: "status" } });
    this.prompt.hidden = true;
    const dismiss = el("button", { class: "notice-btn notice-dismiss", attrs: { type: "button", "aria-label": t("historysheet", "Close") }, text: "×" });
    dismiss.addEventListener("click", () => actions.dismissNotice());
    this.notice = el("div", { class: "panel scaled-notice", attrs: { role: "status" } }, this.noticeText, this.noticeButton, dismiss);
    this.notice.hidden = true;

    this.elements = [this.menu, this.corner, this.rail, this.trump, this.sideTrick, this.sideScores, this.prompt, this.notice];
    for (const node of [this.menu, this.chip, this.history, this.lastTrick, this.trump, this.sideTrick, this.sideScores, this.prompt]) {
      stamp(node);
    }
    this.hide();
  }

  hide(): void {
    for (const node of this.elements) {
      node.hidden = true;
    }
  }

  // Fills the controls from the table as it is, and places those that depend on its layout.
  update(model: TableModel, layout: PageLayout, state: { online: boolean; short: string | null; notice?: SmallNotice }): void {
    const notice = state.notice ?? null;
    this.notice.hidden = notice === null;
    if (notice !== null) {
      setText(this.noticeText, notice === "fullscreen" ? t("fullscreen", "The table is small here.") : t("fullscreen", "Add the page to the home screen for a bigger table."));
      this.noticeButton.hidden = notice !== "fullscreen";
    }
    for (const node of [this.menu, this.corner, this.rail, this.trump]) {
      node.hidden = false;
    }
    if (state.online !== this.online || this.menu.getAttribute("aria-label") === "") {
      this.online = state.online;
      const label = state.online ? t("TableScene", "Menu") : t("TableScene", "Pause");
      this.menu.replaceChildren(icon(state.online ? "menu" : "pause"));
      setAttr(this.menu, "aria-label", label);
      setAttr(this.menu, "title", label);
    }

    const trick = trickFields(model);
    const side = layout.side;
    setText(this.roundLine, roundText(model.roundNumber, model.roundCount));
    // The trick's line goes while the side panels show it.
    setText(this.trickLine, trick.title);
    this.trickLine.hidden = side !== null;
    this.chip.classList.toggle("short", side !== null);
    const trump = trumpFor(model);
    const key = trump.card ?? "";
    if (key !== this.lastTrump) {
      this.lastTrump = key;
      this.trumpCard.hidden = trump.card === null;
      this.trumpNone.hidden = trump.card !== null;
      setSrc(this.trumpCard, trump.card === null ? null : cardUrl(trump.card));
      this.trumpCard.alt = "";
      setText(this.trumpNone, trump.name);
      setAttr(this.trump, "aria-label", t("announce", "Trump: %1", [trump.card === null ? trump.name : cardNameFor(trump.card)]));
    }
    // The card is as tall as one played on the felt, in a box that is as wide for the words of a round with no trump.
    this.trump.style.width = `${layout.trump.w}px`;
    this.trumpCard.style.width = `${layout.trumpCard.w}px`;
    this.trumpCard.style.height = `${layout.trumpCard.h}px`;
    this.trumpNone.style.height = `${layout.trumpCard.h}px`;

    this.sideTrick.hidden = side === null;
    this.sideScores.hidden = side === null;
    if (side !== null) {
      this.sideTrick.style.left = "8px";
      this.sideTrick.style.top = `${side.y}px`;
      this.sideTrick.style.width = `${side.w}px`;
      this.sideScores.style.right = "8px";
      this.sideScores.style.top = `${side.y}px`;
      this.sideScores.style.width = `${side.w}px`;
      setText(this.trickTitle, trick.title);
      // Rows only change with the trick: rebuilt when their words do.
      const now = JSON.stringify([trick.rows, side.w >= SIDE_RUN, rowsFor(model), tensionFor(model)]);
      if (now !== this.lastKey) {
        this.lastKey = now;
        this.trickRows.replaceChildren(
          ...trick.rows.map((row) => {
            const line = el("div", { class: "sr" });
            renderRuns(line, row);
            return line;
          }),
        );
        renderRuns(this.scoreTension, tensionFor(model));
        this.scoreRows.replaceChildren(
          ...rowsFor(model).map((row) =>
            el(
              "tr",
              {},
              el("td", { class: row.turn ? "turn" : "" }, row.name),
              el("td", {}, row.points),
              side.w >= SIDE_RUN ? el("td", { class: "run", data: { streak: row.streak } }, row.run === "" ? DASH : row.run) : null,
            ),
          ),
        );
      }
    }

    // The line above your hand: what to do, or the short reason a bid is refused when the strip has no
    // room for its note.
    const line = state.short === null ? promptLineFor(model) : null;
    this.prompt.hidden = line === null && state.short === null;
    if (state.short !== null) {
      this.prompt.dataset.tone = "turn";
      this.prompt.style.top = `${layout.hand.top - 6}px`;
      this.prompt.style.maxWidth = `${layout.lineW}px`;
      this.promptKey = state.short;
      renderSuited(this.prompt, state.short);
    } else if (line !== null) {
      this.prompt.dataset.tone = "turn";
      this.prompt.style.top = `${layout.lineBottom}px`;
      this.prompt.style.maxWidth = `${layout.lineW}px`;
      const key = JSON.stringify(line);
      if (key !== this.promptKey) {
        this.promptKey = key;
        renderSuited(this.prompt, textOf(line));
      }
    }
    this.prompt.style.left = `${layout.hand.cx}px`;
    this.prompt.style.zIndex = String(z.hud + 5);
  }
}

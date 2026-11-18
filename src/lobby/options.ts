import { el } from "../dom/el";
import { t } from "../i18n/t";
import type { Structure } from "../net/protocol";
import { FASTEST_SPEED, Slider, speedAt } from "../sheets/settingsSheet";
import { Box, groupHead } from "./controls";

// The shape of the game and its pace, which New Game and a table's lobby both ask: the structure, the
// two Forehead options, the bot speed and the wait after each round.

export interface Options {
  structure: Structure;
  foreheadAndHidden: boolean;
  allOneCardForehead: boolean;
  botSpeed: number;
  waitAfterRound: boolean;
}

export class OptionsBlock {
  // The elements in the order they stand: the shape, its summary, then the pace.
  readonly elements: HTMLElement[];
  readonly summary = el("div", { class: "ng-summary sheet-body", attrs: { "aria-live": "polite" } });
  private readonly first: Box;
  private readonly second: Box;
  readonly appended = new Box("check", t("NewGameDialog", "End with a forehead round and a hidden round"), "foreheadAndHidden");
  readonly ones = new Box("check", t("NewGameDialog", "Play every one-card round forehead"), "allOnesForehead");
  readonly speed = new Slider(t("newgame", "Bot speed"), t("newgame", "Slow"), t("newgame", "Instant"), FASTEST_SPEED, t("newgame", "Bot speed"));
  readonly wait = new Box("check", t("newgame", "Wait for me after each round"), "waitEachRound");
  readonly speedRow = el("div", { class: "sliders ng-speed" }, ...this.speed.nodes);

  constructor(group: string) {
    this.first = new Box("radio", t("NewGameDialog", "1-8-1 - counts up from one card and back down"), `${group}-structure`);
    this.second = new Box("radio", t("NewGameDialog", "8-1-8 - the other way round"), `${group}-structure`);
    this.elements = [
      groupHead(t("NewGameDialog", "Shape of the game")),
      this.first.element,
      this.second.element,
      this.appended.element,
      this.ones.element,
      this.summary,
      groupHead(t("NewGameDialog", "Pace")),
      this.speedRow,
      this.wait.element,
    ];
  }

  read(): Options {
    return {
      structure: this.first.checked ? "1-8-1" : "8-1-8",
      foreheadAndHidden: this.appended.checked,
      allOneCardForehead: this.ones.checked,
      botSpeed: speedAt(this.speed.value),
      waitAfterRound: this.wait.checked,
    };
  }

  write(options: Options): void {
    this.first.checked = options.structure === "1-8-1";
    this.second.checked = options.structure === "8-1-8";
    this.appended.checked = options.foreheadAndHidden;
    this.ones.checked = options.allOneCardForehead;
    this.speed.value = speedAt(options.botSpeed);
    this.wait.checked = options.waitAfterRound;
  }

  onChange(handler: () => void): void {
    this.first.onChange(handler);
    this.second.onChange(handler);
    this.appended.onChange(handler);
    this.ones.onChange(handler);
    this.speed.onChange(handler);
    this.wait.onChange(handler);
  }
}

import { el } from "../dom/el";
import { t } from "../i18n/t";
import { PACES, paceAt, stopOf, type Pace } from "../play/motion";
import type { Sheet } from "./layer";
import { SheetButton, actions } from "./parts";

// The menu bar's Settings, src/ui/SettingsSheet.cpp: the bot speed and whether the round sheet waits
// for you, the two pacing knobs of New Game, and how much the cards move. Live: each change is
// announced at once, and there is nothing to apply and nothing to cancel, so the one button is Done.

export const SPEED_STOPS = 5;
export const FASTEST_SPEED = SPEED_STOPS - 1;
export const DEFAULT_BOT_SPEED = 2;

// A bot speed from a control, as a whole number the table accepts.
export function speedAt(stop: number): number {
  return Math.min(Math.max(Math.trunc(stop), 0), FASTEST_SPEED);
}

export interface SettingsValues {
  botSpeed: number;
  waitAfterRound: boolean;
  pace: Pace;
}

export interface SettingsActions {
  changed(values: SettingsValues): void;
  done(): void;
}

// A slider and its words: "Bot speed", "Slow", the slider, "Instant". The words of every row sit in
// the columns of one grid, so the sliders start and end together.
export class Slider {
  readonly nodes: HTMLElement[];
  private readonly input: HTMLInputElement;
  private readonly last: number;

  constructor(name: string, low: string, high: string, last: number, label: string) {
    this.last = last;
    this.input = el("input", { attrs: { type: "range", min: "0", max: String(last), step: "1", "aria-label": label } });
    const ticks = el("div", { class: "ticks", attrs: { "aria-hidden": "true" } });
    for (let stop = 0; stop <= last; stop++) {
      const tick = el("span");
      tick.style.left = `calc(7px + (100% - 14px) * ${stop / last})`;
      ticks.append(tick);
    }
    const track = el("div", { class: "slider" }, this.input, ticks);
    this.nodes = [
      el("span", { class: "sheet-label name", text: name }),
      el("span", { class: "sheet-note end", text: low }),
      track,
      el("span", { class: "sheet-note end", text: high }),
    ];
    this.input.addEventListener("input", () => this.paint());
  }

  get value(): number {
    return Number(this.input.value);
  }

  set value(stop: number) {
    this.input.value = String(stop);
    this.paint();
  }

  onChange(handler: () => void): void {
    this.input.addEventListener("input", handler);
  }

  hide(hidden: boolean): void {
    for (const node of this.nodes) {
      node.hidden = hidden;
    }
  }

  focus(): void {
    this.input.focus();
  }

  // How much of the groove is filled, up to the handle's middle.
  private paint(): void {
    this.input.style.setProperty("--v", String(this.value / this.last));
  }
}

export class SettingsSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly speed = new Slider(
    t("newgame", "Bot speed"),
    t("newgame", "Slow"),
    t("newgame", "Instant"),
    FASTEST_SPEED,
    t("newgame", "Bot speed"),
  );
  private readonly animations = new Slider(
    t("SettingsSheet", "Card animations"),
    t("SettingsSheet", "Off"),
    t("SettingsSheet", "Slow"),
    PACES.length - 1,
    t("SettingsSheet", "Card animations"),
  );
  private readonly wait = el("input", { attrs: { type: "checkbox" } });
  private readonly done = new SheetButton(t("SettingsSheet", "Done"), "primary", "done");
  private readonly handlers: SettingsActions;

  constructor(handlers: SettingsActions) {
    this.handlers = handlers;
    const check = el("label", { class: "check sheet-body" }, this.wait, el("span", { class: "box" }), el("span", { text: t("newgame", "Wait for me after each round") }));
    this.element = el(
      "section",
      { class: "sheet", data: { sheet: "settings" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-settings-title" } },
      el("h2", { class: "sheet-title", attrs: { id: "sheet-settings-title" }, text: t("SettingsSheet", "Settings") }),
      el("div", { class: "sheet-meta", text: t("SettingsSheet", "These apply now, and to your next game.") }),
      el("div", { class: "sliders" }, ...this.speed.nodes, ...this.animations.nodes),
      check,
      actions(this.done),
    );
    this.speed.onChange(() => this.announce());
    this.animations.onChange(() => this.announce());
    this.wait.addEventListener("change", () => this.announce());
    this.done.onClick(handlers.done);
  }

  // What the sheet opens on. Filling it is not changing a setting, so nothing is announced.
  setValues(values: SettingsValues): void {
    this.speed.value = speedAt(values.botSpeed);
    this.animations.value = stopOf(values.pace);
    this.wait.checked = values.waitAfterRound;
  }

  // The bot speed and the wait are the table's: at an online table they were fixed when it was made.
  showTable(shown: boolean): void {
    this.speed.hide(!shown);
    this.wait.closest("label")?.toggleAttribute("hidden", !shown);
  }

  private announce(): void {
    this.handlers.changed({
      botSpeed: speedAt(this.speed.value),
      waitAfterRound: this.wait.checked,
      pace: paceAt(this.animations.value),
    });
  }

  focusDefault(): void {
    this.done.focus();
  }
}

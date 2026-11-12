import { el, setText } from "../dom/el";
import { currentLanguage } from "../i18n/language";
import { t } from "../i18n/t";
import type { Gender } from "../net/protocol";
import type { Sheet } from "../sheets/layer";
import { SheetButton, actions } from "../sheets/parts";
import { drawName, nameCatalogue, type Random } from "./catalogue";
import { Box, Choose, Refusal, formRow, hint, numberField, textField, type Choice } from "./controls";
import { OptionsBlock } from "./options";
import {
  LEVEL_ORDER,
  MAX_NAME_LENGTH,
  MAX_SEATS,
  MAX_SEED,
  DEFAULT_SEED,
  MIN_SEATS,
  defaultLevel,
  firstError,
  levelName,
  levelTooltip,
  opponentRange,
  summaryText,
  type Opponent,
  type Setup,
} from "./setup";

// New Game, src/ui/NewGameDialog.cpp: one screen rather than a wizard, so the whole shape of a game
// is seen before it starts. Its fields, their order, their words and their bounds are the dialog's, in
// the sheets' look, which the desktop's own dialog has no picture of.

export function genderChoices(): Choice<Gender>[] {
  return [
    { value: "male", label: t("NewGameDialog", "Male") },
    { value: "female", label: t("NewGameDialog", "Female") },
  ];
}

export function levelChoices(): Choice<(typeof LEVEL_ORDER)[number]>[] {
  return LEVEL_ORDER.map((level) => ({ value: level, label: levelName(level), title: levelTooltip(level) }));
}

interface Row {
  element: HTMLElement;
  name: HTMLInputElement;
  gender: Choose<Gender>;
  level: Choose<(typeof LEVEL_ORDER)[number]>;
  // The name last drawn for this row. While the row still shows it, a new gender or level draws
  // another; once it is typed over, it is kept.
  drawn: string;
}

export interface NewGameActions {
  deal(setup: Setup): void;
  cancel(): void;
}

export class NewGameSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly playing = new Box("radio", t("NewGameDialog", "I'm playing"), "who");
  private readonly watching = new Box("radio", t("NewGameDialog", "I'm watching"), "who");
  private readonly humanName = textField({ name: "humanName", max: MAX_NAME_LENGTH, label: t("NewGameDialog", "Your name") });
  private readonly humanGender = new Choose<Gender>("humanGender", t("NewGameDialog", "Gender"), genderChoices(), "male");
  private readonly humanLabel = el("span", { class: "ng-label", text: t("NewGameDialog", "Your name") });
  private readonly opponents = numberField({ name: "opponents", min: 1, max: 5, label: t("NewGameDialog", "Opponents"), value: 3 });
  private readonly rows: Row[] = [];
  private readonly rowsBox = el("div", { class: "ng-rows" });
  private readonly options = new OptionsBlock("new-game");
  private readonly fixed = new Box("check", t("NewGameDialog", "Fixed deal, seed"), "fixedDeal");
  private readonly seed = numberField({ name: "seed", min: 0, max: MAX_SEED, label: t("NewGameDialog", "Fixed deal, seed"), value: DEFAULT_SEED });
  private readonly error = el("div", { class: "ng-error", attrs: { role: "alert" } });
  private readonly cancel = new SheetButton(t("NewGameDialog", "Cancel"), "quiet", "cancel");
  private readonly deal = new SheetButton(t("NewGameDialog", "Deal"), "primary", "deal");
  // What the dialog was opened on, which a row added later takes its opponent from.
  private initial: Setup | null = null;
  private readonly refusal: Refusal;
  private waiting = false;

  constructor(
    actions_: NewGameActions,
    private readonly random: Random = Math.random,
  ) {
    const who = el("div", { class: "ng-who" }, this.playing.element, this.watching.element);
    const grid = el(
      "div",
      { class: "ng-grid" },
      this.humanLabel,
      el("div", { class: "ng-line" }, this.humanName, this.humanGender.element),
      ...formRow(t("NewGameDialog", "Opponents"), this.opponents, hint(t("NewGameDialog", "(%1-%2 at the table)", [MIN_SEATS, MAX_SEATS]))),
    );
    const seedRow = el("div", { class: "ng-line" }, this.fixed.element, this.seed);
    this.element = el(
      "section",
      { class: "sheet newgame", data: { sheet: "new-game" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-new-game-title" } },
      el("h2", { class: "sheet-title", attrs: { id: "sheet-new-game-title" }, text: t("NewGameDialog", "New Game") }),
      who,
      grid,
      this.rowsBox,
      ...this.options.elements,
      seedRow,
      this.error,
      actions(this.cancel, this.deal),
    );
    this.refusal = new Refusal(this.element, () => this.refresh());
    this.cancel.onClick(() => actions_.cancel());
    this.deal.onClick(() => {
      const setup = this.read();
      if (firstError(setup) === null) {
        actions_.deal(setup);
      }
    });

    this.playing.onChange(() => this.playingChanged());
    this.watching.onChange(() => this.playingChanged());
    this.humanName.addEventListener("input", () => this.refresh());
    this.humanGender.onChange(() => this.refresh());
    this.opponents.addEventListener("input", () => this.countChanged());
    this.options.onChange(() => this.refresh());
    this.fixed.onChange(() => {
      this.seed.disabled = !this.fixed.checked;
      this.refresh();
    });
    this.seed.addEventListener("input", () => this.refresh());
  }

  // Opens on a setup: the last game's, so that Play again and New Game find the settings they dealt.
  open(initial: Setup): void {
    this.initial = initial;
    this.playing.checked = !initial.spectator;
    this.watching.checked = initial.spectator;
    this.humanName.value = initial.human.name;
    this.humanGender.value = initial.human.gender;
    this.options.write(initial);
    this.fixed.checked = initial.seed !== null;
    this.seed.value = String(initial.seed === null ? DEFAULT_SEED : initial.seed % (MAX_SEED + 1));
    this.seed.disabled = initial.seed === null;
    // From the setup, not from the playing bounds regardless: a watched game of six is legal and the
    // largest table there is.
    this.applyRange(!initial.spectator);
    this.opponents.value = String(initial.bots.length);
    for (const row of this.rows.splice(0)) {
      row.element.remove();
    }
    this.buildRows();
    this.refusal.clear();
    this.refresh();
  }

  refuse(text: string): void {
    this.refusal.set(text);
  }

  // The server is asked and has not answered: the button waits with it, so one click is one table.
  busy(waiting: boolean): void {
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      this.refresh();
    }
  }

  // The setup as the controls show it.
  read(): Setup {
    const options = this.options.read();
    return {
      spectator: this.watching.checked,
      human: { name: this.humanName.value, gender: this.humanGender.value },
      bots: this.rows.map((row) => ({ name: row.name.value, gender: row.gender.value, level: row.level.value })),
      ...options,
      seed: this.fixed.checked ? this.seedValue() : null,
    };
  }

  private seedValue(): number {
    const value = Math.trunc(Number(this.seed.value));
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), MAX_SEED) : DEFAULT_SEED;
  }

  private applyRange(playing: boolean): void {
    const range = opponentRange(playing);
    this.opponents.min = String(range.min);
    this.opponents.max = String(range.max);
    const now = Math.trunc(Number(this.opponents.value));
    if (Number.isFinite(now)) {
      this.opponents.value = String(Math.min(Math.max(now, range.min), range.max));
    }
  }

  private wantedRows(): number {
    const range = opponentRange(this.playing.checked);
    const wanted = Math.trunc(Number(this.opponents.value));
    return Math.min(Math.max(Number.isFinite(wanted) ? wanted : range.min, range.min), range.max);
  }

  private playingChanged(): void {
    const playing = this.playing.checked;
    this.applyRange(playing);
    this.humanName.disabled = !playing;
    this.humanGender.element.disabled = !playing;
    this.humanLabel.classList.toggle("off", !playing);
    this.buildRows();
    this.refresh();
  }

  private countChanged(): void {
    // A count out of range is held to it only when it is left, so a typed 1 on the way to 12 is not a game.
    const typed = Math.trunc(Number(this.opponents.value));
    if (Number.isFinite(typed)) {
      this.buildRows();
    }
    this.refresh();
  }

  // Adds and removes opponent rows to match the count, keeping the names and levels already typed into the
  // rows that survive: changing the count adds a row with a pre-filled default name and opens no
  // other dialog.
  private buildRows(): void {
    const wanted = this.wantedRows();
    while (this.rows.length > wanted) {
      this.rows.pop()?.element.remove();
    }
    while (this.rows.length < wanted) {
      this.addRow(this.rows.length);
    }
  }

  private addRow(index: number): void {
    const before: Opponent | undefined = this.initial?.bots[index];
    const gender = new Choose<Gender>(`botGender${index}`, t("NewGameDialog", "Male"), genderChoices(), before?.gender ?? (this.random() < 0.5 ? "female" : "male"));
    const level = new Choose(`botLevel${index}`, t("NewGameDialog", "plays"), levelChoices(), before?.level ?? defaultLevel(index));
    const name = textField({ name: `botName${index}`, max: MAX_NAME_LENGTH, label: t("NewGameDialog", "Opponents") });
    const element = el(
      "div",
      { class: "ng-opponent" },
      el("span", { class: "ng-label", text: t("NewGameDialog", "%1.", [index + 1]) }),
      name,
      gender.element,
      el("span", { class: "sheet-note", text: t("NewGameDialog", "plays") }),
      level.element,
    );
    const row: Row = { element, name, gender, level, drawn: "" };
    // The name is drawn once the gender and the level it is drawn for are known. It avoids yours as it
    // stands; one typed afterwards that matches a computer player's is marked and Deal disabled, which
    // names the clash instead of renaming a seat in silence.
    row.drawn = this.draw(row, index);
    name.value = row.drawn;
    name.addEventListener("input", () => this.refresh());
    gender.onChange(() => {
      this.redrawUntouched(index);
      this.refresh();
    });
    level.onChange(() => {
      this.redrawUntouched(index);
      this.refresh();
    });
    this.rows.push(row);
    this.rowsBox.append(element);
  }

  // Every name at the table but this row's: yours while you play, and the other rows as they now read.
  private draw(row: Row, seat: number): string {
    const taken: string[] = [];
    if (this.playing.checked) {
      taken.push(this.humanName.value);
    }
    this.rows.forEach((other, index) => {
      if (index !== seat && other !== row) {
        taken.push(other.name.value);
      }
    });
    return drawName({ gender: row.gender.value, strategy: row.level.value }, currentLanguage(), nameCatalogue(), taken, seat + 1, this.random);
  }

  // A new gender or level draws a new name to match, unless the row's name is no longer the one drawn
  // for it: a name typed in is the player's to keep.
  private redrawUntouched(seat: number): void {
    const row = this.rows[seat];
    if (row.name.value !== row.drawn) {
      return;
    }
    row.drawn = this.draw(row, seat);
    row.name.value = row.drawn;
  }

  private refresh(): void {
    const setup = this.read();
    setText(this.options.summary, summaryText(setup));
    const wrong = firstError(setup);
    setText(this.error, this.refusal.or(wrong ?? ""));
    this.deal.disabled = wrong !== null || this.waiting;
    this.humanName.disabled = setup.spectator;
    this.humanGender.element.disabled = setup.spectator;
    this.humanLabel.classList.toggle("off", setup.spectator);
  }

  focusDefault(): void {
    if (this.deal.element.disabled) {
      this.humanName.focus();
    } else {
      this.deal.focus();
    }
  }
}

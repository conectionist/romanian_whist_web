import { el, setText } from "../dom/el";
import { currentLanguage } from "../i18n/language";
import { t } from "../i18n/t";
import type { Gender, Level, Profile } from "../net/protocol";
import type { Sheet } from "../sheets/layer";
import { SheetButton, actions } from "../sheets/parts";
import { drawName, nameCatalogue, type Random } from "./catalogue";
import { Choose, Refusal, formRow, hint, numberField, textField, type Choice } from "./controls";
import { genderChoices, levelChoices } from "./newGameSheet";
import { OptionsBlock } from "./options";
import { DEFAULT_TURN_TIMER, TURN_TIMERS, defaultTable, tableError, tableSettingsFor, timerLabel, withSeats, type OtherSeat, type TableSetup } from "./online";
import { LEVEL_ORDER, MAX_NAME_LENGTH, MAX_SEATS, MIN_SEATS, defaultLevel, levelName } from "./setup";
import { summaryOf } from "./lobby";

// Create a table, the online counterpart of New Game: how many seats, which are computer players, the
// shape of the game and its pace, who stands in for a person who goes away, and how long a turn may
// take. You take the first seat when it is made, and the others open for people to take.

export interface CreateActions {
  create(setup: TableSetup): void;
  cancel(): void;
}

interface Row {
  element: HTMLElement;
  kind: Choose<"open" | Level>;
  name: HTMLInputElement;
  gender: Choose<Gender>;
  drawn: string;
}

export class CreateTableSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly seats = numberField({ name: "seats", min: MIN_SEATS, max: MAX_SEATS, label: t("lobby", "Seats at the table"), value: 4 });
  private readonly rows: Row[] = [];
  private readonly rowsBox = el("div", { class: "ng-rows" });
  private readonly options = new OptionsBlock("create-table");
  private readonly replacement = new Choose<Level>("replacement", t("lobby", "Stands in for a person who goes away"), levelChoices(), "reckoner-beta");
  private readonly timer = new Choose<string>(
    "turnTimer",
    t("lobby", "A person's turn may take"),
    TURN_TIMERS.map((ms): Choice<string> => ({ value: String(ms), label: timerLabel(ms) })),
    String(DEFAULT_TURN_TIMER),
  );
  private readonly error = el("div", { class: "ng-error", attrs: { role: "alert" } });
  private readonly cancel = new SheetButton(t("NewGameDialog", "Cancel"), "quiet", "cancel");
  private readonly create = new SheetButton(t("lobby", "Create"), "primary", "create");
  private host: Profile = { name: "", gender: "male", avatar: "" };
  private setup: TableSetup | null = null;
  private readonly refusal: Refusal;
  private waiting = false;

  constructor(
    handlers: CreateActions,
    private readonly random: Random = Math.random,
  ) {
    this.element = el(
      "section",
      { class: "sheet newgame", data: { sheet: "create-table" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-create-title" } },
      el("h2", { class: "sheet-title", attrs: { id: "sheet-create-title" }, text: t("lobby", "Create a table") }),
      el("div", { class: "sheet-meta", text: t("lobby", "You take the first seat. People you share the link with take the open ones.") }),
      el("div", { class: "ng-grid" }, ...formRow(t("lobby", "Seats"), this.seats, hint(t("NewGameDialog", "(%1-%2 at the table)", [MIN_SEATS, MAX_SEATS])))),
      this.rowsBox,
      ...this.options.elements,
      el(
        "div",
        { class: "ng-grid ng-more" },
        ...formRow(t("lobby", "Stands in"), this.replacement.element),
        ...formRow(t("lobby", "A turn may take"), this.timer.element),
      ),
      this.error,
      actions(this.cancel, this.create),
    );
    this.refusal = new Refusal(this.element, () => this.refresh());
    this.cancel.onClick(() => handlers.cancel());
    this.create.onClick(() => {
      const made = this.read();
      if (tableError(made, this.host) === null) {
        handlers.create(made);
      }
    });
    this.seats.addEventListener("input", () => this.seatsChanged());
    this.options.onChange(() => this.refresh());
    this.replacement.onChange(() => this.refresh());
    this.timer.onChange(() => this.refresh());
  }

  open(host: Profile): void {
    this.host = host;
    this.setup = defaultTable(host, this.random);
    this.seats.value = String(this.setup.seats);
    this.options.write(this.setup);
    this.replacement.value = this.setup.replacement;
    this.timer.value = String(this.setup.turnTimer);
    for (const row of this.rows.splice(0)) {
      row.element.remove();
    }
    this.setup.others.forEach((seat, index) => this.addRow(index, seat));
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

  read(): TableSetup {
    const others: OtherSeat[] = this.rows.map((row) =>
      row.kind.value === "open"
        ? { kind: "open" }
        : { kind: "computer", name: row.name.value, gender: row.gender.value, level: row.kind.value },
    );
    return {
      ...this.options.read(),
      seats: others.length + 1,
      others,
      replacement: this.replacement.value,
      turnTimer: Number(this.timer.value),
    };
  }

  private seatsChanged(): void {
    const typed = Math.trunc(Number(this.seats.value));
    if (!Number.isFinite(typed)) {
      return;
    }
    const wanted = withSeats(this.read(), typed).others.length;
    while (this.rows.length > wanted) {
      this.rows.pop()?.element.remove();
    }
    while (this.rows.length < wanted) {
      this.addRow(this.rows.length, { kind: "open" });
    }
    this.refresh();
  }

  private addRow(index: number, seat: OtherSeat): void {
    const choices: Choice<"open" | Level>[] = [
      { value: "open", label: t("lobby", "Open, for a person") },
      ...LEVEL_ORDER.map((level) => ({ value: level, label: t("lobby", "Computer: %1", [levelName(level)]) })),
    ];
    const kind = new Choose<"open" | Level>(`seatKind${index}`, t("lobby", "Seat %1", [index + 2]), choices, seat.kind === "open" ? "open" : seat.level);
    const gender = new Choose<Gender>(`seatGender${index}`, t("NewGameDialog", "Male"), genderChoices(), seat.kind === "computer" ? seat.gender : this.random() < 0.5 ? "female" : "male");
    const name = textField({ name: `seatName${index}`, max: MAX_NAME_LENGTH, label: t("lobby", "Seat %1", [index + 2]) });
    const element = el("div", { class: "ng-seat" }, el("span", { class: "ng-label", text: t("NewGameDialog", "%1.", [index + 2]) }), kind.element, name, gender.element);
    const row: Row = { element, kind, name, gender, drawn: "" };
    name.value = seat.kind === "computer" ? seat.name : "";
    row.drawn = name.value;
    const sync = () => {
      const computer = kind.value !== "open";
      name.hidden = !computer;
      gender.element.hidden = !computer;
    };
    const redraw = () => {
      if (kind.value === "open") {
        return;
      }
      if (name.value === "" || name.value === row.drawn) {
        row.drawn = this.draw(row, index);
        name.value = row.drawn;
      }
    };
    kind.onChange(() => {
      redraw();
      sync();
      this.refresh();
    });
    gender.onChange(() => {
      redraw();
      this.refresh();
    });
    name.addEventListener("input", () => this.refresh());
    sync();
    this.rows.push(row);
    this.rowsBox.append(element);
  }

  private draw(row: Row, seat: number): string {
    const taken = [this.host.name, ...this.rows.filter((other) => other !== row).map((other) => other.name.value)];
    const level = row.kind.value === "open" ? defaultLevel(seat) : row.kind.value;
    return drawName({ gender: row.gender.value, strategy: level }, currentLanguage(), nameCatalogue(), taken, seat + 2, this.random);
  }

  private refresh(): void {
    const made = this.read();
    this.setup = made;
    const wrong = tableError(made, this.host);
    setText(this.options.summary, summaryOf(tableSettingsFor(made, this.host)));
    setText(this.error, this.refusal.or(wrong ?? ""));
    this.create.disabled = wrong !== null || this.waiting;
  }

  focusDefault(): void {
    this.create.focus();
  }
}

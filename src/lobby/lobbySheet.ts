import { portraitUrl } from "../assets/assets";
import { el, setAttr, setSrc, setText } from "../dom/el";
import { t } from "../i18n/t";
import type { Level, TableState } from "../net/protocol";
import type { Sheet } from "../sheets/layer";
import { SheetButton } from "../sheets/parts";
import { Choose, formRow, numberField, type Choice } from "./controls";
import { levelChoices } from "./newGameSheet";
import { TURN_TIMERS, timerLabel } from "./online";
import { OptionsBlock, type Options } from "./options";
import { fewestSeats, lobbyFor, presenceText, seatCountFrom, summaryOf, type LobbySeat, type LobbyView } from "./lobby";
import { MAX_SEATS, MIN_SEATS, levelName } from "./setup";

// An online table's lobby: its code and link, who sits where, and, for its host, the seats and the
// settings and the start. Everyone else sees the same table and may take an open seat. A sheet, since
// it stands over the table until the game starts, and the menu bar's sheets open over it.

export interface LobbyActions {
  takeSeat(seat: number): void;
  seat(seat: number, choice: "open" | Level): void;
  seatCount(count: number): void;
  options(options: Options): void;
  replacement(level: Level): void;
  turnTimer(ms: number): void;
  fill(level: Level): void;
  start(): void;
  leave(): void;
}

class SeatRow {
  readonly element: HTMLElement;
  private readonly picture = el("img", { attrs: { alt: "", draggable: "false" } });
  private readonly name = el("span", { class: "lobby-name" });
  private readonly tags = el("span", { class: "lobby-tags" });
  private readonly take = new SheetButton(t("lobby", "Take this seat"), "quiet", "take-seat");
  private readonly kind: Choose<"open" | Level>;

  constructor(private readonly index: number, actions_: LobbyActions) {
    const choices: Choice<"open" | Level>[] = [
      { value: "open", label: t("lobby", "Open, for a person") },
      ...levelChoices().map((choice) => ({ value: choice.value, label: t("lobby", "Computer: %1", [choice.label]), title: choice.title })),
    ];
    this.kind = new Choose<"open" | Level>(`lobbySeat${index}`, t("lobby", "Seat %1", [index + 1]), choices, "open");
    this.kind.onChange(() => actions_.seat(this.index, this.kind.value));
    this.take.onClick(() => actions_.takeSeat(this.index));
    this.take.element.classList.add("small");
    this.element = el(
      "div",
      { class: "lobby-seat", data: { seat: String(index) } },
      el("div", { class: "portrait" }, this.picture),
      el("div", { class: "lobby-who" }, this.name, this.tags),
      el("div", { class: "lobby-controls" }, this.take.element, this.kind.element),
    );
  }

  update(seat: LobbySeat, view: LobbyView): void {
    this.element.hidden = false;
    this.element.dataset.kind = seat.kind;
    setSrc(this.picture, seat.avatar === "" ? null : (portraitUrl(seat.avatar) ?? null));
    this.element.classList.toggle("you", seat.you);
    this.element.classList.toggle("away", seat.presence === "away");
    setText(this.name, seat.kind === "open" ? t("lobby", "Open seat") : seat.name);
    this.name.classList.toggle("muted", seat.kind === "open");

    const tags: string[] = [];
    if (seat.host) {
      tags.push(t("lobby", "Host"));
    }
    if (seat.you) {
      tags.push(t("lobby", "You"));
    }
    if (seat.kind === "computer" && seat.level !== null) {
      tags.push(levelName(seat.level));
    }
    const presence = presenceText(seat.presence);
    if (presence !== "") {
      tags.push(presence);
    }
    this.tags.replaceChildren(...tags.map((tag) => el("span", { class: "pill", text: tag })));

    // Anyone may move to an open seat. The host may also make a seat open, or a computer player, as
    // long as nobody sits in it.
    this.take.element.hidden = seat.kind !== "open";
    const changeable = view.isHost && seat.kind !== "human";
    this.kind.element.hidden = !changeable;
    if (changeable) {
      this.kind.value = seat.kind === "computer" && seat.level !== null ? seat.level : "open";
    }
    setAttr(this.element, "aria-label", seat.kind === "open" ? t("lobby", "Open seat") : seat.name);
  }

  hide(): void {
    this.element.hidden = true;
  }
}

export class LobbySheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title", attrs: { id: "sheet-lobby-title" } });
  private readonly meta = el("div", { class: "sheet-meta", attrs: { role: "status" } });
  private readonly link = el("input", { class: "field link", attrs: { type: "text", readonly: "", "aria-label": t("lobby", "Link to this table") } });
  private readonly copy = new SheetButton(t("lobby", "Copy link"), "quiet", "copy");
  private readonly rows: SeatRow[] = [];
  private readonly rowsBox = el("div", { class: "lobby-seats" });
  private readonly options = new OptionsBlock("lobby");
  private readonly seatCount = numberField({ name: "lobbySeats", min: MIN_SEATS, max: MAX_SEATS, label: t("lobby", "Seats"), value: 4 });
  private readonly replacement = new Choose<Level>("lobbyReplacement", t("lobby", "Stands in"), levelChoices(), "reckoner-beta");
  private readonly timer = new Choose<string>(
    "lobbyTimer",
    t("lobby", "A turn may take"),
    TURN_TIMERS.map((ms): Choice<string> => ({ value: String(ms), label: timerLabel(ms) })),
    "60000",
  );
  private readonly settingsHead = el("summary", { class: "lobby-settings-head" });
  // The host's controls for the game, folded away until they are wanted, so the seats and Start stay in view.
  private readonly hostControls = el(
    "details",
    { class: "lobby-host" },
    this.settingsHead,
    ...this.options.elements,
    el("div", { class: "ng-grid ng-more" }, ...formRow(t("lobby", "Seats"), this.seatCount), ...formRow(t("lobby", "Stands in"), this.replacement.element), ...formRow(t("lobby", "A turn may take"), this.timer.element)),
  );
  private readonly guestSummary = el("div", { class: "sheet-note lobby-summary" });
  private readonly note = el("div", { class: "lobby-note", attrs: { role: "status" } });
  private readonly leave = new SheetButton(t("lobby", "Leave table"), "quiet", "leave");
  private readonly fillLevel = new Choose<Level>("fillLevel", t("lobby", "Level"), levelChoices(), "low-risk");
  private readonly fill = new SheetButton(t("lobby", "Fill open seats"), "quiet", "fill");
  private readonly start = new SheetButton(t("lobby", "Start game"), "primary", "start");
  private readonly fillBox = el("div", { class: "lobby-fill" }, this.fillLevel.element, this.fill.element);
  private view: LobbyView | null = null;
  private table: TableState | null = null;

  constructor(private readonly handlers: LobbyActions) {
    this.link.style.setProperty("flex", "1 1 auto");
    const share = el("div", { class: "ng-line lobby-share" }, this.link, this.copy.element);
    this.element = el(
      "section",
      { class: "sheet lobby", data: { sheet: "lobby" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-lobby-title" } },
      this.title,
      this.meta,
      share,
      this.rowsBox,
      this.hostControls,
      this.guestSummary,
      this.note,
      el("div", { class: "sheet-actions lobby-actions" }, this.leave.element, this.fillBox, this.start.element),
    );
    this.copy.onClick(() => void this.copyLink());
    this.leave.onClick(() => handlers.leave());
    this.start.onClick(() => handlers.start());
    this.fill.onClick(() => handlers.fill(this.fillLevel.value));
    this.seatCount.addEventListener("change", () => {
      const count = seatCountFrom(this.seatCount.value);
      if (count === null) {
        this.seatCount.value = String(this.view?.seats.length ?? "");
      } else {
        handlers.seatCount(count);
      }
    });
    this.replacement.onChange(() => handlers.replacement(this.replacement.value));
    this.timer.onChange(() => handlers.turnTimer(Number(this.timer.value)));
    this.options.onChange(() => handlers.options(this.options.read()));
    this.options.summary.hidden = true;
  }

  private async copyLink(): Promise<void> {
    let done = false;
    try {
      await navigator.clipboard.writeText(this.link.value);
      done = true;
    } catch {
      this.link.select();
      done = document.execCommand("copy");
    }
    setText(this.copy.element, done ? t("lobby", "Copied") : t("lobby", "Press Ctrl+C"));
    window.setTimeout(() => setText(this.copy.element, t("lobby", "Copy link")), 2000);
  }

  // Fills the lobby from the table, in place. A control the person is using is not written over by
  // the table's word on it, which may be a step behind their hand.
  update(table: TableState, address: string): void {
    this.table = table;
    const view = lobbyFor(table);
    this.view = view;
    setText(this.title, t("lobby", "Table %1", [view.code]));
    setText(this.meta, view.isHost ? t("lobby", "Fill every seat, then start the game.") : t("lobby", "Waiting for the host to start the game."));
    this.link.value = address;

    view.seats.forEach((seat, index) => {
      while (this.rows.length <= index) {
        const row = new SeatRow(this.rows.length, this.handlers);
        this.rows.push(row);
        this.rowsBox.append(row.element);
      }
      this.rows[index].update(seat, view);
    });
    for (let index = view.seats.length; index < this.rows.length; index++) {
      this.rows[index].hide();
    }

    this.hostControls.hidden = !view.isHost;
    this.guestSummary.hidden = view.isHost;
    setText(this.guestSummary, summaryOf(view.settings));
    setText(this.settingsHead, `${t("lobby", "Game settings")}: ${summaryOf(view.settings)}`);
    if (view.isHost && !this.hostControls.contains(document.activeElement)) {
      this.options.write(view.settings);
      this.seatCount.value = String(view.seats.length);
      this.replacement.value = view.settings.replacement ?? "reckoner-beta";
      this.timer.value = String(view.settings.turnTimer ?? 60000);
    }
    this.seatCount.min = String(fewestSeats(view));

    this.fillBox.hidden = !view.isHost || view.open === 0;
    this.start.element.hidden = !view.isHost;
    this.start.disabled = !view.canStart;
    setText(
      this.note,
      view.isHost && view.open === 1
        ? t("lobby", "One seat is still open: ask someone to join, or fill it with a computer player.")
        : view.isHost && view.open > 1
          ? t("lobby", "%1 seats are still open: ask people to join, or fill them with computer players.", [view.open])
          : "",
    );
  }

  get current(): LobbyView | null {
    return this.view;
  }

  get tableState(): TableState | null {
    return this.table;
  }

  focusDefault(): void {
    if (this.view?.isHost === true && this.view.canStart) {
      this.start.focus();
    } else {
      this.leave.focus();
    }
  }
}

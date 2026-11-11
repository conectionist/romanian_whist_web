import type { Random } from "../lobby/catalogue";
import { fillMessages, lobbyFor, seatChoice, settingsChange, withSeatCount } from "../lobby/lobby";
import { tableSettingsFor, type TableSetup } from "../lobby/online";
import type { Options } from "../lobby/options";
import { settingsFor, type Setup } from "../lobby/setup";
import type { ClientMessage, Level, Profile, ServerMessage } from "../net/protocol";
import { continueRound, createTable, joinTable, takeSeat, updateSettings } from "../net/send";
import type { Pace } from "./motion";
import { NOTHING_ASKED, atTable, canExit, canPause, gameOn, isOnline, isSolo, sheetFor, wantsPause, type MenuSheet, type SheetName, type UiState } from "./sheets";
import type { Store } from "./store";

// What the page remembers between visits: the last New Game and who you are online.
export interface Memory {
  setup(): Setup;
  keepSetup(setup: Setup): void;
  profile(): Profile | null;
  keepProfile(profile: Profile): void;
}

export interface FlowDeps {
  send(message: ClientMessage): boolean;
  store: Store;
  // The sheet that is up, or its words, changed: draw it.
  changed(): void;
  // Keeps the viewer's animation speed.
  keepPace(pace: Pace): void;
  memory: Memory;
  random?: Random;
}

// What the player's clicks and keys on the sheets do: which sheet is asked for, and what goes to the
// server for it. Pausing, Continue, Play again, Main menu, New Game, Settings and the lobby's controls
// are all messages, and the pause is held for as long as a sheet over a solo game asks for it, as the
// desktop holds its game.
export class Flow {
  ui: UiState = NOTHING_ASKED;
  // Whether the server has been told to hold the game, or has said it does: asked again only when
  // what a sheet wants changes.
  private paused = false;
  // The round whose Continue went out, until its hold ends.
  private continued: number | null = null;
  // Set when a way out of the table goes, until the table is gone: nothing is shown for a table being left.
  private leaving = false;

  constructor(private readonly deps: FlowDeps) {}

  private get state() {
    return this.deps.store.state;
  }

  // The sheet that is up now.
  shown(): SheetName | null {
    return this.leaving ? null : sheetFor(this.state, this.ui);
  }

  // Whether Continue has already gone out for the round that is held.
  continuedHold(): boolean {
    return this.state.held !== null && this.continued === this.state.held.round;
  }

  // The address named a table that the person is not at: the join sheet asks who they are.
  askToJoin(code: string): void {
    if (!atTable(this.state)) {
      this.ui = { ...this.ui, joinCode: code };
      this.deps.changed();
    }
  }

  // Told of each message as it is applied, before the table is drawn.
  onApply(message: ServerMessage): void {
    switch (message.type) {
      case "sync": {
        this.leaving = false;
        this.continued = null;
        // The server is the one that knows whether the game is held: a table paused before a reload
        // or a lost connection is held still, and the pause sheet is the way to let it go.
        this.paused = this.state.table?.paused === true;
        if (this.paused && this.ui.menu === null && !this.ui.pauseMenu && canPause(this.state) && isSolo(this.state)) {
          this.ui = { ...this.ui, pauseMenu: true };
        }
        break;
      }
      case "tableState":
        if (message.state === "closed") {
          this.leaving = false;
          this.paused = false;
          const keeps = this.ui.menu === "rules" || this.ui.menu === "settings" || this.ui.menu === "new-game" || this.ui.menu === "online" || this.ui.menu === "create-table";
          this.ui = { ...this.ui, menu: keeps ? this.ui.menu : null, pauseMenu: false };
        }
        break;
      case "game":
        if (message.event.kind === "gameStarted") {
          this.continued = null;
        }
        break;
      default:
        break;
    }
    this.settle();
  }

  // Brings what is asked for in line with what the game allows, and the server's hold with what is
  // asked for.
  private settle(): void {
    if (this.ui.pauseMenu && !canExit(this.state)) {
      this.ui = { ...this.ui, pauseMenu: false };
    }
    // Once there is a table the sheets that made one have done their work, and the address no longer
    // asks to join one.
    if (atTable(this.state) && (this.ui.menu === "online" || this.ui.menu === "create-table" || this.ui.joinCode !== null)) {
      this.ui = { ...this.ui, menu: this.ui.menu === "online" || this.ui.menu === "create-table" ? null : this.ui.menu, joinCode: null };
    }
    this.hold();
  }

  private hold(): void {
    // A game that is over, or a table that is gone, has nothing held.
    if (!gameOn(this.state) || this.leaving) {
      this.paused = false;
      return;
    }
    const want = wantsPause(this.state, this.ui);
    if (want !== this.paused && this.deps.send({ type: want ? "pause" : "resume" })) {
      this.paused = want;
    }
  }

  private ask(ui: UiState): void {
    this.ui = ui;
    this.settle();
    this.deps.changed();
  }

  openMenu(sheet: MenuSheet): void {
    this.ask({ ...this.ui, menu: sheet });
  }

  closeMenu(): void {
    this.ask({ ...this.ui, menu: null });
  }

  // The join sheet, closed without joining: the address is no longer asked about.
  cancelJoin(): void {
    this.ask({ ...this.ui, menu: null, joinCode: null });
  }

  // Esc closes the sheet from the menu bar or a corner button, as the mock-up's does, and otherwise
  // raises the pause menu, or drops it again.
  escape(): void {
    if (this.ui.menu !== null) {
      this.closeMenu();
    } else if (this.ui.pauseMenu || canExit(this.state)) {
      this.ask({ ...this.ui, pauseMenu: !this.ui.pauseMenu });
    }
  }

  // Exit: the pause menu, or at an online table the offer to leave, over a sheet from the menu bar if
  // one is up. The sheet comes down with the hold kept, so the game is never let go between the two.
  exit(): void {
    if (canExit(this.state)) {
      this.ask({ ...this.ui, menu: null, pauseMenu: true });
    }
  }

  resume(): void {
    this.ask({ ...this.ui, pauseMenu: false });
  }

  continueRound(): void {
    const held = this.state.held;
    if (held === null || this.continuedHold()) {
      return;
    }
    if (this.deps.send(continueRound(held.round))) {
      this.continued = held.round;
      this.deps.changed();
    }
  }

  playAgain(): void {
    this.deps.send({ type: "startGame" });
  }

  // Leaves the table, and with it any hold: the table closes, or at an online table a computer takes
  // the seat, so there is nothing to let go.
  mainMenu(): void {
    if (this.deps.send({ type: "leaveTable" })) {
      this.leaving = true;
      this.paused = false;
      this.ui = { ...this.ui, menu: null, pauseMenu: false };
      this.deps.changed();
    }
  }

  // A table is left before another is made: the server closes or hands over the one you are at as it
  // takes the message, so the next is answered at no table.
  private leaveFirst(): boolean {
    if (!atTable(this.state)) {
      return true;
    }
    if (!this.deps.send({ type: "leaveTable" })) {
      return false;
    }
    this.leaving = true;
    this.paused = false;
    return true;
  }

  // New Game's Deal: the setup is remembered for the next, and the game made. Over a game that is
  // running or has ended, that table is left first.
  deal(setup: Setup): void {
    this.deps.memory.keepSetup(setup);
    if (this.leaveFirst() && this.deps.send({ type: "createSolo", settings: settingsFor(setup, this.deps.random) })) {
      this.ui = { ...this.ui, menu: null, pauseMenu: false };
      this.deps.changed();
    }
  }

  // Play online's first step: who you are is kept, and the table is set up.
  chooseCreate(profile: Profile): void {
    this.deps.memory.keepProfile(profile);
    this.openMenu("create-table");
  }

  createTable(setup: TableSetup): void {
    const profile = this.deps.memory.profile();
    if (profile !== null && this.leaveFirst()) {
      this.deps.send(createTable(tableSettingsFor(setup, profile, this.deps.random), profile));
      this.deps.changed();
    }
  }

  join(code: string, profile: Profile): void {
    this.deps.memory.keepProfile(profile);
    if (this.leaveFirst()) {
      this.deps.send(joinTable(code, profile));
    }
  }

  // The lobby's controls, each a message for the table. Only the host's are accepted by the server;
  // the sheet shows them to the host alone.
  takeSeat(seat: number): void {
    this.deps.send(takeSeat(seat));
  }

  chooseSeat(seat: number, choice: "open" | Level): void {
    this.deps.send(seatChoice(seat, choice));
  }

  changeSeatCount(count: number): void {
    const table = this.state.table;
    if (table !== null) {
      this.deps.send(withSeatCount(table, count));
    }
  }

  changeOptions(options: Options): void {
    const table = this.state.table;
    if (table !== null) {
      this.deps.send(settingsChange(table, options));
    }
  }

  changeReplacement(level: Level): void {
    const table = this.state.table;
    if (table !== null) {
      this.deps.send(settingsChange(table, { replacement: level }));
    }
  }

  changeTurnTimer(ms: number): void {
    const table = this.state.table;
    if (table !== null) {
      this.deps.send(settingsChange(table, { turnTimer: ms }));
    }
  }

  fillSeats(level: Level): void {
    const table = this.state.table;
    if (table !== null) {
      for (const message of fillMessages(lobbyFor(table), level)) {
        this.deps.send(message);
      }
    }
  }

  // The settings sheet moved a control. The speed and the wait are remembered for the next game and go
  // to the table of a solo game, which applies them at once; the animation speed is the viewer's own.
  changeSettings(values: { botSpeed: number; waitAfterRound: boolean; pace: Pace }): void {
    this.deps.keepPace(values.pace);
    // A table that is online has the speed and the wait it was made with: they are not the person's to
    // change, and not the next game's either.
    if (isOnline(this.state)) {
      return;
    }
    this.deps.memory.keepSetup({ ...this.deps.memory.setup(), botSpeed: values.botSpeed, waitAfterRound: values.waitAfterRound });
    const table = this.state.table;
    if (table !== null && isSolo(this.state)) {
      this.deps.send(updateSettings({ ...table.settings, botSpeed: values.botSpeed, waitAfterRound: values.waitAfterRound }));
    }
  }
}

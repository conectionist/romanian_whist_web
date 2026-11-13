import type { Random } from "../lobby/catalogue";
import { fillMessages, lobbyFor, seatChoice, settingsChange, withSeatCount } from "../lobby/lobby";
import { tableSettingsFor, type TableSetup } from "../lobby/online";
import type { Options } from "../lobby/options";
import { settingsFor, type Setup } from "../lobby/setup";
import type { ClientMessage, Level, Profile, ServerMessage } from "../net/protocol";
import { continueRound, createTable, joinTable, takeSeat, updateSettings } from "../net/send";
import type { Pace } from "./motion";
import { NOTHING_ASKED, atTable, canExit, canLeave, canPause, gameOn, holdAwaitsYou, isOnline, scoredRound, isSolo, sheetFor, wantsPause, type MenuSheet, type SheetName, type UiState } from "./sheets";
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
// server for it. A solo game is held for as long as a sheet over it asks, as the desktop holds its own.
export class Flow {
  ui: UiState = NOTHING_ASKED;
  // Whether the server has been told to hold the game, or has said it does: asked again only when
  // what a sheet wants changes.
  private paused = false;
  // The round whose Continue went out, until its hold ends.
  private continued: number | null = null;
  // Set when a way out of the table goes, until the table is gone: nothing is shown for a table being left.
  private leaving = false;
  // Set from the asking for a table until the server's answer: the sheet that asked stays up for it.
  private asked = false;
  // Whether a table was left for the one asked for, which a refusal then cannot give back.
  private leftForIt = false;
  // What Leave table goes on to when the question was raised by a sheet, and the sheet Stay returns to.
  private afterLeave: { sheet: MenuSheet; run(): void } | null = null;

  constructor(private readonly deps: FlowDeps) {}

  private get state() {
    return this.deps.store.state;
  }

  // The sheet that is up now.
  shown(): SheetName | null {
    // The sheet that asked for a table is the one thing shown while the table before it goes.
    if (this.asked && this.ui.menu !== null) {
      return this.ui.menu;
    }
    return this.leaving ? null : sheetFor(this.state, this.ui);
  }

  // Whether a sheet waits for the server's word on the table it asked for.
  asking(): boolean {
    return this.asked;
  }

  // Whether the table that was left for a refused one is gone for good.
  lostTable(): boolean {
    return this.leftForIt;
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
        // An answer lost with the connection never comes: at no table, nothing is waited for.
        if (!atTable(this.state)) {
          this.asked = false;
          this.leftForIt = false;
        }
        // What was asked between games or of a round is for the game it was asked in, whose start a
        // sync may have taken the place of.
        if (gameOn(this.state)) {
          this.ui = { ...this.ui, backAtTable: false, dismissedRound: null };
        }
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
      case "error":
        if (!this.asked) {
          // A refusal may be of the way out itself, and then the table is still there to show.
          this.leaving = false;
        } else {
          // The table asked for was refused, or the leaving that went before it: either way the
          // sheet stays, for another try.
          this.asked = false;
          this.leaving = false;
          if (atTable(this.state)) {
            this.leftForIt = false;
          }
        }
        break;
      case "game":
        if (message.event.kind === "gameStarted") {
          this.continued = null;
          this.ui = { ...this.ui, backAtTable: false, dismissedRound: null };
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
    const made = atTable(this.state) && !this.leaving;
    if (made && (this.ui.menu === "online" || this.ui.menu === "create-table" || this.ui.joinCode !== null || this.asked)) {
      const done = this.ui.menu === "online" || this.ui.menu === "create-table" || this.asked;
      this.ui = { ...this.ui, menu: done ? null : this.ui.menu, joinCode: null };
      this.asked = false;
      this.leftForIt = false;
    }
    if (!this.ui.pauseMenu) {
      this.afterLeave = null;
    }
    if (this.ui.backAtTable && !atTable(this.state)) {
      this.ui = { ...this.ui, backAtTable: false };
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

  // Create a table was opened from Play online and goes back to it; every other sheet goes back to what is under it.
  closeMenu(): void {
    this.ask({ ...this.ui, menu: this.ui.menu === "create-table" ? "online" : null });
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
    } else if (this.ui.joinCode !== null && !atTable(this.state)) {
      this.cancelJoin();
    } else if (this.ui.pauseMenu && this.afterLeave !== null) {
      this.resume();
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
    const back = this.afterLeave?.sheet ?? null;
    this.ask({ ...this.ui, pauseMenu: false, menu: back ?? this.ui.menu });
  }

  // Continue lets a held round go, and may be sent before its hold arrives. A round the game only
  // rests on has nothing to let go, and its sheet is closed until the game moves on.
  continueRound(): void {
    const held = this.state.held;
    if (held === null) {
      const round = scoredRound(this.state);
      if (round === null) {
        return;
      }
      if (this.state.table?.settings.waitAfterRound === true) {
        if (this.continued !== round.index && this.deps.send(continueRound(round.index))) {
          this.continued = round.index;
          this.deps.changed();
        }
      } else {
        this.ask({ ...this.ui, dismissedRound: round.index });
      }
      return;
    }
    if (this.continuedHold() || !holdAwaitsYou(this.state)) {
      return;
    }
    if (this.deps.send(continueRound(held.round))) {
      this.continued = held.round;
      this.deps.changed();
    }
  }

  // From the results. A solo game's Play again opens New Game on the setup just played, as the
  // desktop's does; an online table's goes back to the table, where the host starts the next.
  playAgain(): void {
    if (isOnline(this.state)) {
      this.ask({ ...this.ui, backAtTable: true });
    } else {
      this.openMenu("new-game");
    }
  }

  // The host's Start in the lobby.
  startGame(): void {
    this.deps.send({ type: "startGame" });
  }

  // Leaves the table, and with it any hold: the table closes, or at an online table a computer takes
  // the seat, so there is nothing to let go.
  mainMenu(): void {
    if (this.afterLeave !== null) {
      const next = this.afterLeave;
      this.afterLeave = null;
      this.ui = { ...this.ui, menu: next.sheet, pauseMenu: false };
      next.run();
      return;
    }
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
    // An online table goes on without the person, who can join it again by its code.
    this.leftForIt = isSolo(this.state);
    this.paused = false;
    return true;
  }

  // Sends the asking for a table, after leaving the one the person is at. The sheet that asked stays
  // up until the server answers: a table closes it, and a refusal is said in it.
  private askFor(message: ClientMessage): void {
    this.leftForIt = false;
    if (this.leaveFirst() && this.deps.send(message)) {
      this.asked = true;
    }
    this.deps.changed();
  }

  // New Game's Deal: the setup is remembered for the next, and the game made. Over a solo game that
  // is running or has ended, that table is left first, as the desktop's New Game replaces its game.
  // At an online table other people are playing, so the person is asked first.
  deal(setup: Setup): void {
    this.deps.memory.keepSetup(setup);
    const make = () => this.askFor({ type: "createSolo", settings: settingsFor(setup, this.deps.random) });
    if (isOnline(this.state) && canLeave(this.state)) {
      this.afterLeave = { sheet: "new-game", run: make };
      this.ask({ ...this.ui, menu: null, pauseMenu: true });
    } else {
      make();
    }
  }

  // Play online's first step: who you are is kept, and the table is set up.
  chooseCreate(profile: Profile): void {
    this.deps.memory.keepProfile(profile);
    this.openMenu("create-table");
  }

  createTable(setup: TableSetup): void {
    const profile = this.deps.memory.profile();
    if (profile !== null) {
      this.askFor(createTable(tableSettingsFor(setup, profile, this.deps.random), profile));
    }
  }

  join(code: string, profile: Profile): void {
    this.deps.memory.keepProfile(profile);
    this.askFor(joinTable(code, profile));
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

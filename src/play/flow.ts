import type { ClientMessage, ServerMessage } from "../net/protocol";
import { continueRound, updateSettings } from "../net/send";
import type { Pace } from "./motion";
import { NOTHING_ASKED, canPause, gameOn, isSolo, sheetFor, wantsPause, type MenuSheet, type SheetName, type UiState } from "./sheets";
import type { Store } from "./store";

export interface FlowDeps {
  send(message: ClientMessage): boolean;
  store: Store;
  // The sheet that is up, or its words, changed: draw it.
  changed(): void;
  // Keeps the viewer's animation speed.
  keepPace(pace: Pace): void;
}

// What the player's clicks and keys on the sheets do: which sheet is asked for, and what goes to the
// server for it. Pausing, Continue, Play again, Main menu and Settings are all messages, and the
// pause is held for as long as a sheet over a solo game asks for it, as the desktop holds its game.
export class Flow {
  ui: UiState = NOTHING_ASKED;
  // Whether the server has been told to hold the game, or has said it does: asked again only when
  // what a sheet wants changes.
  private paused = false;
  // The round whose Continue went out, until its hold ends.
  private continued: number | null = null;
  // Set when Main menu goes out, until the table is gone: nothing is shown for a table being left.
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
          this.ui = { menu: this.ui.menu === "rules" || this.ui.menu === "settings" ? this.ui.menu : null, pauseMenu: false };
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
    if (this.ui.pauseMenu && !canPause(this.state)) {
      this.ui = { ...this.ui, pauseMenu: false };
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

  // Esc closes the sheet from the menu bar or a corner button, as the mock-up's does, and otherwise
  // raises the pause menu, or drops it again.
  escape(): void {
    if (this.ui.menu !== null) {
      this.closeMenu();
    } else if (this.ui.pauseMenu || canPause(this.state)) {
      this.ask({ ...this.ui, pauseMenu: !this.ui.pauseMenu });
    }
  }

  // Exit: the pause menu, over a sheet from the menu bar if one is up. The sheet comes down with the
  // hold kept, so the game is never let go between the two.
  exit(): void {
    if (canPause(this.state)) {
      this.ask({ menu: null, pauseMenu: true });
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

  // Leaves the table, and with it any hold: the table closes, so there is nothing to let go.
  mainMenu(): void {
    if (this.deps.send({ type: "leaveTable" })) {
      this.leaving = true;
      this.paused = false;
      this.ui = { menu: null, pauseMenu: false };
      this.deps.changed();
    }
  }

  // The settings sheet moved a control. The speed and the wait go to the table of a solo game, which
  // applies them at once; the animation speed is the viewer's own.
  changeSettings(values: { botSpeed: number; waitAfterRound: boolean; pace: Pace }): void {
    this.deps.keepPace(values.pace);
    const table = this.state.table;
    if (table !== null && isSolo(this.state)) {
      this.deps.send(updateSettings({ ...table.settings, botSpeed: values.botSpeed, waitAfterRound: values.waitAfterRound }));
    }
  }
}

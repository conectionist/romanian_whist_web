import type { MenuSheet, SheetName } from "../play/sheets";
import type { StoreState } from "../play/store";
import { SettingsSheet, type SettingsValues } from "./settingsSheet";
import { GameOverSheet, failureFields, fieldsFor as gameOverFields, resultFor } from "./gameOverSheet";
import { HistorySheet, fieldsFor as historyFields } from "./historySheet";
import { LastTrickSheet, fieldsFor as lastTrickFields } from "./lastTrickSheet";
import { SheetLayer } from "./layer";
import { PauseSheet } from "./pauseSheet";
import { RoundSheet, fieldsFor as roundFields } from "./roundSheet";
import { RulesSheet, configOf, linesFor, type RulesConfig } from "./rulesSheet";
import { seatingOf } from "./seating";

// What the sheets do, which the page binds to the flow and the look tool leaves empty.
export interface SheetActions {
  closeMenu(): void;
  openMenu(sheet: MenuSheet): void;
  continueRound(): void;
  playAgain(): void;
  mainMenu(): void;
  resume(): void;
  settingsChanged(values: SettingsValues): void;
}

export const NO_ACTIONS: SheetActions = {
  closeMenu: () => undefined,
  openMenu: () => undefined,
  continueRound: () => undefined,
  playAgain: () => undefined,
  mainMenu: () => undefined,
  resume: () => undefined,
  settingsChanged: () => undefined,
};

// What the sheets show when there is no table to read it from: the game New Game would deal, and the
// speed the player last chose.
export interface Defaults {
  rules(): RulesConfig;
  settings(): SettingsValues;
}

// The seven sheets over the layer. Each is made once, and filled from the store when it is shown.
export class Sheets {
  readonly layer: SheetLayer;
  private readonly round: RoundSheet;
  private readonly history: HistorySheet;
  private readonly lastTrick: LastTrickSheet;
  private readonly gameOver: GameOverSheet;
  private readonly rules: RulesSheet;
  private readonly settings: SettingsSheet;
  private readonly pause: PauseSheet;
  private readonly byName: Record<SheetName, { element: HTMLElement; focusDefault(): void }>;

  constructor(
    actions: SheetActions,
    private readonly defaults: Defaults,
  ) {
    this.round = new RoundSheet({ history: () => actions.openMenu("history"), continueRound: () => actions.continueRound() });
    this.history = new HistorySheet({ close: () => actions.closeMenu() });
    this.lastTrick = new LastTrickSheet({ close: () => actions.closeMenu() });
    this.gameOver = new GameOverSheet({
      playAgain: () => actions.playAgain(),
      history: () => actions.openMenu("history"),
      mainMenu: () => actions.mainMenu(),
    });
    this.rules = new RulesSheet({ close: () => actions.closeMenu() });
    this.settings = new SettingsSheet({ changed: (values) => actions.settingsChanged(values), done: () => actions.closeMenu() });
    this.pause = new PauseSheet({ resume: () => actions.resume(), mainMenu: () => actions.mainMenu() });
    this.byName = {
      round: this.round,
      history: this.history,
      "last-trick": this.lastTrick,
      "game-over": this.gameOver,
      rules: this.rules,
      settings: this.settings,
      pause: this.pause,
    };
    this.layer = new SheetLayer(Object.values(this.byName));
  }

  // Shows this sheet, or none, filled from the store. `continued` is whether Continue has already
  // gone out for the round held.
  render(name: SheetName | null, state: StoreState, continued: boolean): void {
    if (name === null) {
      this.layer.show(null);
      return;
    }
    const seating = seatingOf(state);
    const currentRound = state.snapshot === null ? 0 : state.snapshot.round.index + 1;
    switch (name) {
      case "round": {
        const held = state.held;
        const result = held === null ? undefined : state.history.find((round) => round.index === held.round);
        // A hold whose round the history does not hold has nothing to show.
        if (result === undefined) {
          this.layer.show(null);
          return;
        }
        this.round.update(roundFields(result, seating), { continueDisabled: continued });
        break;
      }
      case "history":
        this.history.update(historyFields(state.history, seating));
        break;
      case "last-trick":
        this.lastTrick.update(lastTrickFields(state.lastTrick, seating, currentRound));
        break;
      case "game-over": {
        const result = resultFor(state);
        this.gameOver.update(state.stopped || result === null || state.snapshot?.status === "stopped" ? failureFields() : gameOverFields(result));
        break;
      }
      case "rules":
        this.rules.update(linesFor(state.table === null ? this.defaults.rules() : configOf(state.table.settings)));
        break;
      case "settings":
      case "pause":
        break;
    }
    // The sheet that is just up takes its starting values once: the controls are the player's while
    // it is open, and the table's word on them would take a control out of a hand that is moving it.
    if (this.layer.show(this.byName[name]) && name === "settings") {
      this.settings.setValues(
        state.table === null
          ? this.defaults.settings()
          : { ...this.defaults.settings(), botSpeed: state.table.settings.botSpeed, waitAfterRound: state.table.settings.waitAfterRound },
      );
    }
  }
}

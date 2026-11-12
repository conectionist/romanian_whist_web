import { CreateTableSheet } from "../lobby/createTableSheet";
import { LobbySheet, type LobbyActions } from "../lobby/lobbySheet";
import { NewGameSheet } from "../lobby/newGameSheet";
import type { TableSetup } from "../lobby/online";
import { OnlineSheet } from "../lobby/onlineSheet";
import { defaultProfile } from "../lobby/profile";
import { rulesOf, type Setup } from "../lobby/setup";
import type { Profile } from "../net/protocol";
import type { MenuSheet, SheetName } from "../play/sheets";
import { holdAwaitsYou, isOnline, inLobby, scoredRound } from "../play/sheets";
import type { StoreState } from "../play/store";
import { SettingsSheet, type SettingsValues } from "./settingsSheet";
import { GameOverSheet, failureFields, fieldsFor as gameOverFields, resultFor } from "./gameOverSheet";
import { HistorySheet, fieldsFor as historyFields } from "./historySheet";
import { LastTrickSheet, fieldsFor as lastTrickFields } from "./lastTrickSheet";
import { SheetLayer } from "./layer";
import { LeaveSheet } from "./leaveSheet";
import { PauseSheet } from "./pauseSheet";
import { RoundSheet, fieldsFor as roundFields } from "./roundSheet";
import { RulesSheet, configOf, linesFor } from "./rulesSheet";
import { seatingOf } from "./seating";

// What the sheets do, which the page binds to the flow and the look tool leaves empty.
export interface SheetActions extends LobbyActions {
  closeMenu(): void;
  openMenu(sheet: MenuSheet): void;
  continueRound(): void;
  playAgain(): void;
  mainMenu(): void;
  resume(): void;
  settingsChanged(values: SettingsValues): void;
  deal(setup: Setup): void;
  chooseCreate(profile: Profile): void;
  createTable(setup: TableSetup): void;
  join(code: string, profile: Profile): void;
  cancelJoin(): void;
}

const none = () => undefined;

export const NO_ACTIONS: SheetActions = {
  closeMenu: none,
  openMenu: none,
  continueRound: none,
  playAgain: none,
  mainMenu: none,
  resume: none,
  settingsChanged: none,
  deal: none,
  chooseCreate: none,
  createTable: none,
  join: none,
  cancelJoin: none,
  takeSeat: none,
  seat: none,
  seatCount: none,
  options: none,
  replacement: none,
  turnTimer: none,
  fill: none,
  start: none,
  leave: none,
};

// What the sheets start from when no table says: the last New Game, who you are, and the pace chosen.
export interface Remembered {
  setup(): Setup;
  profile(): Profile | null;
  pace(): SettingsValues["pace"];
}

// What a render knows besides the store.
export interface RenderContext {
  // Whether Continue has already gone out for the round held.
  continued: boolean;
  // The table the address names that the person has not joined.
  joinCode: string | null;
  // The link to the table, for sharing.
  address: string;
  // Who the round hold waits for, in words.
  waiting: string;
  // Whether the sheet that asked for a table still waits for the server's word on it.
  asking: boolean;
}

// The sheets over the layer. Each is made once, and filled from the store when it is shown.
export class Sheets {
  readonly layer: SheetLayer;
  private readonly round: RoundSheet;
  private readonly history: HistorySheet;
  private readonly lastTrick: LastTrickSheet;
  private readonly gameOver: GameOverSheet;
  private readonly rules: RulesSheet;
  private readonly settings: SettingsSheet;
  private readonly pause: PauseSheet;
  private readonly leave: LeaveSheet;
  private readonly newGame: NewGameSheet;
  private readonly online: OnlineSheet;
  private readonly createTable: CreateTableSheet;
  private readonly lobby: LobbySheet;
  private readonly byName: Record<SheetName, { element: HTMLElement; focusDefault(): void }>;
  // Whether the round sheet up holds the game, which is when it has the keyboard.
  private roundHolding = false;

  constructor(
    actions: SheetActions,
    private readonly memory: Remembered,
    random: () => number = Math.random,
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
    this.leave = new LeaveSheet({ leave: () => actions.mainMenu(), stay: () => actions.resume() });
    this.newGame = new NewGameSheet({ deal: (setup) => actions.deal(setup), cancel: () => actions.closeMenu() }, random);
    this.online = new OnlineSheet({
      create: (profile) => actions.chooseCreate(profile),
      join: (code, profile) => actions.join(code, profile),
      cancel: () => actions.cancelJoin(),
    });
    this.createTable = new CreateTableSheet({ create: (setup) => actions.createTable(setup), cancel: () => actions.closeMenu() }, random);
    this.lobby = new LobbySheet(actions);
    this.byName = {
      round: this.round,
      history: this.history,
      "last-trick": this.lastTrick,
      "game-over": this.gameOver,
      rules: this.rules,
      settings: this.settings,
      pause: this.pause,
      leave: this.leave,
      "new-game": this.newGame,
      online: this.online,
      "create-table": this.createTable,
      lobby: this.lobby,
    };
    this.layer = new SheetLayer(Object.values(this.byName));
  }

  // Shows this sheet, or none, filled from the store.
  render(name: SheetName | null, state: StoreState, context: RenderContext): void {
    if (name === null) {
      this.layer.show(null);
      this.roundHolding = false;
      return;
    }
    const seating = seatingOf(state);
    const currentRound = state.snapshot === null ? 0 : state.snapshot.round.index + 1;
    switch (name) {
      case "round": {
        const result = scoredRound(state);
        if (result === null) {
          this.layer.show(null);
          this.roundHolding = false;
          return;
        }
        const waitedOut = state.held !== null && (context.continued || !holdAwaitsYou(state));
        this.round.update(roundFields(result, seating), { continueDisabled: waitedOut, waiting: context.waiting });
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
        const failed = state.stopped || result === null || state.snapshot?.status === "stopped";
        this.gameOver.update(failed ? failureFields() : gameOverFields(result), { online: isOnline(state) });
        break;
      }
      case "rules":
        this.rules.update(linesFor(state.table === null ? rulesOf(this.memory.setup()) : configOf(state.table.settings)));
        break;
      case "leave":
        this.leave.update(!inLobby(state));
        break;
      case "lobby":
        if (state.table !== null) {
          this.lobby.update(state.table, context.address);
        }
        break;
      case "new-game":
        this.newGame.busy(context.asking);
        break;
      case "online":
        this.online.busy(context.asking);
        break;
      case "create-table":
        this.createTable.busy(context.asking);
        break;
      case "settings":
      case "pause":
        break;
    }
    // A sheet that is just up takes its starting values once: the controls are the player's while it
    // is open, and the table's word on them would take a control out of a hand that is moving it.
    // A round sheet the game only rests on goes by itself, so it leaves the keyboard where it is; the
    // hold that often follows it a moment later gives the keyboard to its Continue.
    const holding = name === "round" && state.held !== null;
    const shownNow = this.layer.show(this.byName[name], name !== "round" || holding);
    if (name === "round") {
      if (holding && !shownNow && !this.roundHolding) {
        this.round.focusDefault();
      }
    } else if (shownNow) {
      this.opened(name, state, context);
    }
    this.roundHolding = holding;
  }

  // The server refused what the sheet that is up asked for. Whether a sheet took the word: one that
  // asked says it where the person is looking, and otherwise it is for the page to say.
  refuse(text: string): boolean {
    for (const asker of [this.online, this.createTable, this.newGame]) {
      if (this.layer.current === asker) {
        asker.refuse(text);
        return true;
      }
    }
    return false;
  }

  private opened(name: SheetName, state: StoreState, context: RenderContext): void {
    switch (name) {
      case "settings": {
        const solo = state.table === null ? this.memory.setup() : state.table.settings;
        const values: SettingsValues = { botSpeed: solo.botSpeed, waitAfterRound: solo.waitAfterRound, pace: this.memory.pace() };
        this.settings.setValues(values);
        // At an online table the speed and the wait are the table's and were fixed when it was made.
        this.settings.showTable(!isOnline(state));
        break;
      }
      case "new-game":
        this.newGame.open(this.memory.setup());
        break;
      case "online":
        this.online.open(this.memory.profile() ?? defaultProfile(), context.joinCode);
        break;
      case "create-table":
        this.createTable.open(this.memory.profile() ?? defaultProfile());
        break;
      default:
        break;
    }
    this.layer.current?.focusDefault();
  }
}

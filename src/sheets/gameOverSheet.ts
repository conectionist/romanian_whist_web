import { el, setText } from "../dom/el";
import { t } from "../i18n/t";
import type { Snapshot, Standing } from "../net/protocol";
import type { Result, StoreState } from "../play/store";
import type { Sheet } from "./layer";
import { SheetButton, SheetTable, actions, joinNames, sheetNumber, type TableFields } from "./parts";

// The end of the game, src/ui/GameOverPanel.cpp: the final standings, who won, and the ways on.

// Who won, in a sentence, from the winners and not the standings: the first row of a drawn game names
// only one of them. A score below zero has its own sentence, which needs no plural form.
export function winnerAnnouncement(winners: readonly Standing[]): string {
  if (winners.length === 0) {
    return "";
  }
  // Every winner is on the same score by construction.
  const points = winners[0].score;
  if (winners.length === 1) {
    const name = winners[0].name;
    return points < 0
      ? t("gameover", "%1 wins with a score of %2.", [name, points])
      : t("gameover", "%1 wins with %n points.", [name], { n: points, one: "%1 wins with %n point." });
  }
  const names = joinNames(winners.map((winner) => winner.name));
  return points < 0
    ? t("gameover", "%1 tie for first with a score of %2.", [names, points])
    : t("gameover", "%1 tie for first with %n points.", [names], { n: points, one: "%1 tie for first with %n point." });
}

// The standings for a table reloaded after its game was over, whose sync has no gameOver. The
// server's ranking: 47, 47, 31 places 1, 1, 3, ties keep seat order, and every top score wins.
export function resultFromSnapshot(snapshot: Snapshot): Result {
  const rows = snapshot.seats
    .map((seat, index) => ({ seat: index, name: seat.name, score: seat.total }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
  const standings: Standing[] = [];
  rows.forEach((row, index) => {
    const tied = index > 0 && rows[index - 1].score === row.score;
    standings.push({ ...row, place: tied ? standings[index - 1].place : index + 1 });
  });
  const top = standings.length > 0 ? standings[0].score : 0;
  return { standings, winners: standings.filter((row) => row.score === top) };
}

// How the game ended, for the sheet: the server's word if it gave one, else what the snapshot says.
export function resultFor(state: Pick<StoreState, "result" | "snapshot">): Result | null {
  if (state.result !== null) {
    return state.result;
  }
  return state.snapshot === null ? null : resultFromSnapshot(state.snapshot);
}

export interface GameOverFields {
  title: string;
  announcement: string;
  // No table on the failure face: there are no standings.
  table: TableFields | null;
  failed: boolean;
}

export function standingsFor(result: Result): TableFields {
  return {
    columns: [
      { heading: t("GameOverPanel", "Place"), align: "left" },
      { heading: t("GameOverPanel", "Player"), align: "left" },
      { heading: t("GameOverPanel", "Total"), align: "right" },
      { heading: "", align: "left" },
    ],
    rows: result.standings.map((standing) => {
      // Bold and a star, not a colour alone, for whoever the server says won. The place is the
      // server's too, never a row counter.
      const winner = result.winners.some((won) => won.seat === standing.seat);
      return [
        { text: t("GameOverPanel", "%1.", [standing.place]), strong: winner, tall: true },
        { text: standing.name, strong: winner, tall: true },
        { text: sheetNumber(standing.score), strong: winner, tall: true },
        { text: winner ? "★" : "", strong: winner, tall: true },
      ];
    }),
  };
}

export function fieldsFor(result: Result): GameOverFields {
  return {
    title: t("GameOverPanel", "Final results"),
    announcement: winnerAnnouncement(result.winners),
    table: standingsFor(result),
    failed: false,
  };
}

// The other ending: the server could not go on with the game, so there are no standings and nothing
// to play again from. The sentence is the page's: the server sends no words.
export function failureFields(): GameOverFields {
  return {
    title: t("GameOverPanel", "The game ended in an error"),
    announcement: t("pagesheets", "The server could not go on with this game."),
    table: null,
    failed: true,
  };
}

export interface GameOverActions {
  playAgain(): void;
  history(): void;
  mainMenu(): void;
}

export class GameOverSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title", attrs: { id: "sheet-game-over-title" } });
  private readonly announcement = el("div", { class: "sheet-meta", attrs: { role: "status" } });
  private readonly table = new SheetTable();
  private readonly mainMenu = new SheetButton(t("GameOverPanel", "Main menu"), "quiet", "main-menu");
  private readonly history = new SheetButton(t("GameOverPanel", "Round history"), "quiet", "history");
  private readonly playAgain = new SheetButton(t("GameOverPanel", "Play again"), "primary", "play-again");
  private readonly buttons: HTMLElement;
  // Which arrangement of the buttons is shown: put again only when it changes, since taking a button
  // out of the page and putting it back takes the keyboard from it.
  private arranged: boolean | null = null;

  constructor(handlers: GameOverActions) {
    this.table.element.classList.add("sheet-after-head");
    this.buttons = actions(this.mainMenu, this.history, this.playAgain);
    this.element = el(
      "section",
      { class: "sheet", data: { sheet: "game-over" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-game-over-title" } },
      this.title,
      this.announcement,
      this.table.element,
      this.buttons,
    );
    this.mainMenu.onClick(handlers.mainMenu);
    this.history.onClick(handlers.history);
    this.playAgain.onClick(handlers.playAgain);
  }

  // At an online table the ways on are the table's: back to it, where the next game is started, or
  // out of it.
  update(fields: GameOverFields, options: { online: boolean } = { online: false }): void {
    this.mainMenu.setLabel(options.online ? t("online", "Leave table") : t("GameOverPanel", "Main menu"));
    this.playAgain.setLabel(options.online ? t("online", "Back to the table") : t("GameOverPanel", "Play again"));
    setText(this.title, fields.title);
    setText(this.announcement, fields.announcement);
    this.table.element.hidden = fields.table === null;
    if (fields.table !== null) {
      this.table.update(fields.table);
    }
    // The green one is last. A solo game's failure face has no Play again, so Main menu is the green one.
    const showPlayAgain = !fields.failed || options.online;
    this.playAgain.element.hidden = !showPlayAgain;
    this.mainMenu.setKind(showPlayAgain ? "quiet" : "primary");
    if (this.arranged !== showPlayAgain) {
      this.arranged = showPlayAgain;
      this.buttons.replaceChildren(
        ...(showPlayAgain
          ? [this.mainMenu.element, this.history.element, this.playAgain.element]
          : [this.history.element, this.mainMenu.element]),
      );
    }
  }

  focusDefault(): void {
    if (this.playAgain.element.hidden) {
      this.mainMenu.focus();
    } else {
      this.playAgain.focus();
    }
  }
}

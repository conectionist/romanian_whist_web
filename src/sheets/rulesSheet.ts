import { el } from "../dom/el";
import { t } from "../i18n/t";
import type { Settings, Structure } from "../net/protocol";
import type { Sheet } from "./layer";
import { SheetButton, actions } from "./parts";

// The rules at a glance, src/ui/RulesSheet.cpp: the rules for the game on the table, fitted to what
// is dealt. The sentences are display text worked out from the table's settings, as the desktop
// works them out; the page applies no rule.

// What the sentences depend on.
export interface RulesConfig {
  seats: number;
  structure: Structure;
  foreheadAndHidden: boolean;
  allOneCardForehead: boolean;
}

export function configOf(settings: Pick<Settings, "seats" | "structure" | "foreheadAndHidden" | "allOneCardForehead">): RulesConfig {
  return {
    seats: settings.seats.length,
    structure: settings.structure,
    foreheadAndHidden: settings.foreheadAndHidden,
    allOneCardForehead: settings.allOneCardForehead,
  };
}

// 3N + 12 rounds, and the two appended ones: N rounds of one card, 2 to 7, N of eight, 7 to 2 and N
// of one, whichever end the game starts from.
export function roundCount(config: Pick<RulesConfig, "seats" | "foreheadAndHidden">): number {
  return 3 * config.seats + 12 + (config.foreheadAndHidden ? 2 : 0);
}

// The lowest rank in an N-player deck, as an index into 2 3 4 5 6 7 8 9 10 J Q K A: two ranks per
// player down from the Ace, so Jack, 9, 7, 5 and 3 for two to six players.
export function lowestRank(seats: number): number {
  const ace = 12;
  return Math.min(Math.max(ace - (2 * seats - 1), 0), ace);
}

// "Jack", "9": a rank as the deck line reads it.
export function rankName(rank: number): string {
  switch (rank) {
    case 9:
      return t("rulessheet", "Jack");
    case 10:
      return t("rulessheet", "Queen");
    case 11:
      return t("rulessheet", "King");
    case 12:
      return t("rulessheet", "Ace");
    default:
      return String(rank + 2);
  }
}

// One sentence for each rule: the deck, the schedule, the special rounds (only when this game deals
// them), trump, bidding, play and scoring.
export function linesFor(config: RulesConfig): string[] {
  const { seats, foreheadAndHidden: appended } = config;
  const rounds = roundCount(config);
  const lines: string[] = [];

  lines.push(
    t("rulessheet", "%1 players use Ace down to %2: eight cards each, %3 in all.", [seats, rankName(lowestRank(seats)), 8 * seats]),
  );

  // Whole sentences, four of them, so a translator sees each as it reads and may put the appended
  // rounds where the language wants them.
  const options = { n: rounds };
  if (config.structure === "8-1-8") {
    lines.push(
      appended
        ? t(
            "rulessheet",
            "Rounds go 8 (×%1), 7 … 3, 2, 1 (×%1), 2, 3 … 7, 8 (×%1), then a Forehead and a Hidden round: %n rounds.",
            [seats],
            options,
          )
        : t("rulessheet", "Rounds go 8 (×%1), 7 … 3, 2, 1 (×%1), 2, 3 … 7, 8 (×%1): %n rounds.", [seats], options),
    );
  } else {
    lines.push(
      appended
        ? t(
            "rulessheet",
            "Rounds go 1 (×%1), 2, 3 … 7, 8 (×%1), 7 … 3, 2, 1 (×%1), then a Forehead and a Hidden round: %n rounds.",
            [seats],
            options,
          )
        : t("rulessheet", "Rounds go 1 (×%1), 2, 3 … 7, 8 (×%1), 7 … 3, 2, 1 (×%1): %n rounds.", [seats], options),
    );
  }

  // Said only for a game that deals them. With the appended pair, not quite every one: the Hidden
  // round at the end is a one-card round and keeps its own type.
  if (config.allOneCardForehead) {
    lines.push(
      appended
        ? t("rulessheet", "Every 1-card round is a Forehead round, except the Hidden round at the end.")
        : t("rulessheet", "Every 1-card round is a Forehead round."),
    );
  }
  if (config.allOneCardForehead || appended) {
    lines.push(t("rulessheet", "In a Forehead round you see everyone's card but your own while you bid."));
  }
  if (appended) {
    lines.push(t("rulessheet", "In a Hidden round nobody sees their card until the bidding is done."));
  }

  lines.push(
    t("rulessheet", "Below 8 cards, the next card is turned as trump. The 8-card rounds have no trump."),
    t(
      "rulessheet",
      "Everyone bids how many tricks they will take. The last bidder may not make the bids add up to the number of tricks.",
    ),
    t("rulessheet", "Follow suit if you can, otherwise trump if you can. You never have to overtrump."),
    t(
      "rulessheet",
      "An exact bid scores 5 + bid. A miss loses the difference. Five exact bids in a row earn +10, five misses cost 10; 1-card rounds neither add to a run nor break one.",
    ),
  );
  return lines;
}

export interface RulesActions {
  close(): void;
}

export class RulesSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly list = el("ul", { class: "sheet-body rules" });
  private readonly close = new SheetButton(t("rulessheet", "Close"), "primary", "close");
  private shown = "";

  constructor(handlers: RulesActions) {
    this.element = el(
      "section",
      { class: "sheet", data: { sheet: "rules" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-rules-title" } },
      el("h2", { class: "sheet-title", attrs: { id: "sheet-rules-title" }, text: t("rulessheet", "Rules at a glance") }),
      this.list,
      actions(this.close),
    );
    this.close.onClick(handlers.close);
  }

  update(lines: readonly string[]): void {
    const key = lines.join("\n");
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    this.list.replaceChildren(...lines.map((line) => el("li", { text: line })));
  }

  focusDefault(): void {
    this.close.focus();
  }
}

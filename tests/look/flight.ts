import type { Page } from "@playwright/test";

export interface Spot {
  x: number;
  y: number;
  width: number;
}

// A card of the fan played from the page, and where its flight starts: the middle of the card as it rests,
// as it is drawn (raised if it was picked) and as the flight's first frame has it.
export async function flightStart(page: Page, picked: boolean): Promise<{ rest: Spot; drawn: Spot; first: Spot }> {
  await page.goto("/look.html?shot=table-4-players&pace=normal");
  await page.waitForSelector("body[data-ready]");
  return page.evaluate((pick) => {
    const centre = (rect: DOMRect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width });
    const card = document.querySelector<HTMLElement>('.hand [data-card="KC"]')!;
    const rest = centre(card.getBoundingClientRect());
    if (pick) {
      card.classList.add("selected");
    }
    const drawn = centre(card.querySelector(".face")!.getBoundingClientRect());
    const look = (window as unknown as { look: { apply(text: string, animate: boolean): Promise<void> } }).look;
    const message = {
      type: "game",
      seq: 1,
      game: 1,
      event: { kind: "cardPlayed", seat: 0, card: "KC" },
      snapshot: {
        you: 0,
        status: "inProgress",
        phase: "playing",
        round: { index: 7, count: 26, type: "normal", tricks: 5, trick: 2, trump: "9S", leader: 3 },
        active: null,
        forbiddenBet: null,
        bets: { placed: 4, sum: 1 },
        table: { ledBy: 1, leadSuit: "C", cards: [{ seat: 1, card: "8C", winning: false }, { seat: 2, card: "7S", winning: false }, { seat: 3, card: "QS", winning: true }, { seat: 0, card: "KC", winning: false }] },
        seats: [
          { name: "Player", bidOrder: 2, bet: 0, won: 0, cards: 3, roundScore: 0, total: 23, wins: 0, losses: 1, hand: ["QD", "7C", "8H"] },
          { name: "Ana", bidOrder: 3, bet: 1, won: 1, cards: 3, roundScore: 0, total: 31, wins: 1, losses: 0 },
          { name: "Bogdan", bidOrder: 4, bet: 0, won: 0, cards: 3, roundScore: 0, total: 16, wins: 0, losses: 2 },
          { name: "Cristina", bidOrder: 1, bet: 0, won: 0, cards: 3, roundScore: 0, total: 5, wins: 0, losses: 3 },
        ],
      },
    };
    void look.apply(JSON.stringify(message), true);
    // The flight is made but not yet run: its first frame is where the card starts.
    const first = centre(document.querySelector<HTMLElement>('.trick .card[data-card="KC"]')!.getBoundingClientRect());
    return { rest, drawn, first };
  }, picked);
}

import type { Card, Gender, Level, Phase, Presence, RoundType, Suit } from "../net/protocol";
import { layOutHand, type HandEntry } from "../table/cards";
import type { StoreState } from "./store";

// What the table draws, in the shape of the desktop's GameSnapshot, so that code ported from the
// desktop reads the same fields.
export interface SeatView {
  seat: number;
  name: string;
  gender: Gender;
  // The portrait's id; empty for a seat the table state does not describe.
  avatar: string;
  kind: "human" | "computer";
  level: Level | null;
  presence: Presence | null;
  // Position in this round's bidding, 1 for whoever opened it.
  bidOrder: number;
  isHuman: boolean;
  hasBet: boolean;
  bet: number;
  tricksWon: number;
  cardsLeft: number;
  roundScore: number;
  totalScore: number;
  winStreak: number;
  lossStreak: number;
  // The cards face up, in display order, where this viewer may see them: another seat's in a
  // Forehead round.
  hand: HandEntry[];
}

export interface PlayedCardView {
  seat: number;
  card: Card;
  winning: boolean;
}

// The question the table is waiting for you to answer.
export type PromptView =
  | { kind: "bet"; id: number; max: number; forbidden: number | null; first: boolean; roundType: RoundType; deadlineAt: number | null }
  | { kind: "play"; id: number; deadlineAt: number | null };

export interface HandView {
  // Every card of the hand in display order, playable or not. Empty for a blind hand.
  entries: HandEntry[];
  // Backs to draw in a blind round, where nothing but a count is sent.
  backs: number;
  // positions[slot] is the index in the server's hand of the card at that slot.
  positions: number[];
  // Whether a click on a slot plays its card: only on your turn, from the prompt.
  playable: boolean;
}

export interface TableModel {
  roundNumber: number;
  roundCount: number;
  trickCount: number;
  trickNumber: number;
  roundType: RoundType;
  phase: Phase;
  trump: Card | null;
  seats: SeatView[];
  humanSeat: number;
  activeSeat: number;
  leadSeat: number | null;
  leadSuit: Suit | null;
  table: PlayedCardView[];
  hand: HandView;
  betsPlaced: number;
  betSum: number;
  forbiddenBet: number | null;
  prompt: PromptView | null;
}

const NO_HAND: HandView = { entries: [], backs: 0, positions: [], playable: false };

function handOf(state: StoreState, trump: Card | null, humanSeat: number): HandView {
  const prompt = state.prompt?.body;
  if (prompt !== undefined && prompt.kind === "play") {
    if (prompt.hand === undefined) {
      // A blind round sends only a count, and a back is always playable.
      const backs = prompt.handSize ?? 0;
      return { entries: [], backs, positions: Array.from({ length: backs }, (_, slot) => slot), playable: true };
    }
    const legalCards = prompt.legal.map((index) => (prompt.hand as Card[])[index]);
    const layout = layOutHand(prompt.hand, legalCards, trump);
    return { entries: layout.entries, backs: 0, positions: layout.positions, playable: true };
  }

  // Between turns: the snapshot's hand, never playable and nothing dimmed. Forehead and Hidden
  // rounds send none.
  const own = state.snapshot?.seats[humanSeat]?.hand;
  if (own === undefined) {
    return NO_HAND;
  }
  const layout = layOutHand(own, [], trump);
  return { entries: layout.entries, backs: 0, positions: layout.positions, playable: false };
}

// The table as the store describes it; null when there is no game to draw.
export function modelOf(state: StoreState): TableModel | null {
  const { snapshot, table } = state;
  if (snapshot === null) {
    return null;
  }

  const humanSeat = snapshot.you ?? -1;
  const trump = snapshot.round.trump;

  const seats: SeatView[] = snapshot.seats.map((seat, index) => {
    const described = table?.seats[index];
    const person = described !== undefined && described.kind !== "open" ? described : null;
    return {
      seat: index,
      name: seat.name,
      gender: person?.gender ?? "male",
      avatar: person?.avatar ?? "",
      kind: person?.kind === "computer" ? "computer" : "human",
      level: person?.kind === "computer" ? person.level : null,
      presence: person?.kind === "human" ? person.presence : null,
      bidOrder: seat.bidOrder,
      isHuman: index === humanSeat,
      hasBet: seat.bet !== null,
      bet: seat.bet ?? 0,
      tricksWon: seat.won,
      cardsLeft: seat.cards,
      roundScore: seat.roundScore,
      totalScore: seat.total,
      winStreak: seat.wins,
      lossStreak: seat.losses,
      hand: seat.hand === undefined ? [] : layOutHand(seat.hand, [], trump).entries,
    };
  });

  const body = state.prompt?.body;
  let prompt: PromptView | null = null;
  if (body !== undefined && state.prompt !== null) {
    prompt =
      body.kind === "bet"
        ? { kind: "bet", id: body.id, max: body.max, forbidden: body.forbidden, first: body.first, roundType: body.roundType, deadlineAt: state.prompt.deadlineAt }
        : { kind: "play", id: body.id, deadlineAt: state.prompt.deadlineAt };
  }

  return {
    roundNumber: snapshot.round.index + 1,
    roundCount: snapshot.round.count,
    trickCount: snapshot.round.tricks,
    trickNumber: snapshot.round.trick,
    roundType: snapshot.round.type,
    phase: snapshot.phase,
    trump,
    seats,
    humanSeat,
    activeSeat: snapshot.active ?? -1,
    leadSeat: snapshot.table.ledBy,
    leadSuit: snapshot.table.leadSuit,
    table: snapshot.table.cards.map((played) => ({ ...played })),
    hand: handOf(state, trump, humanSeat),
    betsPlaced: snapshot.bets.placed,
    betSum: snapshot.bets.sum,
    forbiddenBet: snapshot.forbiddenBet,
    prompt,
  };
}

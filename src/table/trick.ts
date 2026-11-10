import { el } from "../dom/el";
import type { Card } from "../net/protocol";
import type { TableModel } from "../play/model";
import {
  BOT_FLIGHT_OPACITY,
  BOT_FLIGHT_SCALE,
  FLIGHT_CURVE,
  SWEEP_CURVE,
  SWEEP_SCALE,
  animates,
  flightDuration,
  sweepDuration,
  type Pace,
} from "../play/motion";
import { CardView } from "./card";
import type { Place } from "./geometry/seats";
import { cardPlacement } from "./geometry/trick";
import { handCardHeight, playedCardHeight, z, type Placement } from "./space";

// Which cards the trick shows, and whether the winner is lit: a winner once there is something to
// beat. The server ranks a lone first card as winning, which it is, but until a second card is down
// the highlight says nothing the card does not.
export function isLit(table: readonly { winning: boolean }[], index: number): boolean {
  return table.length >= 2 && table[index].winning;
}

// What the trick showed last: which round, and which cards, by whom.
export interface TrickMemory {
  round: number;
  cards: { seat: number; card: Card; winning: boolean }[];
}

// Which cards are new on the felt: when this frame follows the last, in the same round, every card
// past the last table's prefix flies. A new round is a new table, and with nothing to fly from, or
// nothing moving, every card is placed at once.
export function arrivalsFor(
  memory: TrickMemory | null,
  model: Pick<TableModel, "roundNumber" | "table">,
  animate: boolean,
): { agrees: boolean; first: number } {
  if (memory === null || !animate) {
    return { agrees: false, first: 0 };
  }
  if (model.roundNumber !== memory.round || model.table.length < memory.cards.length) {
    return { agrees: false, first: 0 };
  }
  const prefix = memory.cards.every((shown, index) => model.table[index].seat === shown.seat && model.table[index].card === shown.card);
  return prefix ? { agrees: true, first: memory.cards.length } : { agrees: false, first: 0 };
}

// Whose panel the trick is swept to: the frame after a full trick, in its round, with the felt
// bare. The server's winner, as the full trick ranked it, never worked out again. A round's last
// trick is followed by the next round, which this leaves alone.
export function sweepWinner(
  memory: TrickMemory | null,
  model: Pick<TableModel, "roundNumber" | "table" | "seats">,
  animate: boolean,
): number | null {
  if (memory === null || !animate || model.roundNumber !== memory.round) {
    return null;
  }
  if (model.table.length !== 0 || memory.cards.length === 0 || memory.cards.length !== model.seats.length) {
    return null;
  }
  return memory.cards.find((shown) => shown.winning)?.seat ?? null;
}

// How a trick moves, for the table to say what is needed.
export interface TrickMotion {
  animate: boolean;
  pace: Pace;
  // After a sync there is no last frame to move from.
  fresh: boolean;
  // Where a card of yours rests in the fan, which it leaves for the felt.
  fromHand(card: Card): Placement | null;
}

interface Flight {
  animation: Animation;
  leaving: boolean;
  fromHand: boolean;
}

function centreOf(place: Place): { x: number; y: number } {
  return { x: place.panel.x + place.panel.w / 2, y: place.panel.y + place.panel.h / 2 };
}

// The played cards round the logo, one element for each card that has been played, keyed by card
// code and kept for the next time it is: a deck holds no duplicates.
export class TrickView {
  readonly element: HTMLElement;
  private readonly cards = new Map<Card, CardView>();
  private readonly flights = new Map<Card, Flight>();
  // Cards of yours that flew the moment you clicked: the server's word that they were played does not
  // launch them again.
  private readonly flownByYou = new Set<Card>();
  private memory: TrickMemory | null = null;

  constructor() {
    this.element = el("div", { class: "trick" });
  }

  cardFor(card: Card): CardView {
    let view = this.cards.get(card);
    if (view === undefined) {
      view = new CardView("played");
      view.hide();
      this.cards.set(card, view);
      this.element.append(view.element);
    }
    return view;
  }

  // Every flight and sweep lands where it was going.
  finishAll(): void {
    for (const card of [...this.flights.keys()]) {
      this.finish(card);
    }
  }

  private finishLeaving(): void {
    for (const [card, flight] of [...this.flights]) {
      if (flight.leaving) {
        this.finish(card);
      }
    }
  }

  // Ends one card's flight, at the place it was going: idempotent, and the same whether the clock ran
  // out or the end was asked for.
  private finish(card: Card): void {
    const flight = this.flights.get(card);
    if (flight === undefined) {
      return;
    }
    this.flights.delete(card);
    flight.animation.cancel();
    if (flight.leaving) {
      // A swept card is gone when it gets there; the element waits for the next trick.
      this.cardFor(card).hide();
    }
    this.updateStacking();
  }

  // Your card over the fan it leaves, while it is in the air; under your panel.
  private updateStacking(): void {
    const leavingYourHand = [...this.flights.values()].some((flight) => flight.fromHand);
    this.element.style.zIndex = String(leavingYourHand ? z.flyingCard : z.playedCards);
  }

  private start(card: Card, view: CardView, keyframes: Keyframe[], duration: number, easing: string, flight: Omit<Flight, "animation">): Promise<unknown> {
    this.finish(card);
    const animation = view.element.animate(keyframes, { duration, easing, fill: "backwards" });
    this.flights.set(card, { ...flight, animation });
    this.updateStacking();
    const ended = () => {
      if (this.flights.get(card)?.animation === animation) {
        this.finish(card);
      }
    };
    animation.onfinish = ended;
    animation.oncancel = () => undefined;
    return animation.finished.catch(() => undefined).then(ended);
  }

  // A card flies to where it lies: a bot's from its panel, small and faint; yours from the fan.
  private launch(card: Card, view: CardView, from: Placement, fromScale: number, fromOpacity: number, to: Placement, duration: number, fromHand: boolean): Promise<unknown> {
    const keyframes: Keyframe[] = [
      {
        transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) rotate(${from.rotation}deg) scale(${fromScale})`,
        opacity: fromOpacity,
      },
      { transform: `translate(0px, 0px) rotate(${to.rotation}deg) scale(1)`, opacity: 1 },
    ];
    return this.start(card, view, keyframes, duration, FLIGHT_CURVE, { leaving: false, fromHand });
  }

  // Every card on the felt goes to the winner's panel, at a third of its size, gone.
  private sweep(winner: Place, pace: Pace): Promise<unknown>[] {
    const target = centreOf(winner);
    const ended: Promise<unknown>[] = [];
    for (const [card, view] of this.cards) {
      const place = view.place;
      if (view.element.hidden || place === null || this.flights.get(card)?.leaving) {
        continue;
      }
      // A card still landing lands first, so the sweep starts from the felt.
      this.finish(card);
      const keyframes: Keyframe[] = [
        { transform: `translate(0px, 0px) rotate(${place.rotation}deg) scale(1)`, opacity: 1 },
        {
          transform: `translate(${target.x - place.x}px, ${target.y - place.y}px) rotate(${place.rotation}deg) scale(${SWEEP_SCALE})`,
          opacity: 0,
        },
      ];
      ended.push(this.start(card, view, keyframes, sweepDuration(pace), SWEEP_CURVE, { leaving: true, fromHand: false }));
    }
    return ended;
  }

  clear(): void {
    this.finishAll();
    for (const view of this.cards.values()) {
      view.hide();
    }
    this.memory = null;
    this.flownByYou.clear();
    this.updateStacking();
  }

  // Your card goes to the felt the moment you click, before the server has said it was played.
  flyOwn(card: Card, model: TableModel, places: readonly (Place | null)[], motion: TrickMotion): Promise<unknown> {
    const seatCount = model.seats.length;
    const place = places[model.humanSeat] ?? null;
    if (place === null) {
      return Promise.resolve();
    }
    const view = this.cardFor(card);
    const to = cardPlacement(seatCount, place);
    view.setCard(card);
    view.setHeight(playedCardHeight(seatCount));
    view.placeAt(to);
    view.setLook("played");
    view.element.style.zIndex = String(model.table.length);
    view.show();
    this.flownByYou.add(card);

    const from = motion.fromHand(card);
    if (from === null || !motion.animate) {
      return Promise.resolve();
    }
    return this.launch(card, view, from, handCardHeight / playedCardHeight(seatCount), 1, to, flightDuration(motion.pace), true);
  }

  // Forgets a card of yours that went early and was not taken.
  recall(card: Card): void {
    this.flownByYou.delete(card);
    this.finish(card);
  }

  // Places every card of the table where it lies, and flies the new ones. The promise ends when
  // every flight and sweep this started has.
  update(model: TableModel, places: readonly (Place | null)[], motion: TrickMotion): Promise<unknown> {
    const seatCount = model.seats.length;
    const height = playedCardHeight(seatCount);
    const animate = motion.animate && animates(motion.pace);
    const ended: Promise<unknown>[] = [];

    if (motion.fresh) {
      this.finishAll();
      this.memory = null;
      this.flownByYou.clear();
    }

    const arrivals = arrivalsFor(this.memory, model, animate);
    const winner = sweepWinner(this.memory, model, animate);

    // A card on the felt ends any sweep: the next trick has begun.
    if (model.table.length > 0) {
      this.finishLeaving();
    }
    if (!arrivals.agrees) {
      this.finishAll();
    }
    const winnerPlace = winner === null ? null : (places[winner] ?? null);
    if (winnerPlace !== null) {
      ended.push(...this.sweep(winnerPlace, motion.pace));
    }

    const onTable = new Set<Card>();
    model.table.forEach((played, index) => {
      const place = places[played.seat] ?? null;
      const view = this.cardFor(played.card);
      // A seat this table cannot place is a snapshot it cannot draw; leaving the card off is
      // better than inventing a place for it.
      if (place === null) {
        view.hide();
        return;
      }
      onTable.add(played.card);
      view.setCard(played.card);
      view.setHeight(height);
      const to = cardPlacement(seatCount, place);
      const flight = this.flights.get(played.card);
      const early = this.flownByYou.delete(played.card);

      if (!early && arrivals.agrees && index >= arrivals.first) {
        view.placeAt(to);
        const fromYourHand = place.human ? motion.fromHand(played.card) : null;
        if (fromYourHand !== null) {
          ended.push(this.launch(played.card, view, fromYourHand, handCardHeight / height, 1, to, flightDuration(motion.pace), true));
        } else {
          const panel = centreOf(place);
          ended.push(
            this.launch(played.card, view, { x: panel.x, y: panel.y, rotation: to.rotation }, BOT_FLIGHT_SCALE, BOT_FLIGHT_OPACITY, to, flightDuration(motion.pace), false),
          );
        }
      } else {
        // Not new: where it lies, at once. A card in the air is the same card, so only where it is
        // going could change, and that is where the element is placed.
        if (flight?.leaving) {
          this.finish(played.card);
        }
        view.placeAt(to);
      }

      // The highlight is the server's ranking and is never worked out again.
      view.setLook(isLit(model.table, index) ? "winning" : "played");
      view.element.style.zIndex = String(index);
      view.show();
    });

    // Hidden rather than deleted. A card being swept off is the sweep's to hide, when it gets there:
    // the frames that follow the clearing one show the same bare felt, and must not cut it short.
    for (const [card, view] of this.cards) {
      if (onTable.has(card) || this.flights.get(card)?.leaving) {
        continue;
      }
      if (!this.flownByYou.has(card)) {
        this.finish(card);
        view.hide();
      }
    }

    this.memory = {
      round: model.roundNumber,
      cards: model.table.map((played) => ({ seat: played.seat, card: played.card, winning: played.winning })),
    };
    this.updateStacking();
    return Promise.all(ended);
  }
}

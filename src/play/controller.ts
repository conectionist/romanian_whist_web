import type { Card, ClientMessage, ErrorCode, ServerMessage } from "../net/protocol";
import { isPlayable } from "../table/hand";
import { modelOf, type TableModel } from "./model";
import type { Change, Store } from "./store";

// What the controller needs of the table.
export interface Table {
  // Your card goes to the felt the moment you click.
  playOwn(card: Card): void;
  // A card that went early and was not taken: the next drawing puts it back.
  recallOwn(card: Card): void;
}

export interface ControllerDeps {
  send(message: ClientMessage): boolean;
  store: Store;
  table: Table;
  // Draws the store's table again, now.
  redraw(): void;
}

interface PendingPlay {
  prompt: number;
  // Null in a blind round, where there is no card to show.
  card: Card | null;
}

interface PendingBid {
  prompt: number;
}

const REFUSALS: readonly ErrorCode[] = ["illegal", "stalePrompt", "notYourTurn"];

// A click sends the answer and shows it taken before the server has said so: your card moves at once,
// the server's word that it was played confirms it without moving it again, and an error puts it
// back. A bid hides the strip the same way.
export class Controller {
  private play: PendingPlay | null = null;
  private bid: PendingBid | null = null;

  constructor(private readonly deps: ControllerDeps) {}

  get pendingPlay(): PendingPlay | null {
    return this.play;
  }

  get pendingBid(): PendingBid | null {
    return this.bid;
  }

  // A click on a slot of your hand.
  onPlay(slot: number): void {
    const prompt = this.deps.store.state.prompt?.body;
    if (prompt === undefined || prompt.kind !== "play" || this.play !== null) {
      return;
    }
    const model = modelOf(this.deps.store.state);
    if (model === null || !isPlayable(model.hand, slot)) {
      return;
    }
    const card = model.hand.backs > 0 ? null : model.hand.entries[slot].card;
    const index = model.hand.positions[slot];
    if (!this.deps.send({ type: "play", prompt: prompt.id, index })) {
      return;
    }
    this.play = { prompt: prompt.id, card };
    if (card !== null) {
      this.deps.table.playOwn(card);
    }
    this.deps.redraw();
  }

  // A click on a bid.
  onBid(value: number): void {
    const prompt = this.deps.store.state.prompt?.body;
    if (prompt === undefined || prompt.kind !== "bet" || this.bid !== null) {
      return;
    }
    if (!this.deps.send({ type: "bet", prompt: prompt.id, value })) {
      return;
    }
    this.bid = { prompt: prompt.id };
    this.deps.redraw();
  }

  // Told of each message as the queue applies it, before it is drawn.
  onApply(message: ServerMessage, _change: Change): void {
    switch (message.type) {
      case "sync":
        // Whatever was answered is over: the sync says what is open now.
        this.play = null;
        this.bid = null;
        break;
      case "promptClosed":
        if (this.bid?.prompt === message.id) {
          this.bid = null;
        }
        if (this.play?.prompt === message.id) {
          // Taken by you, and the card is on its way; or the timer ran out, and another card played.
          if (message.by === "computer" && this.play.card !== null) {
            this.deps.table.recallOwn(this.play.card);
          }
          this.play = null;
        }
        break;
      case "game":
        if (this.play !== null && message.event.kind === "cardPlayed" && message.snapshot?.you === message.event.seat) {
          this.play = null;
        }
        break;
      case "error":
        if (REFUSALS.includes(message.code)) {
          if (this.play?.card != null) {
            this.deps.table.recallOwn(this.play.card);
          }
          this.play = null;
          this.bid = null;
        }
        break;
      default:
        break;
    }
  }

  // The table as it is while an answer waits to be taken: the card played has left your hand, and
  // nothing may be answered twice.
  adjust(model: TableModel | null): TableModel | null {
    if (model === null || (this.play === null && this.bid === null)) {
      return model;
    }
    const adjusted: TableModel = { ...model, prompt: null };
    if (this.play !== null) {
      const played = this.play.card;
      // A blind card is the whole hand: there is nothing left once it is played.
      const keep = model.hand.entries.map((entry) => played === null || entry.card !== played);
      adjusted.hand =
        played === null
          ? { entries: [], backs: 0, positions: [], playable: false }
          : {
              entries: model.hand.entries.filter((_, at) => keep[at]),
              backs: model.hand.backs,
              positions: model.hand.positions.filter((_, at) => keep[at]),
              playable: false,
            };
    }
    return adjusted;
  }
}

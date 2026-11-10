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
  // How many backs the hand showed, in a blind round.
  backs: number;
}

interface PendingBid {
  prompt: number;
}

const REFUSALS: readonly ErrorCode[] = ["illegal", "stalePrompt", "notYourTurn"];

// A click sends the answer and shows it taken before the server has said so: your card moves at once,
// the server's word that it was played confirms it without moving it again, and an error puts it
// back. A bid hides the strip the same way. A card stays taken out of your hand until the server's word
// that it was played, which comes after its prompt is closed.
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
    this.play = { prompt: prompt.id, card, backs: model.hand.backs };
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
        // Taken by you, the card is still on its way; the timer ran out, and another card played.
        if (this.play?.prompt === message.id && message.by === "computer") {
          this.drop();
        }
        break;
      case "game":
        switch (message.event.kind) {
          case "cardPlayed":
            if (this.play !== null && message.snapshot?.you === message.event.seat) {
              this.play = null;
            }
            break;
          case "gameStarted":
          case "gameOver":
          case "gameStopped":
            this.drop();
            break;
          default:
            break;
        }
        break;
      case "tableState":
        if (message.state === "closed") {
          this.drop();
        }
        break;
      case "error":
        if (REFUSALS.includes(message.code)) {
          this.drop();
        }
        break;
      default:
        break;
    }
  }

  // Forgets what was answered, and calls back a card that went early without being taken.
  private drop(): void {
    if (this.play?.card != null) {
      this.deps.table.recallOwn(this.play.card);
    }
    this.play = null;
    this.bid = null;
  }

  // The table as it is while an answer waits to be taken: the card played has left your hand, and
  // nothing may be answered twice.
  adjust(model: TableModel | null): TableModel | null {
    if (model === null || (this.play === null && this.bid === null)) {
      return model;
    }
    const adjusted: TableModel = { ...model, prompt: null };
    if (this.play !== null) {
      const { card: played, backs } = this.play;
      // A blind card is the whole hand, and its back stays until the snapshot takes it: the card is
      // not known to show, so the back is what is left to see.
      adjusted.hand =
        played === null
          ? { entries: [], backs, positions: Array.from({ length: backs }, (_, slot) => slot), playable: false }
          : {
              entries: model.hand.entries.filter((entry) => entry.card !== played),
              backs: model.hand.backs,
              positions: model.hand.positions.filter((_, at) => model.hand.entries[at].card !== played),
              playable: false,
            };
    }
    return adjusted;
  }
}

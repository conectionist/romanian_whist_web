import type { ServerMessage } from "../net/protocol";
import { animates, type Pace } from "./motion";
import type { Change, Store } from "./store";

// What the queue draws with. The table implements it.
export interface Stage {
  // Draws the store's model at once, and resolves when the flights and sweeps it started end.
  relayout(change: Change, animate: boolean): Promise<void>;
  // Every flight and sweep lands where it was going.
  finishMotion(): void;
}

export interface QueueOptions {
  pace(): Pace;
  // Whether the page is in a background tab, where nothing is animated.
  hidden(): boolean;
  now(): number;
  // More than this many waiting messages are applied without animation until the queue has caught up.
  catchUpAt?: number;
  // Told of each message as it is applied, before it is drawn.
  onApply?(message: ServerMessage, change: Change): void;
  // Told of a message the table could not draw. By default the error is thrown where the page sees it.
  onError?(error: unknown): void;
}

interface Waiting {
  message: ServerMessage;
  receivedAt: number;
}

// Every server message goes into one queue and is handled in order: a prompt goes live when the queue
// reaches it, and a sync empties it. The snapshot is drawn first and the motion starts from where the
// card came from, as the desktop shows it, and the queue waits for the motion before the next one.
export class PlaybackQueue {
  private readonly pending: Waiting[] = [];
  private draining = false;
  private catchingUp = false;
  private readonly catchUpAt: number;

  constructor(
    private readonly store: Store,
    private readonly stage: Stage,
    private readonly options: QueueOptions,
  ) {
    this.catchUpAt = options.catchUpAt ?? 4;
  }

  // How many messages are waiting.
  get waiting(): number {
    return this.pending.length;
  }

  push(message: ServerMessage): void {
    // A prompt's countdown starts from when the page received it, not from when it is reached.
    const waiting: Waiting = { message, receivedAt: this.options.now() };
    if (message.type === "sync") {
      this.pending.length = 0;
      this.catchingUp = false;
      this.stage.finishMotion();
    }
    this.pending.push(waiting);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      while (this.pending.length > 0) {
        if (this.pending.length > this.catchUpAt) {
          this.catchingUp = true;
        }
        const next = this.pending.shift() as Waiting;
        if (this.pending.length === 0) {
          this.catchingUp = false;
        }
        const animate = animates(this.options.pace()) && !this.options.hidden() && !this.catchingUp;
        const change = this.store.apply(next.message, next.receivedAt);
        this.options.onApply?.(next.message, change);
        try {
          await this.stage.relayout(change, animate);
        } catch (error) {
          // A message the table cannot draw does not stop the ones behind it. It is still reported.
          if (this.options.onError !== undefined) {
            this.options.onError(error);
          } else {
            queueMicrotask(() => {
              throw error;
            });
          }
        }
      }
    } finally {
      this.draining = false;
    }
  }
}

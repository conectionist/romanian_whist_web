// The server asks whether the person is still there when a game has waited on them too long, and
// anything the page sends is the answer. Once the time to answer is up, the server counts them as
// gone, as if the tab had closed, until the page next sends something.
export type Question = { kind: "asking"; secondsLeft: number } | { kind: "unanswered" } | null;

export class StillHere {
  private deadlineAt: number | null = null;

  // `deadlineMs` is the time left when the server sent it, counted from when the page was told.
  asked(deadlineMs: number, now: number): void {
    this.deadlineAt = now + deadlineMs;
  }

  // The page sent something, or has a new connection, which the server counts as the person here.
  answered(): void {
    this.deadlineAt = null;
  }

  state(now: number): Question {
    if (this.deadlineAt === null) {
      return null;
    }
    const left = this.deadlineAt - now;
    return left > 0 ? { kind: "asking", secondsLeft: Math.ceil(left / 1000) } : { kind: "unanswered" };
  }
}

// Once the time to answer is up, the server counts the person as gone, as if the tab had closed, until
// the page next sends something.
export type Question = { kind: "asking"; secondsLeft: number } | { kind: "unanswered" } | null;

export class StillHere {
  private deadlineAt: number | null = null;

  // `deadlineMs` is the time left when the server sent it, counted from when the page was told.
  asked(deadlineMs: number, now: number): void {
    this.deadlineAt = now + deadlineMs;
  }

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

// Once the time to answer is up, the server counts the person as gone, as if the tab had closed, until
// the page next sends something.
export type Question = { kind: "asking"; secondsLeft: number; secondsGiven: number } | { kind: "unanswered" } | null;

// A question that comes this soon after the page sent something may have crossed it on the way, and the server may
// have taken that as the answer already.
export const CROSSED_MS = 2000;

export class StillHere {
  private deadlineAt: number | null = null;
  private secondsGiven = 0;
  private sentAt: number | null = null;

  // `deadlineMs` is the time left when the server sent it, counted from when the page was told. False when the
  // question crossed something the page sent, and is to be answered at once rather than asked.
  asked(deadlineMs: number, now: number): boolean {
    if (this.sentAt !== null && now - this.sentAt < CROSSED_MS) {
      return false;
    }
    this.deadlineAt = now + deadlineMs;
    this.secondsGiven = Math.ceil(deadlineMs / 1000);
    return true;
  }

  sent(now: number): void {
    this.sentAt = now;
    this.answered();
  }

  answered(): void {
    this.deadlineAt = null;
  }

  state(now: number): Question {
    if (this.deadlineAt === null) {
      return null;
    }
    const left = this.deadlineAt - now;
    return left > 0 ? { kind: "asking", secondsLeft: Math.ceil(left / 1000), secondsGiven: this.secondsGiven } : { kind: "unanswered" };
  }
}

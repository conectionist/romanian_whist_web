import { el, setText } from "../dom/el";
import { translateGendered, type Gendered } from "../i18n/person";
import { t } from "../i18n/t";
import type { ErrorCode, Presence, TableState } from "../net/protocol";
import type { Status } from "../net/connection";
import type { Question } from "../net/stillHere";

// What the page tells you that the table does not: the server's refusals in words, the connection's
// state, a person who went away and was replaced, a game that waits for one. The desktop has no
// toasts, and these are new: panels in its style, in one strip under the menu bar.

// The server's error codes as sentences. The protocol carries no words, so each page writes its own.
export function errorText(code: ErrorCode, detail?: string): string {
  switch (code) {
    case "badMessage":
      return detail === "name" || detail === "profile.name"
        ? t("errors", "The server does not accept that name. Try another.")
        : t("errors", "The server could not read that. Check what you typed.");
    case "version":
      return t("errors", "This page is out of date. Reload it.");
    case "notFound":
      return t("errors", "There is no table with that code.");
    case "tableFull":
      return t("errors", "That table is full.");
    case "nameTaken":
      return t("errors", "Someone at the table already has that name.");
    case "notHost":
      return t("errors", "Only the host can do that.");
    case "notYourTurn":
    case "stalePrompt":
      return t("errors", "That was too late: the game has moved on.");
    case "illegal":
      return t("errors", "That is not allowed now.");
    case "rateLimited":
      switch (detail) {
        case "connections":
          return t("errors", "There are too many connections from your network. The page tries again in 30 seconds.");
        case "tables":
          return t("errors", "Too many tables were made from your network this hour. Try again later.");
        case "joins":
          return t("errors", "Too many table codes that do not exist were tried. Try again in a few minutes.");
        case "instant":
          return t("errors", "A game at Instant speed is already running from your network. Choose another speed, or try again when it is over.");
        default:
          return t("errors", "That was too many messages. Wait a moment.");
      }
    case "draining":
      return t("errors", "The server is restarting and takes no new games just now.");
    case "busy":
      return detail === "instant"
        ? t("errors", "The server is running as many games at Instant speed as it can. Choose another speed, or try again later.")
        : t("errors", "The server has as many games or tables as it can take. Try again in a few minutes.");
    case "openElsewhere":
      return t("errors", "This game is open in another window.");
  }
}

// What the banner says while the server restarts: its games may go on until a time of day, which is when the
// server's drain ends at the latest, and none can start. The time is the page's own clock's, and the server
// may quit sooner.
export function restartingText(deadlineMs: number, now: Date, language: string): string {
  const until = new Date(now.getTime() + deadlineMs);
  const time = until.toLocaleTimeString(language === "ro" ? "ro-RO" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return t("errors", "The server is restarting. Games in progress can go on until %1. No new game can start.", [time]);
}

// The connection's state, once the page has been welcomed: nothing while it is open, and a sentence
// while it is not. A lost connection is tried again by the page on its own; a connection another
// window took over is not, or the two would take it from each other for ever.
export function connectionText(status: Status, wasConnected: boolean): string | null {
  if (status === "elsewhere") {
    return t("errors", "This game is open in another window.");
  }
  if (!wasConnected || status === "open") {
    return null;
  }
  return t("errors", "The connection was lost. Trying again…");
}

// Your own seat's presence at the table, or null when you have no seat there.
export function ownPresence(table: TableState | null): Presence | null {
  const seat = table?.seats.find((each) => each.kind === "human" && each.you);
  return seat?.kind === "human" ? seat.presence : null;
}

// A notice's words, the seconds that tick beside them, and what a screen reader is told of the time, once.
export interface Shown {
  text: string;
  count?: string;
  said?: string;
}

export interface StillHereShown extends Shown {
  id: "asking" | "gone";
}

// The seat the table waits for, and its seconds: those it had when the page was told, and those left now.
function waitOf(table: TableState | null, receivedAt: number, now: number): { seat: number; given: number; left: number } | null {
  const waiting = table?.waitingFor;
  if (waiting === undefined) {
    return null;
  }
  return {
    seat: waiting.seat,
    given: Math.max(0, Math.ceil(waiting.deadline / 1000)),
    left: Math.max(0, Math.ceil((waiting.deadline - (now - receivedAt)) / 1000)),
  };
}

// The question whether you are still there, and the word that the server counts you as gone though the tab is
// open: only during a game, and only once this connection has its sync. A seat's presence is the server's own word
// that you are gone; the page's count of an unanswered question is for a watcher, who has no seat to show it.
export function stillHereText(seen: {
  question: Question;
  table: TableState | null;
  tableAt: number;
  now: number;
  playing: boolean;
  connected: boolean;
}): StillHereShown | null {
  const { question, table } = seen;
  if (!seen.playing || !seen.connected) {
    return null;
  }
  if (question?.kind === "asking") {
    return {
      id: "asking",
      text: t("online", "Are you still there?"),
      count: `${question.secondsLeft} s`,
      said: t("online", "You have %n seconds to answer.", [], { n: question.secondsGiven, one: "You have %n second to answer." }),
    };
  }
  const presence = ownPresence(table);
  if (presence === "replaced") {
    return { id: "gone", text: t("online", "A computer player is playing for you.") };
  }
  if (presence === "away" || (presence === null && question?.kind === "unanswered")) {
    const gone: StillHereShown = { id: "gone", text: t("online", "You did not answer in time. Your game is waiting for you.") };
    const wait = waitOf(table, seen.tableAt, seen.now);
    const seat = wait === null ? undefined : table?.seats[wait.seat];
    if (wait === null || seat?.kind !== "human" || !seat.you) {
      return gone;
    }
    const said = t("online", "A computer player takes your seat in %n seconds.", [], { n: wait.given, one: "A computer player takes your seat in %n second." });
    return { ...gone, count: `${wait.left} s`, said };
  }
  return null;
}

// What the table says it waits for: a person who is away, until they come back or are replaced. Your own seat
// waited for is told in the second person, by the notice that you are counted as gone.
export function waitingText(table: TableState | null, receivedAt: number, now: number): Shown | null {
  const wait = waitOf(table, receivedAt, now);
  const seat = wait === null ? undefined : table?.seats[wait.seat];
  if (wait === null || seat === undefined || seat.kind === "open" || (seat.kind === "human" && seat.you)) {
    return null;
  }
  return {
    text: t("online", "Waiting for %1 to come back.", [seat.name]),
    count: `${wait.left} s`,
    said: t("online", "%n seconds left.", [], { n: wait.given, one: "%n second left." }),
  };
}

// A person's seat taken over by a computer player, told as Romanian agrees it with the person.
const REPLACED: Gendered = {
  male: { source: "%1 was replaced by a computer player.", comment: "about a man" },
  female: { source: "%1 was replaced by a computer player.", comment: "about a woman" },
};

// The news in a change of who is here: a person gone away, replaced by a computer player, or back.
export function presenceNews(before: TableState | null, after: TableState | null): string[] {
  if (before === null || after === null || before.code !== after.code) {
    return [];
  }
  const news: string[] = [];
  // Between games a person who leaves opens their seat; one who moves to another seat is still here.
  const named = new Set(after.seats.flatMap((seat) => (seat.kind === "human" ? [seat.name] : [])));
  before.seats.forEach((was, index) => {
    const seat = after.seats[index];
    if (was.kind === "human" && !was.you && seat?.kind === "open" && !named.has(was.name)) {
      news.push(t("online", "%1 left the table.", [was.name]));
    }
  });
  after.seats.forEach((seat, index) => {
    const was = before.seats[index];
    if (seat.kind !== "human" || was === undefined || was.kind !== "human" || was.name !== seat.name || seat.you) {
      return;
    }
    if (seat.presence === "replaced" && was.presence !== "replaced") {
      news.push(translateGendered("online", REPLACED, seat.gender, [seat.name]));
    } else if (seat.presence === "away" && was.presence === "here") {
      news.push(t("online", "%1 went away.", [seat.name]));
    } else if (seat.presence === "here" && was.presence !== "here") {
      news.push(t("online", "%1 is back.", [seat.name]));
    }
  });
  return news;
}

// One optional span of a notice, kept right after `after`, and gone when there is nothing to show.
function part(node: HTMLElement, className: string, value: string | undefined, after: Element, attrs: Record<string, string> = {}): HTMLElement | null {
  let span = node.querySelector<HTMLElement>(`.${className.split(" ")[0]}`);
  if (value === undefined) {
    span?.remove();
    return null;
  }
  if (span === null) {
    span = el("span", { class: className, attrs });
    after.after(span);
  }
  setText(span, value);
  return span;
}

// A strip of notices, each kept under its own name: one that is set again changes its words in place,
// and one cleared goes. A notice with a time to live goes by itself.
export class Notices {
  readonly element: HTMLElement;
  private readonly shown = new Map<string, { node: HTMLElement; timer: number | null }>();
  private parkedFor: string | null = null;

  // `lost` is told when a notice that had the keyboard goes, which would otherwise leave it on nothing.
  constructor(private readonly lost: () => void = () => undefined) {
    this.element = el("div", { class: "notices", attrs: { role: "status", "aria-live": "polite", tabindex: "-1" } });
  }

  set(
    id: string,
    text: string | null,
    options: { kind?: string; liveMs?: number; action?: { label: string; run: () => void }; count?: string; said?: string; handTo?: string } = {},
  ): void {
    if (text === null || text === "") {
      this.clear(id, options.handTo);
      return;
    }
    let entry = this.shown.get(id);
    if (entry === undefined) {
      entry = { node: el("div", { class: "panel notice", data: { notice: id } }, el("span", { class: "notice-text" })), timer: null };
      this.shown.set(id, entry);
      this.element.append(entry.node);
    }
    entry.node.dataset.kind = options.kind ?? "info";
    const words = entry.node.firstElementChild as HTMLElement;
    setText(words, text);
    // The seconds are kept out of the live region, which would read the strip out whole again at every tick; a
    // screen reader is told the time once instead, in words that do not change.
    const count = part(entry.node, "notice-count", options.count, words, { "aria-hidden": "true" });
    part(entry.node, "notice-said sr-only", options.said, count ?? words);
    const button = entry.node.querySelector("button");
    if (options.action !== undefined && button === null) {
      const action = el("button", { class: "notice-btn", attrs: { type: "button" }, text: options.action.label });
      action.addEventListener("click", options.action.run);
      entry.node.append(action);
    } else if (options.action === undefined && button !== null) {
      button.remove();
    }
    if (this.parkedFor === id && document.activeElement === this.element) {
      this.parkedFor = null;
      entry.node.querySelector("button")?.focus();
    }
    if (entry.timer !== null) {
      window.clearTimeout(entry.timer);
      entry.timer = null;
    }
    if (options.liveMs !== undefined) {
      entry.timer = window.setTimeout(() => this.clear(id), options.liveMs);
    }
  }

  // `handTo` names the notice that takes over from this one: the keyboard on this one goes to its button, and waits
  // on the strip, where Enter does nothing, while it has not come yet.
  clear(id: string, handTo?: string): void {
    const entry = this.shown.get(id);
    if (entry === undefined) {
      return;
    }
    if (entry.timer !== null) {
      window.clearTimeout(entry.timer);
    }
    const hadKeyboard = entry.node.contains(document.activeElement);
    entry.node.remove();
    this.shown.delete(id);
    if (!hadKeyboard) {
      return;
    }
    if (handTo === undefined) {
      this.lost();
      return;
    }
    const next = this.shown.get(handTo)?.node.querySelector("button");
    if (next !== null && next !== undefined) {
      next.focus();
    } else {
      this.parkedFor = handTo;
      this.element.focus();
    }
  }
}

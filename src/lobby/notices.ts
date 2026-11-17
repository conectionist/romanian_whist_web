import { el, setText } from "../dom/el";
import { translateGendered, type Gendered } from "../i18n/person";
import { t } from "../i18n/t";
import type { ErrorCode, TableState } from "../net/protocol";
import type { Status } from "../net/connection";

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
          return t("errors", "You have made too many tables this hour. Try again later.");
        case "joins":
          return t("errors", "Too many table codes that do not exist were tried. Try again in a few minutes.");
        default:
          return t("errors", "That was too many messages. Wait a moment.");
      }
    case "draining":
      return t("errors", "The server is restarting and takes no new games just now.");
    case "busy":
      return t("errors", "The server has as many games or tables as it can take. Try again in a few minutes.");
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

// What the table says it waits for: a person who is away, until they come back or are replaced. The
// deadline counts down from when the page was told.
export function waitingText(table: TableState | null, receivedAt: number, now: number): string | null {
  const waiting = table?.waitingFor;
  if (table === null || waiting === undefined) {
    return null;
  }
  const seat = table.seats[waiting.seat];
  if (seat === undefined || seat.kind === "open") {
    return null;
  }
  const left = Math.max(0, Math.ceil((waiting.deadline - (now - receivedAt)) / 1000));
  return t("online", "Waiting for %1 to come back: %2 s", [seat.name, left]);
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

// A strip of notices, each kept under its own name: one that is set again changes its words in place,
// and one cleared goes. A notice with a time to live goes by itself.
export class Notices {
  readonly element: HTMLElement;
  private readonly shown = new Map<string, { node: HTMLElement; timer: number | null }>();

  constructor() {
    this.element = el("div", { class: "notices", attrs: { role: "status", "aria-live": "polite" } });
  }

  set(id: string, text: string | null, options: { kind?: string; liveMs?: number; action?: { label: string; run: () => void } } = {}): void {
    if (text === null || text === "") {
      this.clear(id);
      return;
    }
    let entry = this.shown.get(id);
    if (entry === undefined) {
      entry = { node: el("div", { class: "panel notice", data: { notice: id } }, el("span", { class: "notice-text" })), timer: null };
      this.shown.set(id, entry);
      this.element.append(entry.node);
    }
    entry.node.dataset.kind = options.kind ?? "info";
    setText(entry.node.firstElementChild as HTMLElement, text);
    const button = entry.node.querySelector("button");
    if (options.action !== undefined && button === null) {
      const action = el("button", { class: "notice-btn", attrs: { type: "button" }, text: options.action.label });
      action.addEventListener("click", options.action.run);
      entry.node.append(action);
    } else if (options.action === undefined && button !== null) {
      button.remove();
    }
    if (entry.timer !== null) {
      window.clearTimeout(entry.timer);
      entry.timer = null;
    }
    if (options.liveMs !== undefined) {
      entry.timer = window.setTimeout(() => this.clear(id), options.liveMs);
    }
  }

  clear(id: string): void {
    const entry = this.shown.get(id);
    if (entry === undefined) {
      return;
    }
    if (entry.timer !== null) {
      window.clearTimeout(entry.timer);
    }
    entry.node.remove();
    this.shown.delete(id);
  }
}

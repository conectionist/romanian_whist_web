import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n/language";
import { connectionText, errorText, ownPresence, presenceNews, restartingText, stillHereText, waitingText } from "../../src/lobby/notices";
import { StillHere, type Question } from "../../src/net/stillHere";
import type { ErrorCode, Presence } from "../../src/net/protocol";
import { decode } from "../../src/net/decode";
import { serverFixture } from "./support/sheetState";

function table(name: string) {
  const decoded = decode(JSON.stringify(serverFixture(name)));
  if (decoded.type !== "tableState") {
    throw new Error("not a table state");
  }
  const { type: _type, seq: _seq, ...state } = decoded;
  return state;
}

afterEach(() => setLanguage("en"));

describe("the server's refusals in words", () => {
  const codes: ErrorCode[] = ["badMessage", "version", "notFound", "tableFull", "nameTaken", "notHost", "notYourTurn", "stalePrompt", "illegal", "rateLimited", "draining", "busy", "openElsewhere"];

  it("have a sentence for every code, and none is the code itself", () => {
    for (const code of codes) {
      const text = errorText(code);
      expect(text.length, code).toBeGreaterThan(8);
      expect(text, code).not.toBe(code);
      expect(text.endsWith(".")).toBe(true);
    }
  });

  it("says what is wrong for the codes a person can fix", () => {
    expect(errorText("notFound")).toBe("There is no table with that code.");
    expect(errorText("tableFull")).toBe("That table is full.");
    expect(errorText("nameTaken")).toBe("Someone at the table already has that name.");
    expect(errorText("notHost")).toBe("Only the host can do that.");
    expect(errorText("badMessage", "name")).toContain("name");
    expect(errorText("badMessage", "seats")).not.toContain("name");
  });

  it("tells each limit of an address apart, and a message rate from them", () => {
    const texts = [undefined, "connections", "tables", "joins"].map((detail) => errorText("rateLimited", detail));
    expect(new Set(texts).size).toBe(4);
    expect(errorText("rateLimited", "connections")).toContain("30 seconds");
    // Both name the network, which is what the limit is on, and not the person who happened to be told.
    expect(errorText("rateLimited", "connections")).toContain("your network");
    expect(errorText("rateLimited", "tables")).toBe("Too many tables were made from your network this hour. Try again later.");
    expect(errorText("rateLimited", "something new")).toBe(errorText("rateLimited"));
  });

  it("tells Instant's limits apart: the server's, which another speed gets round, and your network's own", () => {
    expect(errorText("busy", "instant")).toContain("Instant");
    expect(errorText("busy", "instant")).toContain("another speed");
    expect(errorText("rateLimited", "instant")).toContain("from your network");
    expect(errorText("rateLimited", "instant")).not.toBe(errorText("busy", "instant"));
    expect(errorText("busy", "something new")).toBe(errorText("busy"));
  });

  it("says a busy server is full, and asks for no more than a wait", () => {
    expect(errorText("busy")).toBe("The server has as many games or tables as it can take. Try again in a few minutes.");
    expect(errorText("busy")).not.toBe(errorText("draining"));
  });

  it("reads a late answer the same whichever code the race gives", () => {
    expect(errorText("stalePrompt")).toBe(errorText("notYourTurn"));
  });
});

describe("the restart banner", () => {
  // 10:00 UTC; the formatter works in the viewer's zone, so the test pins it to one.
  const now = new Date(Date.UTC(2026, 10, 17, 10, 0, 0));
  const zone = process.env.TZ;

  afterEach(() => {
    if (zone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = zone;
    }
  });

  it("names the time of day the games may go on until, and that no new one can start", () => {
    process.env.TZ = "UTC";
    expect(restartingText(15 * 60_000, now, "en")).toBe("The server is restarting. Games in progress can go on until 10:15. No new game can start.");
  });

  it("is the same in Romanian, with the time in 24 hours", () => {
    process.env.TZ = "UTC";
    setLanguage("ro");
    expect(restartingText(75 * 60_000, now, "ro")).toBe("Serverul repornește. Jocurile în desfășurare pot continua până la 11:15. Nu mai poate începe niciun joc nou.");
  });

  it("counts from the page's own clock, so a stale deadline is not stretched", () => {
    process.env.TZ = "UTC";
    expect(restartingText(0, now, "en")).toContain("until 10:00");
  });
});

describe("the connection's state", () => {
  it("is nothing while it is open or has never been", () => {
    expect(connectionText("open", true)).toBeNull();
    expect(connectionText("connecting", false)).toBeNull();
    expect(connectionText("closed", false)).toBeNull();
  });

  it("says it was lost once it had been open, and is being tried again", () => {
    expect(connectionText("closed", true)).toBe("The connection was lost. Trying again…");
    expect(connectionText("connecting", true)).toBe("The connection was lost. Trying again…");
  });

  it("says the game is open in another window, whether or not this one was ever open", () => {
    expect(connectionText("elsewhere", true)).toBe("This game is open in another window.");
    expect(connectionText("elsewhere", false)).toBe("This game is open in another window.");
  });
});

describe("what the table waits for", () => {
  const waiting = table("tableState.waiting");

  it("is the person who is away, with the time left counted from when the page was told", () => {
    // The fixture's deadline is 300 ms: with 100 ms gone it is still one second, by the ceiling.
    expect(waitingText(waiting, 1000, 1100)).toBe("Waiting for Bogdan to come back: 1 s");
    expect(waitingText(waiting, 1000, 5000)).toBe("Waiting for Bogdan to come back: 0 s");
  });

  it("is nothing when the table waits for nobody, or for a seat nobody holds", () => {
    expect(waitingText(table("tableState.online"), 0, 0)).toBeNull();
    expect(waitingText(null, 0, 0)).toBeNull();
    expect(waitingText({ ...waiting, seats: waiting.seats.map(() => ({ kind: "open" as const })) }, 0, 0)).toBeNull();
  });
});

describe("who went away, was replaced or came back", () => {
  // One table, with the second seat's person here, away or replaced.
  const base = table("tableState.waiting");
  const seatWith = (presence: "here" | "away" | "replaced") => ({
    ...base,
    waitingFor: undefined,
    seats: base.seats.map((seat, index) => (index === 1 && seat.kind === "human" ? { ...seat, presence } : seat)),
  });
  const here = seatWith("here");
  const away = seatWith("away");
  const replaced = seatWith("replaced");

  it("tells of a person gone away, replaced, and back, each once", () => {
    expect(presenceNews(here, away)).toEqual(["Bogdan went away."]);
    expect(presenceNews(away, replaced)).toEqual(["Bogdan was replaced by a computer player."]);
    expect(presenceNews(replaced, here)).toEqual(["Bogdan is back."]);
    expect(presenceNews(away, here)).toEqual(["Bogdan is back."]);
  });

  it("tells it in Romanian as the person's gender agrees it, a man and a woman", () => {
    setLanguage("ro");
    expect(presenceNews(here, away)).toEqual(["Bogdan nu mai răspunde."]);
    expect(presenceNews(replaced, here)).toEqual(["Bogdan s-a întors."]);
    expect(presenceNews(away, replaced)).toEqual(["Bogdan a fost înlocuit de un robot."]);
    const woman = (state: typeof replaced) => ({
      ...state,
      seats: state.seats.map((seat, index) => (index === 1 && seat.kind === "human" ? { ...seat, gender: "female" as const } : seat)),
    });
    expect(presenceNews(woman(away), woman(replaced))).toEqual(["Bogdan a fost înlocuită de un robot."]);
    expect(presenceNews(woman(here), woman(away))).toEqual(["Bogdan nu mai răspunde."]);
  });

  it("says a man's replacement the same in English as a woman's", () => {
    const woman = (state: typeof replaced) => ({
      ...state,
      seats: state.seats.map((seat, index) => (index === 1 && seat.kind === "human" ? { ...seat, gender: "female" as const } : seat)),
    });
    expect(presenceNews(woman(away), woman(replaced))).toEqual(["Bogdan was replaced by a computer player."]);
  });

  it("tells of a person who left the lobby, and not of one who moved to another seat", () => {
    const open = { ...here, seats: here.seats.map((seat, index) => (index === 1 ? { kind: "open" as const } : seat)) };
    expect(presenceNews(here, open)).toEqual(["Bogdan left the table."]);
    const moved = { ...open, seats: [...open.seats, here.seats[1]] };
    expect(presenceNews(here, moved)).toEqual([]);
  });

  it("tells nothing for what has not changed, for your own seat, or for another table", () => {
    expect(presenceNews(here, here)).toEqual([]);
    // A seat that stays away, or stays replaced, is not news again with every state the table sends.
    expect(presenceNews(away, away)).toEqual([]);
    expect(presenceNews(replaced, replaced)).toEqual([]);
    expect(presenceNews(null, here)).toEqual([]);
    expect(presenceNews(here, { ...away, code: "OTHER1" })).toEqual([]);
    const yourself = { ...away, seats: away.seats.map((seat, index) => (index === 0 && seat.kind === "human" ? { ...seat, presence: "away" as const } : seat)) };
    expect(presenceNews(here, yourself)).toEqual(["Bogdan went away."]);
  });
});

describe("whether you are still there", () => {
  // The second seat is yours, here, away or replaced.
  const base = table("tableState.waiting");
  const yours = (presence: "here" | "away" | "replaced") => ({
    ...base,
    waitingFor: undefined,
    seats: base.seats.map((seat, index) => (seat.kind === "human" ? { ...seat, you: index === 1, presence: index === 1 ? presence : "here" } : seat)),
  });

  it("reads your own seat's presence, and none at no table or without a seat", () => {
    expect(ownPresence(yours("away"))).toBe("away");
    expect(ownPresence(yours("replaced"))).toBe("replaced");
    expect(ownPresence(null)).toBeNull();
    expect(ownPresence({ ...base, seats: base.seats.map((seat) => (seat.kind === "human" ? { ...seat, you: false } : seat)) })).toBeNull();
  });

  it("asks until the time to answer is up, and then says the game waits, until the page sends something", () => {
    const question = new StillHere();
    expect(question.state(0)).toBeNull();
    question.asked(30000, 1000);
    expect(question.state(1000)).toEqual({ kind: "asking", secondsLeft: 30 });
    expect(question.state(30999)).toEqual({ kind: "asking", secondsLeft: 1 });
    expect(question.state(31000)).toEqual({ kind: "unanswered" });
    question.answered();
    expect(question.state(31000)).toBeNull();
  });

  // During a game, connected: what the page shows, from the question and your seat.
  const shown = (question: Question, presence: Presence | null) => stillHereText({ question, presence, playing: true, connected: true });

  it("is one notice at a time: the question, or else that the server counts you as gone", () => {
    expect(shown({ kind: "asking", secondsLeft: 12 }, "here")).toEqual({ id: "asking", text: "Are you still there?", secondsLeft: 12 });
    // A turn timer gives the seat to a computer player as the question comes: the question comes first.
    expect(shown({ kind: "asking", secondsLeft: 12 }, "replaced")?.id).toBe("asking");
    expect(shown(null, "away")).toEqual({ id: "gone", text: "You did not answer in time. Your game is waiting for you." });
    expect(shown(null, "replaced")).toEqual({ id: "gone", text: "A computer player is playing for you." });
    expect(shown(null, "here")).toBeNull();
    expect(shown(null, null)).toBeNull();
  });

  it("takes a seat's presence over the page's own count, which is for a watcher", () => {
    // A move that crossed the question answered it, and the seat is here.
    expect(shown({ kind: "unanswered" }, "here")).toBeNull();
    expect(shown({ kind: "unanswered" }, null)?.id).toBe("gone");
  });

  it("says nothing between games, at no table, or with the connection down", () => {
    for (const presence of ["away", "replaced", null] as const) {
      expect(stillHereText({ question: { kind: "unanswered" }, presence, playing: false, connected: true })).toBeNull();
      expect(stillHereText({ question: { kind: "asking", secondsLeft: 3 }, presence, playing: true, connected: false })).toBeNull();
    }
  });

  it("does not name your own seat as one the table waits for", () => {
    const waiting = table("tableState.waiting");
    const awaited = waiting.waitingFor!.seat;
    const mine = { ...waiting, seats: waiting.seats.map((seat, index) => (seat.kind === "human" ? { ...seat, you: index === awaited } : seat)) };
    expect(waitingText(mine, 1000, 1100)).toBeNull();
  });

  it("is said in Romanian", () => {
    setLanguage("ro");
    expect(shown({ kind: "asking", secondsLeft: 5 }, "here")?.text).toBe("Mai ești acolo?");
    expect(shown(null, "replaced")?.text).toBe("Un robot joacă în locul tău.");
    expect(errorText("rateLimited", "instant")).toContain("rețeaua ta");
  });
});

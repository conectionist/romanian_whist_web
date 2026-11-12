import { describe, expect, it } from "vitest";
import { connectionText, errorText, presenceNews, waitingText } from "../../src/lobby/notices";
import type { ErrorCode } from "../../src/net/protocol";
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

describe("the server's refusals in words", () => {
  const codes: ErrorCode[] = ["badMessage", "version", "notFound", "tableFull", "nameTaken", "notHost", "notYourTurn", "stalePrompt", "illegal", "rateLimited", "draining", "openElsewhere"];

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

  it("reads a late answer the same whichever code the race gives", () => {
    expect(errorText("stalePrompt")).toBe(errorText("notYourTurn"));
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

import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n/language";
import type { Presence, TableState } from "../../src/net/protocol";
import { fewestSeats, fillMessages, lobbyFor, presenceText, seatChoice, seatCountFrom, settingsChange, summaryOf, withSeatCount, youSeatOf } from "../../src/lobby/lobby";
import { decode } from "../../src/net/decode";
import { serverFixture } from "./support/sheetState";

function table(name: string, change: (state: any) => void = () => undefined): TableState {
  const message = structuredClone(serverFixture(name));
  change(message);
  const decoded = decode(JSON.stringify(message));
  if (decoded.type !== "tableState") {
    throw new Error("not a table state");
  }
  const { type: _type, seq: _seq, ...state } = decoded;
  return state;
}

function lobbyTable(change: (state: any) => void = () => undefined): TableState {
  return table("tableState.online", (state) => {
    state.state = "lobby";
    change(state);
  });
}

describe("the lobby's model", () => {
  const state = table("tableState.online");

  it("finds your seat, who hosts, and how many seats are open", () => {
    const view = lobbyFor(state);
    expect(view.code).toBe(state.code);
    expect(view.youSeat).toBe(0);
    expect(view.isHost).toBe(true);
    expect(view.open).toBe(0);
    expect(view.seats.map((seat) => [seat.kind, seat.name, seat.you, seat.host])).toEqual([
      ["human", "Ana", true, true],
      ["human", "Bogdan", false, false],
      ["computer", "Cora", false, false],
    ]);
    expect(view.seats[2].level).toBe("cyborg");
  });

  it("is the host's alone to start, and only once every seat is filled", () => {
    expect(lobbyFor(lobbyTable()).canStart).toBe(true);
    const open = lobbyTable((s) => {
      s.seats[2] = { kind: "open" };
    });
    expect(lobbyFor(open).open).toBe(1);
    expect(lobbyFor(open).canStart).toBe(false);
    // A guest at the same table: the seat that is theirs is the second, and the host is the first.
    const guest = lobbyTable((s) => {
      s.seats[0].you = false;
      s.seats[1].you = true;
    });
    const view = lobbyFor(guest);
    expect(view.youSeat).toBe(1);
    expect(view.isHost).toBe(false);
    expect(view.canStart).toBe(false);
  });

  it("has no seat of yours, and no hosting, for a table you are not at", () => {
    const stranger = lobbyTable((s) => {
      s.seats[0].you = false;
    });
    expect(youSeatOf(stranger)).toBeNull();
    expect(lobbyFor(stranger).isHost).toBe(false);
  });

  it("is not hosted by a table whose host has no seat, as a watched solo game", () => {
    const watched = lobbyTable((s) => {
      s.host = null;
    });
    expect(lobbyFor(watched).isHost).toBe(false);
  });

  it("reads who is here, away or replaced from the table's states", () => {
    const presence = (name: string): (Presence | null)[] => lobbyFor(table(name)).seats.map((seat) => seat.presence);
    expect(presence("tableState.online")).toEqual(["here", "here", null].map((each, index) => (index === 1 ? lobbyFor(table("tableState.online")).seats[1].presence : each)));
    expect(presence("tableState.waiting")).toEqual(["here", "away", null]);
    expect(presence("tableState.replaced")).toEqual(["here", "replaced", null]);
    expect(presenceText("away")).toBe("Away");
    expect(presenceText("replaced")).toBe("Replaced");
    expect(presenceText("here")).toBe("");
    expect(presenceText(null)).toBe("");
  });
});

describe("who is away or replaced, as a man or a woman", () => {
  afterEach(() => setLanguage("en"));

  it("is the same words in English whoever it is about", () => {
    expect(presenceText("away", "female")).toBe("Away");
    expect(presenceText("replaced", "female")).toBe("Replaced");
    expect(presenceText("away", null)).toBe("Away");
  });

  it("agrees with the person in Romanian, and is a man's where the person is not known", () => {
    setLanguage("ro");
    expect(presenceText("away", "male")).toBe("Plecat");
    expect(presenceText("away", "female")).toBe("Plecată");
    expect(presenceText("replaced", "male")).toBe("Înlocuit");
    expect(presenceText("replaced", "female")).toBe("Înlocuită");
    expect(presenceText("away", null)).toBe("Plecat");
    expect(presenceText("here", "female")).toBe("");
  });
});

describe("what the host's controls send", () => {
  const state = lobbyTable((s) => {
    s.seats[2] = { kind: "open" };
    s.settings.seats[2] = { kind: "open" };
  });

  it("makes a seat open or a computer player of a level, for the seat it names", () => {
    expect(seatChoice(2, "open")).toEqual({ type: "setSeat", seat: 2, kind: "open" });
    expect(seatChoice(2, "ducking")).toEqual({ type: "setSeat", seat: 2, kind: "computer", level: "ducking" });
  });

  it("offers to fill every open seat with computer players of one level, and no other", () => {
    expect(fillMessages(lobbyFor(state), "low-risk")).toEqual([{ type: "setSeat", seat: 2, kind: "computer", level: "low-risk" }]);
    expect(fillMessages(lobbyFor(table("tableState.online")), "low-risk")).toEqual([]);
  });

  it("sends the table's whole settings with the one change, as the server takes them", () => {
    const sent = settingsChange(state, { turnTimer: 10000 });
    expect(sent).toEqual({ type: "updateSettings", settings: { ...state.settings, turnTimer: 10000 } });
  });

  it("changes the seat count by the number of seats alone: new seats are open, and the end is cut", () => {
    const more = withSeatCount(state, 5);
    expect(more.type === "updateSettings" && more.settings.seats.map((seat) => seat.kind)).toEqual(["human", "human", "open", "open", "open"]);
    const fewer = withSeatCount(state, 2);
    expect(fewer.type === "updateSettings" && fewer.settings.seats).toHaveLength(2);
    const bounded = withSeatCount(state, 99);
    expect(bounded.type === "updateSettings" && bounded.settings.seats).toHaveLength(6);
    const floor = withSeatCount(state, 0);
    expect(floor.type === "updateSettings" && floor.settings.seats).toHaveLength(2);
  });

  it("cannot cut the table below its last held seat, nor below two", () => {
    expect(fewestSeats(lobbyFor(state))).toBe(2);
    expect(fewestSeats(lobbyFor(table("tableState.online")))).toBe(3);
  });
});

describe("the one line that says what a table deals", () => {
  it("is the shape, the rounds and the turn timer", () => {
    expect(summaryOf(table("tableState.online").settings)).toBe("1-8-1 · 23 rounds · 60 s a turn");
  });

  it("says no timer for none, and the number of seconds for the rest", () => {
    expect(summaryOf({ ...table("tableState.online").settings, turnTimer: 0 })).toBe("1-8-1 · 23 rounds · no turn timer");
    expect(summaryOf({ ...table("tableState.online").settings, turnTimer: 10000 })).toBe("1-8-1 · 23 rounds · 10 s a turn");
  });
});

describe("the seat-count field", () => {
  it("reads a whole number, and nothing from a field that is empty or holds anything else", () => {
    expect(seatCountFrom("4")).toBe(4);
    expect(seatCountFrom(" 6 ")).toBe(6);
    expect(seatCountFrom("")).toBeNull();
    expect(seatCountFrom("  ")).toBeNull();
    expect(seatCountFrom("3.5")).toBeNull();
    expect(seatCountFrom("many")).toBeNull();
  });
});

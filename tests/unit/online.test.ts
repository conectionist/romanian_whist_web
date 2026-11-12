import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n/language";
import { seededRandom } from "../../src/lobby/catalogue";
import { DEFAULT_TURN_TIMER, TURN_TIMERS, defaultTable, tableError, tableSettingsFor, timerLabel, withSeats } from "../../src/lobby/online";

afterEach(() => setLanguage("en"));

const host = { name: "Hana", gender: "female" as const, avatar: "woman-long-red-hair" };

describe("a table to create", () => {
  const table = defaultTable(host, seededRandom(4));

  it("seats four: you, a computer player, and two seats open for people", () => {
    expect(table.seats).toBe(4);
    expect(table.others.map((seat) => seat.kind)).toEqual(["computer", "open", "open"]);
    expect(table.replacement).toBe("reckoner-beta");
    expect(table.turnTimer).toBe(DEFAULT_TURN_TIMER);
    expect(tableError(table, host)).toBeNull();
  });

  it("draws the computer player a name that is not yours", () => {
    const first = table.others[0];
    expect(first.kind === "computer" && first.name.toLowerCase()).not.toBe("hana");
    expect(first.kind === "computer" && first.name).not.toBe("");
  });

  it("keeps the seats it had when cut or grown, and grows with open seats, between two and six", () => {
    expect(withSeats(table, 6).others.map((seat) => seat.kind)).toEqual(["computer", "open", "open", "open", "open"]);
    expect(withSeats(table, 2).others.map((seat) => seat.kind)).toEqual(["computer"]);
    expect(withSeats(table, 1).seats).toBe(2);
    expect(withSeats(table, 9).seats).toBe(6);
    expect(withSeats(table, 3).others[0]).toEqual(table.others[0]);
  });

  it("refuses names that are alike, empty or too long, as New Game does, yours included", () => {
    const named = (name: string) => ({ ...table, others: [{ kind: "computer" as const, name, gender: "male" as const, level: "low-risk" as const }, ...table.others.slice(1)] });
    expect(tableError(named("hana"), host)).toBe("Two players cannot both be called hana.");
    expect(tableError(named(""), host)).toBe("Every player needs a name.");
    expect(tableError(named("x".repeat(21)), host)).toBe("Names are at most 20 characters.");
    expect(tableError(table, { ...host, name: " " })).toBe("Every player needs a name.");
  });

  it("has no names to check for open seats", () => {
    expect(tableError({ ...table, others: [{ kind: "open" }] , seats: 2 }, host)).toBeNull();
  });
});

describe("the settings a table is made from", () => {
  const table = defaultTable(host, seededRandom(4));
  const settings = tableSettingsFor(table, host, seededRandom(1));

  it("hold you as the first seat, open, and then the others as asked, at least one of them open", () => {
    expect(settings.seats[0]).toEqual({ kind: "open" });
    expect(settings.seats.map((seat) => seat.kind)).toEqual(["open", "computer", "open", "open"]);
    expect(settings.seats.filter((seat) => seat.kind === "open").length).toBeGreaterThanOrEqual(1);
  });

  it("give a computer player a face that suits it, and send no seed, which an online table refuses", () => {
    const computer = settings.seats[1];
    expect(computer.kind === "computer" && computer.avatar).not.toBe("");
    expect("seed" in settings).toBe(false);
  });

  it("carry the replacement player and the timer, and a timer of none as zero rather than leaving it out", () => {
    expect(settings.replacement).toBe("reckoner-beta");
    expect(settings.turnTimer).toBe(60000);
    expect(tableSettingsFor({ ...table, turnTimer: 0 }, host).turnTimer).toBe(0);
    expect(tableSettingsFor({ ...table, replacement: "ducking", turnTimer: 10000 }, host)).toMatchObject({ replacement: "ducking", turnTimer: 10000 });
  });
});

describe("how long a turn may take", () => {
  it("offers none and then ten seconds to five minutes, the server's range", () => {
    expect(TURN_TIMERS[0]).toBe(0);
    expect(TURN_TIMERS.slice(1).every((ms) => ms >= 10000 && ms <= 3600000)).toBe(true);
    expect(TURN_TIMERS).toContain(10000);
  });

  it("is said in seconds under a minute and in minutes above it", () => {
    expect(TURN_TIMERS.map(timerLabel)).toEqual(["No timer", "10 seconds", "30 seconds", "1 minute", "2 minutes", "5 minutes"]);
  });

  it("is a singular for one second, in English", () => {
    expect(timerLabel(1000)).toBe("1 second");
  });

  it("is said with the form of Romanian that its number takes", () => {
    setLanguage("ro");
    expect(TURN_TIMERS.map(timerLabel)).toEqual(["Fără timp limită", "10 secunde", "30 de secunde", "1 minut", "2 minute", "5 minute"]);
    expect(timerLabel(20000)).toBe("20 de secunde");
    expect(timerLabel(1000)).toBe("1 secundă");
  });
});

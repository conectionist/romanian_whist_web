import { describe, expect, it } from "vitest";
import { seededRandom } from "../../src/lobby/catalogue";
import {
  MAX_NAME_LENGTH,
  defaults,
  defaultLevel,
  estimatedMinutes,
  firstError,
  isReservedName,
  nameError,
  levelName,
  loadSetup,
  opponentRange,
  pacingFor,
  saveSetup,
  seatCount,
  settingsFor,
  summaryText,
  wearersOf,
  type Setup,
} from "../../src/lobby/setup";

function setup(change: Partial<Setup> = {}): Setup {
  return {
    spectator: false,
    human: { name: "Player", gender: "male" },
    bots: [
      { name: "Ana", gender: "female", level: "low-risk" },
      { name: "Bogdan", gender: "male", level: "ducking" },
      { name: "Cristina", gender: "female", level: "low-risk" },
    ],
    structure: "1-8-1",
    foreheadAndHidden: true,
    allOneCardForehead: false,
    botSpeed: 2,
    waitAfterRound: false,
    seed: null,
    ...change,
  };
}

describe("the defaults", () => {
  const made = defaults(seededRandom(11));

  it("seat you and three opponents, on 1-8-1 with the two last rounds", () => {
    expect(made.spectator).toBe(false);
    expect(made.human).toEqual({ name: "Player", gender: "male" });
    expect(made.bots).toHaveLength(3);
    expect(seatCount(made)).toBe(4);
    expect([made.structure, made.foreheadAndHidden, made.allOneCardForehead, made.botSpeed, made.waitAfterRound, made.seed]).toEqual(["1-8-1", true, false, 2, false, null]);
  });

  it("give the opponents the terminal's quick-game levels, and names that suit them and are not twins", () => {
    expect(made.bots.map((bot) => bot.level)).toEqual(["reckoner-beta", "cyborg", "low-risk"]);
    expect(new Set([made.human.name, ...made.bots.map((bot) => bot.name.toLowerCase())]).size).toBe(4);
    expect(firstError(made)).toBeNull();
  });

  it("go round the four levels, a fourth Reckoner after the three, and begin again", () => {
    expect([0, 1, 2, 3, 4, 5].map(defaultLevel)).toEqual(["reckoner-beta", "cyborg", "low-risk", "reckoner-gamma", "reckoner-beta", "cyborg"]);
  });
});

describe("the levels", () => {
  it("are named as the desktop names them", () => {
    expect(levelName("reckoner-alpha")).toBe("Reckoner (Alpha)");
    expect(levelName("first-card")).toBe("First card");
  });
});

describe("how many opponents", () => {
  it("is one to five when you play and two to six when you watch", () => {
    expect(opponentRange(true)).toEqual({ min: 1, max: 5 });
    expect(opponentRange(false)).toEqual({ min: 2, max: 6 });
  });

  it("counts a seat for you only when you play", () => {
    expect(seatCount(setup())).toBe(4);
    expect(seatCount(setup({ spectator: true }))).toBe(3);
  });
});

describe("the summary line", () => {
  it("counts the rounds exactly: 3N + 12, and two more with the Forehead and the Hidden round", () => {
    expect(summaryText(setup({ foreheadAndHidden: false }))).toMatch(/^24 rounds/);
    expect(summaryText(setup())).toMatch(/^26 rounds/);
    expect(summaryText(setup({ spectator: true }))).toMatch(/^23 rounds/);
  });

  it("estimates a played game at about 30 minutes for two and 5 more for each player added, at the default speed", () => {
    const at = (bots: number) => setup({ bots: setup().bots.slice(0, 3).concat(setup().bots).slice(0, bots) });
    expect(estimatedMinutes(at(1))).toBe(30);
    expect(estimatedMinutes(at(3))).toBe(40);
    expect(estimatedMinutes(setup({ bots: [at(1).bots[0]], botSpeed: 2 }))).toBe(30);
  });

  it("takes off what the computer players wait at a faster speed, and adds it at a slower", () => {
    expect(estimatedMinutes(setup({ botSpeed: 4 }))).toBeLessThan(estimatedMinutes(setup()));
    expect(estimatedMinutes(setup({ botSpeed: 0 }))).toBeGreaterThan(estimatedMinutes(setup()));
  });

  it("counts a watched game by the computer players' pace, and has no time to give at the instant end", () => {
    expect(estimatedMinutes(setup({ spectator: true, botSpeed: 4 }))).toBe(0);
    expect(summaryText(setup({ spectator: true, botSpeed: 4 }))).toBe("23 rounds");
    expect(estimatedMinutes(setup({ spectator: true, botSpeed: 2 }))).toBeGreaterThan(0);
  });

  it("says about a minute, and about so many minutes, in their own sentences", () => {
    expect(summaryText(setup({ spectator: true, botSpeed: 3 }))).toMatch(/^23 rounds - about (a minute|\d+ minutes)$/);
    expect(summaryText(setup())).toBe("26 rounds - about 40 minutes");
  });

  it("has the pace's multiples of the defaults, Slow to Instant", () => {
    expect([0, 1, 2, 3, 4].map((stop) => pacingFor(stop).beat)).toEqual([1400, 1050, 700, 350, 0]);
    expect(pacingFor(9)).toEqual({ beat: 0, spectatorBeat: 0, trickDwell: 0 });
    expect(pacingFor(-1).trickDwell).toBe(2400);
  });
});

describe("the validation", () => {
  it("passes a setup with every player named and no two alike", () => {
    expect(firstError(setup())).toBeNull();
  });

  it("refuses a table of the wrong size, naming the bounds", () => {
    expect(firstError(setup({ bots: [] }))).toBe("A game needs between 2 and 6 players.");
    expect(firstError(setup({ spectator: true, bots: [setup().bots[0]] }))).toBe("A game needs between 2 and 6 players.");
    const seven = Array.from({ length: 6 }, (_, index) => ({ name: `Bot ${index}`, gender: "male" as const, level: "random" as const }));
    expect(firstError(setup({ bots: seven }))).toBe("A game needs between 2 and 6 players.");
  });

  it("refuses a name of nothing, or of spaces, and one past twenty characters", () => {
    expect(firstError(setup({ human: { name: "", gender: "male" } }))).toBe("Every player needs a name.");
    expect(firstError(setup({ human: { name: "   ", gender: "male" } }))).toBe("Every player needs a name.");
    expect(firstError(setup({ human: { name: "x".repeat(MAX_NAME_LENGTH + 1), gender: "male" } }))).toBe("Names are at most 20 characters.");
    expect(firstError(setup({ human: { name: "x".repeat(MAX_NAME_LENGTH), gender: "male" } }))).toBeNull();
  });

  it("counts characters, not the code units of an emoji", () => {
    expect(firstError(setup({ human: { name: "🙂".repeat(MAX_NAME_LENGTH), gender: "male" } }))).toBeNull();
  });

  it("refuses two names that differ only in case, and names the second", () => {
    const twins = setup({ bots: [{ name: "ana", gender: "female", level: "random" }, { name: "Ana", gender: "female", level: "random" }] });
    expect(firstError(twins)).toBe("Two players cannot both be called Ana.");
    expect(firstError(setup({ human: { name: "ANA", gender: "male" } }))).toBe("Two players cannot both be called Ana.");
  });

  it("ignores your name while you watch, since you have no seat", () => {
    expect(firstError(setup({ spectator: true, human: { name: "", gender: "male" } }))).toBeNull();
    expect(firstError(setup({ spectator: true, human: { name: "Ana", gender: "male" } }))).toBeNull();
  });

  it("reads a name as typed, markup and all", () => {
    expect(firstError(setup({ bots: [{ name: "<b>Ana</b>", gender: "female", level: "random" }, { name: "<b>Ana</b>", gender: "female", level: "random" }] }))).toBe(
      "Two players cannot both be called <b>Ana</b>.",
    );
  });
});

describe("the settings a game is dealt from", () => {
  it("put you first, then the opponents, each with a face that suits them", () => {
    const settings = settingsFor(setup({ seed: 5 }));
    expect(settings.seats.map((seat) => seat.kind)).toEqual(["human", "computer", "computer", "computer"]);
    const first = settings.seats[0];
    expect(first).toMatchObject({ kind: "human", name: "Player", gender: "male" });
    for (const seat of settings.seats) {
      expect((seat as { avatar: string }).avatar).not.toBe("");
    }
    expect(settings.seats[2]).toMatchObject({ kind: "computer", level: "ducking", name: "Bogdan" });
    expect([settings.structure, settings.foreheadAndHidden, settings.allOneCardForehead, settings.botSpeed, settings.waitAfterRound, settings.seed]).toEqual(["1-8-1", true, false, 2, false, 5]);
  });

  it("have no human seat when you watch, and no seed unless the deal is fixed", () => {
    const settings = settingsFor(setup({ spectator: true }));
    expect(settings.seats.map((seat) => seat.kind)).toEqual(["computer", "computer", "computer"]);
    expect("seed" in settings).toBe(false);
  });

  it("deal the same faces for the same fixed deal, and are seen to differ otherwise", () => {
    const faces = (settings: ReturnType<typeof settingsFor>) => settings.seats.map((seat) => (seat as { avatar: string }).avatar);
    expect(faces(settingsFor(setup({ seed: 8 })))).toEqual(faces(settingsFor(setup({ seed: 8 }), seededRandom(1))));
  });

  it("describe their wearers in seat order", () => {
    expect(wearersOf(setup()).map((wearer) => wearer.strategy)).toEqual(["", "low-risk", "ducking", "low-risk"]);
    expect(wearersOf(setup({ spectator: true }))).toHaveLength(3);
  });
});

describe("what is remembered between games", () => {
  function memory() {
    const kept = new Map<string, string>();
    return { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) };
  }

  it("is read back as it was kept", () => {
    const storage = memory();
    saveSetup(setup({ seed: 12, structure: "8-1-8" }), storage);
    expect(loadSetup(storage)).toEqual(setup({ seed: 12, structure: "8-1-8" }));
  });

  it("is nothing when nothing was kept, or what was kept cannot be read", () => {
    expect(loadSetup(memory())).toBeNull();
    const storage = memory();
    storage.setItem("whist.setup", "{not json");
    expect(loadSetup(storage)).toBeNull();
    storage.setItem("whist.setup", JSON.stringify({ ...setup(), bots: [{ name: "x", gender: "male", level: "nobody" }] }));
    expect(loadSetup(storage)).toBeNull();
    expect(loadSetup(null)).toBeNull();
  });

  it("is lost quietly when storage refuses", () => {
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveSetup(setup(), refusing)).not.toThrow();
    expect(loadSetup(refusing)).toBeNull();
  });
});

describe("names the server refuses", () => {
  it("are refused before a table is left for them: a control or bidirectional character", () => {
    expect(nameError(["Ana", "Bo\u202Egdan"])).toBe("A name cannot hold control characters.");
    expect(nameError(["Ana\u0007"])).toBe("A name cannot hold control characters.");
    expect(nameError(["Ana", "Ștefan"])).toBeNull();
  });

  it("are refused when they read as a low-risk or ducking player and the seat is not one", () => {
    expect(isReservedName("Ducking Dan")).toBe(true);
    expect(isReservedName("LOWRISK")).toBe(true);
    // Width and invisible characters are set aside, as the server sets them aside.
    expect(isReservedName("\uFF24ucking")).toBe(true);
    expect(isReservedName("Low\u200BRisk")).toBe(true);
    // Spaces and punctuation are not: the server takes these names.
    expect(isReservedName("Low Risk Larry")).toBe(false);
    expect(isReservedName("low-risk Lia")).toBe(false);
    expect(isReservedName("Duc King")).toBe(false);
    expect(isReservedName("Duck")).toBe(false);
    const made = defaults(seededRandom(1));
    const named = (level: typeof made.bots[0]["level"]) => ({ ...made, bots: [{ ...made.bots[0], name: "Ducking Dan", level }, ...made.bots.slice(1)] });
    expect(firstError(named("cyborg"))).toContain("Ducking");
    expect(firstError(named("ducking"))).toBeNull();
    expect(firstError({ ...made, human: { ...made.human, name: "LowRisk" } })).toContain("LowRisk");
  });
});

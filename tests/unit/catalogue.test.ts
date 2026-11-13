import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n/language";
import { assignFaces, avatarCatalogue, drawName, faceName, facesFor, nameCatalogue, seededRandom, suits, type Avatar, type NameEntry } from "../../src/lobby/catalogue";
import { LEVELS } from "../../src/net/protocol";

const names = nameCatalogue();
const faces = avatarCatalogue();

function entry(name: string, extra: Partial<NameEntry> = {}): NameEntry {
  return { name, gender: null, language: null, strategy: "", ...extra };
}

describe("the catalogues the server serves", () => {
  it("are read whole, and every dedicated name and face is for a level the game has", () => {
    expect(names.length).toBeGreaterThan(40);
    expect(faces).toHaveLength(17);
    for (const each of [...names, ...faces]) {
      expect(each.strategy === "" || (LEVELS as readonly string[]).includes(each.strategy), each.strategy).toBe(true);
    }
  });

  it("have names enough in each language for the largest table of one gender", () => {
    for (const language of ["en", "ro"] as const) {
      for (const gender of ["male", "female"] as const) {
        expect(names.filter((each) => suits(each, gender, language) && each.strategy === "").length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("have a face anyone of either gender can choose", () => {
    expect(facesFor("male").length).toBeGreaterThan(3);
    expect(facesFor("female").length).toBeGreaterThan(3);
    expect(facesFor("male").every((id) => faces.find((face) => face.id === id)?.strategy === "")).toBe(true);
  });
});

describe("a name for a computer player", () => {
  const random = seededRandom(7);

  it("is of its gender and the language", () => {
    for (let draws = 0; draws < 40; draws++) {
      const name = drawName({ gender: "female", strategy: "low-risk" }, "en", names, [], 1, random);
      const found = names.filter((each) => each.name === name);
      expect(found.some((each) => suits(each, "female", "en")), name).toBe(true);
    }
  });

  it("is one of its level's own names when it has any, and nobody else gets those", () => {
    const own = names.filter((each) => each.strategy === "cyborg" && suits(each, "male", "en")).map((each) => each.name);
    expect(own.length).toBeGreaterThan(0);
    for (let draws = 0; draws < 30; draws++) {
      expect(own).toContain(drawName({ gender: "male", strategy: "cyborg" }, "en", names, [], 1, random));
    }
    const kept = new Set(names.filter((each) => each.strategy !== "").map((each) => each.name));
    const others = names.filter((each) => each.strategy === "");
    for (let draws = 0; draws < 60; draws++) {
      const name = drawName({ gender: "male", strategy: "low-risk" }, "en", names, [], 1, random);
      const own = names.filter((each) => each.name === name);
      expect(own.some((each) => each.strategy === "" || each.strategy === "low-risk"), name).toBe(true);
      expect(others.length).toBeGreaterThan(0);
      expect(kept.size).toBeGreaterThan(0);
    }
  });

  it("is never one at the table already, whatever the case", () => {
    const list = [entry("Ana"), entry("Bogdan")];
    for (let draws = 0; draws < 20; draws++) {
      expect(drawName({ gender: "male", strategy: "" }, "en", list, ["ANA"], 1, random)).toBe("Bogdan");
    }
  });

  it("runs out into the next group, and then into a placeholder that is free", () => {
    const list = [entry("Dan", { strategy: "cyborg" }), entry("Eli")];
    expect(drawName({ gender: "male", strategy: "cyborg" }, "en", list, ["Dan"], 2, random)).toBe("Eli");
    expect(drawName({ gender: "male", strategy: "cyborg" }, "en", list, ["Dan", "Eli"], 2, random)).toBe("Bot 2");
    expect(drawName({ gender: "male", strategy: "cyborg" }, "en", list, ["Dan", "Eli", "bot 2"], 2, random)).toBe("Bot 3");
  });

  it("is drawn again the same way from the same seed, and every name of a group is sometimes drawn", () => {
    const list = [entry("A"), entry("B"), entry("C")];
    const draw = (seed: number) => drawName({ gender: "male", strategy: "" }, "en", list, [], 1, seededRandom(seed));
    expect(draw(5)).toBe(draw(5));
    const seen = new Set(Array.from({ length: 60 }, (_, seed) => draw(seed)));
    expect([...seen].sort()).toEqual(["A", "B", "C"]);
  });
});

describe("faces for a table", () => {
  const random = seededRandom(3);

  it("go to each player of their own gender, and to none twice while there are enough", () => {
    const given = assignFaces(
      [
        { gender: "male", strategy: "" },
        { gender: "female", strategy: "" },
        { gender: "male", strategy: "" },
        { gender: "female", strategy: "" },
        { gender: "male", strategy: "" },
      ],
      faces,
      random,
    );
    expect(new Set(given).size).toBe(5);
    given.forEach((id, index) => {
      const face = faces.find((each) => each.id === id) as Avatar;
      expect(face.gender === null || face.gender === (index % 2 === 0 ? "male" : "female")).toBe(true);
      expect(face.strategy).toBe("");
    });
  });

  it("start over among all of a gender's when it runs out", () => {
    const only = faces.filter((face) => face.gender === "female" && face.strategy === "");
    const wearers = Array.from({ length: only.length + 2 }, () => ({ gender: "female" as const, strategy: "" }));
    const given = assignFaces(wearers, only, seededRandom(1));
    expect(given.slice(0, only.length).sort()).toEqual(only.map((face) => face.id).sort());
    expect(only.map((face) => face.id)).toContain(given[only.length]);
  });

  it("go to a level's bots from its own, which nobody else wears, and two bots of a level can share its only face", () => {
    const given = assignFaces([{ gender: "female", strategy: "cyborg" }, { gender: "female", strategy: "cyborg" }], faces, random);
    expect(given).toEqual(["cyborg-woman-eye", "cyborg-woman-eye"]);
    const people = assignFaces(Array.from({ length: 40 }, () => ({ gender: "male" as const, strategy: "" })), faces, random);
    expect(people.every((id) => !id.startsWith("cyborg"))).toBe(true);
  });

  it("are the same from the same seed, and give a wearer no face suits an empty one", () => {
    const wearers = [{ gender: "male" as const, strategy: "" }, { gender: "female" as const, strategy: "" }];
    expect(assignFaces(wearers, faces, seededRandom(9))).toEqual(assignFaces(wearers, faces, seededRandom(9)));
    expect(assignFaces(wearers, [], random)).toEqual(["", ""]);
  });

  it("let a gender-neutral face be worn by one at a time, though each gender runs through its own", () => {
    const neutral: Avatar = { id: "any", gender: null, strategy: "" };
    const one: Avatar = { id: "m", gender: "male", strategy: "" };
    const given = assignFaces([{ gender: "male", strategy: "" }, { gender: "female", strategy: "" }, { gender: "male", strategy: "" }], [one, neutral], seededRandom(2));
    expect(given[1]).toBe("any");
    expect(new Set([given[0], given[2]]).size).toBe(2);
  });
});

describe("what a portrait is called", () => {
  afterEach(() => setLanguage("en"));

  const chosen = [...facesFor("male"), ...facesFor("female")];

  it("is a description for each of the faces a person may choose, and not its file name", () => {
    expect(chosen).toHaveLength(12);
    for (const id of chosen) {
      expect(faceName(id), id).not.toBe(id.replace(/-/g, " "));
      expect(faceName(id).length, id).toBeGreaterThan(10);
    }
    expect(new Set(chosen.map(faceName)).size).toBe(chosen.length);
  });

  it("is a man or a woman as the face is", () => {
    for (const id of facesFor("male")) {
      expect(faceName(id), id).toMatch(/^Man /);
    }
    for (const id of facesFor("female")) {
      expect(faceName(id), id).toMatch(/^Woman /);
    }
  });

  it("is in Romanian when the page is, and the id with spaces for a face it has no words for", () => {
    setLanguage("ro");
    expect(faceName("man-stubble")).toBe("Bărbat nebărbierit");
    expect(faceName("woman-wavy-black-hair")).toBe("Femeie cu păr negru ondulat");
    expect(faceName("cyborg-man-bald")).toBe("cyborg man bald");
    for (const id of chosen) {
      expect(faceName(id), id).toMatch(/^(Bărbat|Femeie) /);
    }
  });
});

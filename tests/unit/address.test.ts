import { describe, expect, it } from "vitest";
import { linkFor, pathFor, tableCodeFrom } from "../../src/lobby/address";
import { codeError, faceFor, loadProfile, normalizeCode, profileError, saveProfile } from "../../src/lobby/profile";

describe("a table's address", () => {
  it("is /t/ and six capital letters or digits, which the server answers with the page", () => {
    expect(tableCodeFrom("/t/JFXB3J")).toBe("JFXB3J");
    expect(tableCodeFrom("/t/JFXB3J/")).toBe("JFXB3J");
    expect(tableCodeFrom("/t/ABC234")).toBe("ABC234");
  });

  it("is no table's when the code is lowercase, the wrong length, or somewhere else", () => {
    for (const path of ["/", "/t/", "/t/jfxb3j", "/t/JFXB3", "/t/JFXB3JK", "/x/JFXB3J", "/t/JFXB3J/more", "/ws"]) {
      expect(tableCodeFrom(path), path).toBeNull();
    }
  });

  it("is written back from a table's code, and the root for none", () => {
    expect(pathFor("JFXB3J")).toBe("/t/JFXB3J");
    expect(pathFor(null)).toBe("/");
    expect(tableCodeFrom(pathFor("JFXB3J"))).toBe("JFXB3J");
    expect(linkFor("JFXB3J", "https://whist.example.org")).toBe("https://whist.example.org/t/JFXB3J");
  });
});

describe("a code as it is typed", () => {
  it("is read in either case, with spaces and dashes taken out", () => {
    expect(normalizeCode("abc234")).toBe("ABC234");
    expect(normalizeCode(" abc 234 ")).toBe("ABC234");
    expect(normalizeCode("ab-c2-34")).toBe("ABC234");
  });

  it("is read out of a whole link, which is what gets pasted", () => {
    expect(normalizeCode("https://whist.example.org/t/jfxb3j")).toBe("JFXB3J");
    expect(normalizeCode("http://127.0.0.1:8080/t/JFXB3J?x=1")).toBe("JFXB3J");
  });

  it("is a code only with six of A to Z and 0 to 9", () => {
    expect(codeError("JFXB3J")).toBeNull();
    for (const bad of ["", "JFXB3", "JFXB3JK", "jfxb3j"]) {
      expect(codeError(bad), bad).not.toBeNull();
    }
    expect(codeError("")).toBe("A table's code is six letters and digits.");
  });
});

describe("who you are online", () => {
  const profile = { name: "Ana", gender: "female" as const, avatar: "woman-long-red-hair" };

  it("needs a name that is something and fits a panel", () => {
    expect(profileError(profile)).toBeNull();
    expect(profileError({ ...profile, name: "" })).toBe("Choose a name.");
    expect(profileError({ ...profile, name: "   " })).toBe("Choose a name.");
    expect(profileError({ ...profile, name: "x".repeat(21) })).toBe("Names are at most 20 characters.");
  });

  it("keeps a portrait that suits the gender, and the first that does when it does not", () => {
    expect(faceFor("female", "woman-long-red-hair")).toBe("woman-long-red-hair");
    expect(faceFor("male", "woman-long-red-hair")).not.toBe("woman-long-red-hair");
    expect(faceFor("male", "man-dark-hair-beard")).toBe("man-dark-hair-beard");
    expect(faceFor("male", "cyborg-man-eye")).not.toBe("cyborg-man-eye");
  });

  it("is kept and read back, and what is kept that cannot be read is nothing", () => {
    const kept = new Map<string, string>();
    const storage = { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) };
    expect(loadProfile(storage)).toBeNull();
    saveProfile(profile, storage);
    expect(loadProfile(storage)).toEqual(profile);
    kept.set("whist.profile", JSON.stringify({ ...profile, avatar: "no-such-face" }));
    expect(loadProfile(storage)).toBeNull();
    kept.set("whist.profile", "{");
    expect(loadProfile(storage)).toBeNull();
  });
});

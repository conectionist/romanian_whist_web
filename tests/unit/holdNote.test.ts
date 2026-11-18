import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n/language";
import { holdNote } from "../../src/sheets/roundSheet";
import type { Seating } from "../../src/sheets/seating";

afterEach(() => setLanguage("en"));

// Seats 1 to 4: Ana and Cleo are women, Bogdan and Dan men.
const seating: Seating = { names: ["Player", "Ana", "Bogdan", "Cleo", "Dan"], genders: ["male", "female", "male", "female", "male"], you: 0 };

describe("whom the round hold says it waits for", () => {
  it("is the same sentence in English whoever they are", () => {
    expect(holdNote([1], seating, null)).toBe("Waiting for Ana.");
    expect(holdNote([2], seating, null)).toBe("Waiting for Bogdan.");
    expect(holdNote([1, 3], seating, null)).toBe("Waiting for Ana and Cleo.");
    expect(holdNote([1, 2], seating, 22.4)).toBe("Waiting for Ana and Bogdan: 23 s");
    expect(holdNote([], seating, 5)).toBe("");
  });

  it("is said of one man as him, of one woman as her, of several with a man among them as them, and of several women as them", () => {
    setLanguage("ro");
    expect(holdNote([2], seating, null)).toBe("Îl așteptăm pe Bogdan.");
    expect(holdNote([1], seating, null)).toBe("O așteptăm pe Ana.");
    expect(holdNote([1, 2], seating, null)).toBe("Îi așteptăm pe Ana și Bogdan.");
    expect(holdNote([1, 3], seating, null)).toBe("Le așteptăm pe Ana și Cleo.");
  });

  it("says it with the seconds left in each of the four", () => {
    setLanguage("ro");
    expect(holdNote([2], seating, 9.2)).toBe("Îl așteptăm pe Bogdan: 10 s");
    expect(holdNote([1], seating, 9.2)).toBe("O așteptăm pe Ana: 10 s");
    expect(holdNote([2, 4], seating, 9.2)).toBe("Îi așteptăm pe Bogdan și Dan: 10 s");
    expect(holdNote([1, 3], seating, 0)).toBe("Le așteptăm pe Ana și Cleo: 0 s");
  });

  it("takes a seat it knows nothing of for a man's", () => {
    setLanguage("ro");
    expect(holdNote([7], { ...seating, names: [...seating.names, "", "", "", "Eve"] }, null)).toBe("Îl așteptăm pe .");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { startIn } from "../../src/i18n/document";
import { currentLanguage, setLanguage } from "../../src/i18n/language";

afterEach(() => setLanguage("en"));

describe("starting the page in a language", () => {
  it("sets the language, the document's lang and its title", () => {
    const page = { title: "Romanian Whist", documentElement: { lang: "en" } };
    startIn("ro", page);
    expect(currentLanguage()).toBe("ro");
    expect(page.documentElement.lang).toBe("ro");
    expect(page.title).toBe("Whist");
  });

  it("titles an English page as the game is named in English", () => {
    const page = { title: "", documentElement: { lang: "" } };
    startIn("en", page);
    expect(currentLanguage()).toBe("en");
    expect(page.documentElement.lang).toBe("en");
    expect(page.title).toBe("Romanian Whist");
  });

  it("sets the language before it makes the title, so the title is in it", () => {
    const page = { title: "", documentElement: { lang: "" } };
    startIn("ro", page);
    startIn("en", page);
    startIn("ro", page);
    expect(page.title).toBe("Whist");
  });
});

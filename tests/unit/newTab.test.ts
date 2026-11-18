import { afterEach, describe, expect, it } from "vitest";
import { opensInNewTab } from "../../src/dom/newTab";
import { setLanguage } from "../../src/i18n/language";
import { t } from "../../src/i18n/t";

afterEach(() => setLanguage("en"));

// What a footer link shows, and what a screen reader says for it. The name has to hold the visible words, so that a
// person who speaks them to a voice control finds the link.
const SHOWN: Record<string, [string, string]> = { en: ["server", "page"], ro: ["server", "pagina"] };

describe("the name of a link that opens in a tab of its own", () => {
  it("puts the label first and says so after it, in English", () => {
    expect(opensInNewTab("Server source code")).toBe("Server source code (opens in a new tab)");
  });

  it("says it in Romanian, with the label first", () => {
    setLanguage("ro");
    expect(opensInNewTab("Pagina: codul sursă")).toBe("Pagina: codul sursă (se deschide într-o filă nouă)");
  });

  it("holds the words the footer's links show, in both languages", () => {
    for (const language of ["en", "ro"] as const) {
      setLanguage(language);
      const [server, page] = SHOWN[language];
      expect(opensInNewTab(t("footer", "Server source code")).toLowerCase(), language).toContain(server);
      expect(opensInNewTab(t("footer", "Page source code")).toLowerCase(), language).toContain(page);
    }
  });
});

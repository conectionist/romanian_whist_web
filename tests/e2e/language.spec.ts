import { expect, test, type Page } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:8090";
const KEY = "whist.language";

const kept = (language: string) => ({ cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: KEY, value: language }] }] });
const dialog = (page: Page) => page.locator(".lang-page");
const choice = (page: Page, language: string) => page.locator(`.lang-choice[data-language="${language}"]`);
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), KEY);

// The page tells the server what language it runs in, in its first message.
function helloLanguages(page: Page): string[] {
  const languages: string[] = [];
  page.on("websocket", (socket) =>
    socket.on("framesent", (frame) => {
      const sent = JSON.parse(String(frame.payload)) as { type: string; lang?: string };
      if (sent.type === "hello" && sent.lang !== undefined) {
        languages.push(sent.lang);
      }
    }),
  );
  return languages;
}

test.describe("a first visit", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("asks which language before the page starts, Romanian first and holding the keyboard, and Enter takes it", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    const sockets: string[] = [];
    page.on("websocket", (socket) => sockets.push(socket.url()));
    const hellos = helloLanguages(page);

    await page.goto("/");
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator(".lang-choice")).toHaveCount(2);
    await expect(page.locator(".lang-name")).toHaveText(["Română", "English"]);
    await expect(choice(page, "ro")).toBeFocused();
    // The page is not started: no table, no connection, nothing kept.
    await expect(page.locator(".window")).toHaveCount(0);
    expect(sockets).toEqual([]);
    expect(await stored(page)).toBeNull();

    await page.keyboard.press("Enter");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
    await expect(page).toHaveTitle("Whist");
    await expect(page.locator(".menu-btn span")).toHaveText(["Joc nou", "Joacă online"]);
    expect(await stored(page)).toBe("ro");
    expect(hellos).toEqual(["ro"]);
    expect(problems).toEqual([]);
  });

  test("moves between the flags with the arrows and Tab, and Space takes English", async ({ page }) => {
    const hellos = helloLanguages(page);
    await page.goto("/");
    await expect(choice(page, "ro")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(choice(page, "en")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(choice(page, "ro")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(choice(page, "en")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(choice(page, "ro")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");

    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Romanian Whist");
    await expect(page.locator(".menu-btn span")).toHaveText(["New Game", "Play online"]);
    expect(await stored(page)).toBe("en");
    expect(hellos).toEqual(["en"]);
  });

  test("takes the flag that is clicked, and the browser remembers it, so a reload does not ask again", async ({ page }) => {
    await page.goto("/");
    await choice(page, "en").click();
    await expect(page.locator(".menu-btn span")).toHaveText(["New Game", "Play online"]);
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("is skipped by ?lang=, which keeps nothing, and asked all the same for a language it does not know", async ({ page }) => {
    const hellos = helloLanguages(page);
    await page.goto("/?lang=ro");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator(".menu-btn span")).toHaveText(["Joc nou", "Joacă online"]);
    expect(await stored(page)).toBeNull();
    expect(hellos).toEqual(["ro"]);

    await page.goto("/?lang=fr");
    await expect(dialog(page)).toBeVisible();
  });
});

test.describe("a browser that has chosen", () => {
  test.use({ storageState: kept("ro") });

  test("starts in the language it kept, and ?lang= overrides it for that visit only", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(page.locator("html")).toHaveAttribute("lang", "ro");

    await page.goto("/?lang=en");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator(".menu-btn span")).toHaveText(["New Game", "Play online"]);
    expect(await stored(page)).toBe("ro");

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  });
});

import { expect, test } from "@playwright/test";
import { answer, waitForTurn } from "./support";
import { visitor, withServer } from "./ownServer";

// A server of its own, which asks whether you are still there after two seconds of waiting on you, and gives four to
// answer, where the one the other tests share waits five minutes.
const PORT = 8092;
const SETTINGS = { still_here_after_ms: 2000, still_here_answer_ms: 4000 };

test("a question whether you are still there, answered with its button, keeps you at the table", async ({ browser }) => {
  await withServer(PORT, SETTINGS, async (_running, keep) => {
    const context = await visitor(browser, PORT);
    keep(context);
    const page = await context.newPage();
    await page.goto("/?solo=3");
    await waitForTurn(page);

    const asking = page.locator('.notice[data-notice="still-here"]');
    await expect(asking).toBeVisible({ timeout: 15_000 });
    await expect(asking.locator(".notice-text")).toHaveText(/^Are you still there\? Answer within \d s\.$/);
    // It is in the strip that a screen reader reads out as it is added.
    await expect(page.locator('.notices[role="status"][aria-live="polite"] .notice[data-notice="still-here"]')).toHaveCount(1);

    await asking.getByRole("button", { name: "I'm here" }).click();
    await expect(asking).toHaveCount(0);
    // Asked again once the game has waited as long again, which the server does only of a person it counts as here.
    await expect(asking).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.notice[data-notice="gone"]')).toHaveCount(0);
  });
});

test("a question left unanswered says the game waits for you, and I'm back takes you back to it", async ({ browser }) => {
  await withServer(PORT, SETTINGS, async (_running, keep) => {
    const context = await visitor(browser, PORT);
    keep(context);
    const page = await context.newPage();
    await page.goto("/?solo=3");
    await waitForTurn(page);

    const asking = page.locator('.notice[data-notice="still-here"]');
    const gone = page.locator('.notice[data-notice="gone"]');
    await expect(asking).toBeVisible({ timeout: 15_000 });
    await expect(gone).toBeVisible({ timeout: 15_000 });
    await expect(gone.locator(".notice-text")).toHaveText("You did not answer in time. Your game is waiting for you.");
    await expect(asking).toHaveCount(0);

    await gone.getByRole("button", { name: "I'm back" }).click();
    await expect(gone).toHaveCount(0);
    // The turn that was waiting is still yours, and is taken.
    await answer(page);
  });
});

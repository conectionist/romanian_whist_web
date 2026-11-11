import { expect, test, type Page } from "@playwright/test";
import { ASK, createTable, joinByCode, joinByLink, playUntil, sheet } from "./online";

const seatOf = (page: Page, name: string) => page.locator(".seat:not([hidden])", { has: page.locator(".name-text", { hasText: name }) });

test.describe("with nothing moving", () => {
  test.beforeEach(async ({ page }) => {
    // Nothing flies, so what is on the table is what the server last said.
    await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
  });

  test("three browsers make a table: two join it by its link and by its code, the host fills the last seat and starts, and a round is played and held", async ({ page: alice, browser }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    alice.on("pageerror", (error) => problems.push(error.message));

    const code = await createTable(alice, "Alice", { seats: 4, others: ["open", "open", "open"], speed: "fastest", waitAfterRound: true });
    const hostLobby = sheet(alice, "lobby");
    await expect(hostLobby.locator(".sheet-title")).toHaveText(`Table ${code}`);
    await expect(hostLobby.locator(".lobby-share input")).toHaveValue(new RegExp(`/t/${code}$`));
    // The host has the controls, and cannot start a table with seats that nobody holds.
    await expect(hostLobby.locator(".lobby-host")).toBeVisible();
    await expect(hostLobby.locator('[data-action="fill"]')).toBeVisible();
    await expect(hostLobby.locator('[data-action="start"]')).toBeDisabled();
    await expect(hostLobby.locator(".lobby-seat[data-kind='human']")).toHaveCount(1);
    await expect(hostLobby.locator(".lobby-seat[data-kind='open']")).toHaveCount(3);

    // By the link: the page asks who you are and for nothing else.
    const bob = await joinByLink(browser, code, "Bob");
    const bobLobby = sheet(bob.page, "lobby");
    await expect(bobLobby.locator(".sheet-title")).toHaveText(`Table ${code}`);
    await expect(bobLobby.locator(".sheet-meta")).toHaveText("Waiting for the host to start the game.");
    // A guest has none of the host's controls, and the start is not theirs.
    await expect(bobLobby.locator(".lobby-host")).toBeHidden();
    await expect(bobLobby.locator('[data-action="start"]')).toBeHidden();
    await expect(bobLobby.locator('[data-action="fill"]')).toBeHidden();
    for (const select of await bobLobby.locator('select[name^="lobbySeat"]').all()) {
      await expect(select).toBeHidden();
    }
    // By its code, typed in lower case on the main menu.
    const cleo = await joinByCode(browser, code.toLowerCase(), "Cleo");
    const cleoLobby = sheet(cleo.page, "lobby");
    await expect(cleoLobby.locator('[data-action="start"]')).toBeHidden();

    // All three see the same seats, each theirs marked.
    for (const lobby of [hostLobby, bobLobby, cleoLobby]) {
      await expect(lobby.locator(".lobby-seat[data-kind='human']")).toHaveCount(3);
      await expect(lobby.locator(".lobby-seat[data-kind='open']")).toHaveCount(1);
      await expect(lobby.locator(".lobby-seat.you .lobby-name")).toHaveCount(1);
    }
    await expect(bobLobby.locator(".lobby-seat.you .lobby-name")).toHaveText("Bob");
    await expect(cleoLobby.locator(".lobby-seat.you .lobby-name")).toHaveText("Cleo");
    await expect(hostLobby.locator(".lobby-note")).toContainText("One seat is still open");

    // The host fills the last seat with a computer player, and may start.
    await hostLobby.locator('[data-action="fill"]').click();
    await expect(hostLobby.locator(".lobby-seat[data-kind='computer']")).toHaveCount(1);
    await expect(hostLobby.locator('[data-action="start"]')).toBeEnabled();
    await hostLobby.locator('[data-action="start"]').click();

    const pages = [alice, bob.page, cleo.page];
    for (const each of pages) {
      await expect(sheet(each, "lobby")).toHaveCount(0);
      await expect(each.locator(".seat:not([hidden])")).toHaveCount(4);
      await expect(each.locator(".score-round")).toHaveText("Round 1 of 26");
      for (const name of ["Alice", "Bob", "Cleo"]) {
        await expect(seatOf(each, name)).toHaveCount(1);
      }
    }
    await expect(alice).toHaveURL(new RegExp(`/t/${code}$`));

    // The round is played by three people and a computer player, and every page is told it is held.
    await playUntil(pages, async () => (await sheet(alice, "round").count()) > 0);
    for (const each of pages) {
      await expect(sheet(each, "round")).toBeVisible();
      await expect(sheet(each, "round").locator(".hold")).toHaveText(/^Waiting for Alice, Bob and Cleo: \d+ s$/);
    }

    // Each person's Continue is counted, and the note says who is still awaited.
    await sheet(alice, "round").getByRole("button", { name: "Continue" }).click();
    await expect(sheet(alice, "round").getByRole("button", { name: "Continue" })).toBeDisabled();
    await expect(sheet(bob.page, "round").locator(".hold")).toHaveText(/^Waiting for Bob and Cleo: \d+ s$/);
    await sheet(bob.page, "round").getByRole("button", { name: "Continue" }).click();
    await expect(sheet(cleo.page, "round").locator(".hold")).toHaveText(/^Waiting for Cleo: \d+ s$/);
    await sheet(cleo.page, "round").getByRole("button", { name: "Continue" }).click();

    for (const each of pages) {
      await expect(sheet(each, "round")).toHaveCount(0);
      await expect(each.locator(".score-round")).toHaveText("Round 2 of 26");
    }
    expect(problems).toEqual([]);
    await bob.context.close();
    await cleo.context.close();
  });

  test("a link to a table that does not exist says so, in words, and the sheet stays up for another try", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await page.goto("/t/ZZZZ22");
    const join = sheet(page, "online");
    await expect(join.locator(".sheet-title")).toHaveText("Join table ZZZZ22");
    await join.locator('input[name="profileName"]').fill("Dora");
    await join.getByRole("button", { name: "Join", exact: true }).click();
    await expect(join.locator(".ng-error")).toHaveText("There is no table with that code.");
    await expect(page.locator('.notice[data-notice="error"]')).toHaveText("There is no table with that code.");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    // The address is the table's still, so a person who mistyped it reads it there.
    await expect(page).toHaveURL(/\/t\/ZZZZ22$/);
    await join.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".menu-page")).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("Exit at an online table offers to leave or stay, and leaving puts a computer player in the seat at once", async ({ page: alice, browser }) => {
    const problems: string[] = [];
    alice.on("pageerror", (error) => problems.push(error.message));
    const code = await createTable(alice, "Alice", { seats: 3, others: ["open", "computer"], speed: "fastest" });
    const bob = await joinByLink(browser, code, "Bob");
    await sheet(alice, "lobby").locator('[data-action="start"]').click();
    await expect(alice.locator(".seat:not([hidden])")).toHaveCount(3);

    // The game cannot be paused: what Exit raises says so, and Stay is the way back.
    await alice.locator('[data-menu="exit"]').click();
    const leave = sheet(alice, "leave");
    await expect(leave.locator(".sheet-title")).toHaveText("Leave the table?");
    await expect(leave.locator(".sheet-meta")).toHaveText("The game goes on without you: a computer player takes your seat.");
    await expect(alice.locator("body")).toHaveAttribute("data-status", "at a table");
    await leave.getByRole("button", { name: "Stay" }).click();
    await expect(leave).toHaveCount(0);
    await expect(seatOf(alice, "Alice").locator(".presence")).toBeHidden();

    // Esc raises it again, and Leave table leaves: the page is at the main menu, and Bob is told.
    await alice.keyboard.press("Escape");
    await expect(leave).toBeVisible();
    await leave.getByRole("button", { name: "Leave table" }).click();
    await expect(alice.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(alice.locator(".menu-page")).toBeVisible();
    await expect(alice).toHaveURL(/\/$/);
    await expect(seatOf(bob.page, "Alice").locator('.presence[data-state="replaced"]')).toHaveText("Replaced");
    await expect(bob.page.locator('.notice[data-notice="news:Alice was replaced by a computer player."]')).toBeVisible();
    expect(problems).toEqual([]);
    await bob.context.close();
  });

  test("a player who drops is waited for, then replaced by a computer player, and is given the seat back on return", async ({ page: alice, browser }) => {
    // The wait is the turn timer, at its shortest.
    test.setTimeout(120_000);
    const code = await createTable(alice, "Alice", { seats: 3, others: ["open", "computer"], timer: "10000", speed: "fastest" });
    const bob = await joinByLink(browser, code, "Bob");
    await sheet(alice, "lobby").locator('[data-action="start"]').click();
    await expect(bob.page.locator(".seat:not([hidden])")).toHaveCount(3);
    await expect(seatOf(alice, "Bob").locator(".presence")).toBeHidden();

    // Bob's page goes away, and keeps the token that is his seat.
    await bob.page.close();
    await expect(seatOf(alice, "Bob").locator('.presence[data-state="away"]')).toHaveText("Away");
    await expect(alice.locator('.notice[data-notice="news:Bob went away."]')).toBeVisible();

    // The game goes on until it is Bob's turn, and then waits for him, and says so.
    const waiting = alice.locator('.notice[data-notice="waiting"]');
    await playUntil([alice], async () => (await waiting.count()) > 0);
    await expect(waiting).toHaveText(/^Waiting for Bob to come back: \d+ s$/);

    // The wait ends, and a computer player holds the seat, and the table is told.
    await playUntil([alice], async () => (await seatOf(alice, "Bob").locator('.presence[data-state="replaced"]').count()) > 0);
    await expect(seatOf(alice, "Bob").locator(".presence")).toHaveText("Replaced");
    await expect(alice.locator('.notice[data-notice="news:Bob was replaced by a computer player."]')).toBeVisible();
    await expect(waiting).toHaveCount(0);

    // Bob opens the page again in the same browser: the seat is his, and the table is told.
    const back = await bob.context.newPage();
    await back.goto("/");
    await expect(back.locator("body")).toHaveAttribute("data-status", "at a table");
    await expect(back.locator(".seat:not([hidden])")).toHaveCount(3);
    await expect(alice.locator('.notice[data-notice="news:Bob is back."]')).toBeVisible();
    await expect(seatOf(alice, "Bob").locator(".presence")).toBeHidden();

    // And from the next decision he is asked again.
    await playUntil([alice, back], async () => (await back.locator(ASK).count()) > 0);
    await expect(back.locator(ASK).first()).toBeVisible();
    await bob.context.close();
  });
});

test.describe("with the cards flying", () => {
  test("a blind card whose prompt the turn timer closes keeps its back until the computer player has played it", async ({ page: alice }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    alice.on("pageerror", (error) => problems.push(error.message));

    // Every change to the hand and the felt, as the page made it, one sample each: what was in the
    // hand and on the felt right after it.
    await alice.addInitScript(() => {
      const samples: { backs: number; felt: number }[] = [];
      (window as unknown as { samples: typeof samples }).samples = samples;
      const take = () => {
        const backs = document.querySelectorAll(".hand .hcard:not([hidden])").length;
        const felt = document.querySelectorAll(".trick .card:not([hidden])").length;
        const last = samples[samples.length - 1];
        if (last === undefined || last.backs !== backs || last.felt !== felt) {
          samples.push({ backs, felt });
        }
      };
      new MutationObserver(take).observe(document, { subtree: true, childList: true, attributes: true });
      const frame = () => {
        take();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

    // Every one-card round is a Forehead round, so the first deal is blind.
    await createTable(alice, "Alice", { seats: 2, others: ["computer"], timer: "10000", allOnesForehead: true, speed: "fastest" });
    await sheet(alice, "lobby").locator('[data-action="start"]').click();
    await expect(alice.locator("body")).toHaveAttribute("data-status", "at a table");

    // Bid, and then the card is asked for, as a back.
    const bet = alice.locator(".bidstrip:not([hidden]) .opt:not(:disabled)");
    const asked = alice.locator(ASK);
    for (;;) {
      await asked.first().waitFor();
      if ((await bet.count()) === 0) {
        break;
      }
      await bet.first().click();
      await expect(asked).toHaveCount(0);
    }
    const blind = alice.locator(".hand .hcard.playable");
    await expect(blind).toHaveCount(1);
    expect(await blind.getAttribute("data-card")).toBeNull();

    // The ring and the seconds count the prompt down on your own panel, as it is only 10 s long.
    const mine = alice.locator(".seat.active");
    await expect(mine.locator('.presence[data-state="timer"]')).toHaveText(/^\d+ s$/);
    await expect(mine.locator(".ring")).toBeVisible();

    // Nothing is clicked: the timer closes the prompt and the computer player plays the card.
    await expect(blind).toHaveCount(0, { timeout: 20_000 });
    await expect(alice.locator(".trick .card:not([hidden])")).not.toHaveCount(0);
    await expect(mine.locator(".ring")).toBeHidden();

    // The back was in the hand until the card was on the felt: never a moment with neither.
    const samples = await alice.evaluate(() => (window as unknown as { samples: { backs: number; felt: number }[] }).samples);
    const gone = samples.findIndex((sample, index) => index > 0 && sample.backs === 0 && samples[index - 1].backs > 0);
    expect(gone, JSON.stringify(samples)).toBeGreaterThan(0);
    expect(samples[gone].felt, JSON.stringify(samples.slice(Math.max(0, gone - 3), gone + 2))).toBeGreaterThan(samples[gone - 1].felt);
    expect(problems).toEqual([]);
  });
});

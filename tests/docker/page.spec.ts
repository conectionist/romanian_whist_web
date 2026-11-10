import { expect, test } from "@playwright/test";

// The page under the policy the image sends. A violation, a script error, a failed request or an
// error answer means the page needs something the policy refuses, or the image does not serve.
test("the page starts a solo game under the image's content-security-policy", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`error: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`failed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      problems.push(`${response.status()}: ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console: ${message.text()}`);
    }
  });
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { violations: string[] }).violations = seen;
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.violatedDirective}: ${event.blockedURI}`);
    });
  });

  await page.goto("/?solo=4&speed=4");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  await page.locator(".hand .hcard").first().waitFor();

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return Array.from(document.fonts).map((face) => `${face.family}: ${face.status}`);
  });
  expect(fonts.filter((face) => face.endsWith(": error"))).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
  expect(problems).toEqual([]);
});

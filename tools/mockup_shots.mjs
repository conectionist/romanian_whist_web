#!/usr/bin/env node
// Takes the Android mock-up's table screens at a phone's size, for comparing the page's scaled table with them.
//
//     node tools/mockup_shots.mjs [--android DIR] [--out DIR] [--sizes 640x360,915x412,832x384]
//
// --android is the checkout of romanian_whist_android (default ../romanian_whist_android) and --out where
// the pictures go (default build/shots/mockup). Each size gets a folder, <width>x<height>, with
//
//     table-2-players.png to table-6-players.png   the mock-up's "2 to 6 players" screen
//     bidding.png                                  its bidding screen
//     play.png                                     its screen for your turn
//
// at twice the density, as the page's captures are. The mock-up is built to be opened with a connection,
// for its fonts. Where they cannot be fetched, its three families are replaced by the page's own copies of
// the same fonts, and this says so; nothing else of the mock-up is changed.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = [
  { family: "Belleza", weight: 400, file: "belleza/Belleza-Regular.woff2" },
  { family: "Alegreya Sans", weight: 400, file: "alegreya-sans/AlegreyaSans-Regular.woff2" },
  { family: "Alegreya Sans", weight: 500, file: "alegreya-sans/AlegreyaSans-Medium.woff2" },
  { family: "Alegreya Sans", weight: 700, file: "alegreya-sans/AlegreyaSans-Bold.woff2" },
  { family: "Cinzel Decorative", weight: 700, file: "cinzel-decorative/CinzelDecorative-Bold.woff2" },
];

function fontCss() {
  return FONTS.map(({ family, weight, file }) => {
    const data = readFileSync(join(ROOT, "public/fonts", file)).toString("base64");
    return `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  }).join("\n");
}

// A window the mock-up draws in, in its own units: no bars, no rounded corners, no camera hole.
const DEVICE = { label: "Capture", status: 0, nav: 0, radius: 11, immersive: true, noCutout: true };

async function capture(browser, htmlUrl, [width, height], out, report) {
  const context = await browser.newContext({
    viewport: { width: Math.max(1500, width + 500), height: height + 240 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(htmlUrl, { waitUntil: "load" });
  // The faces its stylesheet from Google's servers gave, which is none when they cannot be reached.
  const faces = async () =>
    page.evaluate(async () => {
      await document.fonts.ready;
      return ["Belleza", "Alegreya Sans", "Cinzel Decorative"].map((family) => [family, [...document.fonts].some((face) => face.family.replaceAll('"', "") === family && face.status === "loaded")]);
    });
  report.fonts = await faces();
  report.replaced = report.fonts.some(([, loaded]) => !loaded);
  if (report.replaced) {
    await page.addStyleTag({ content: fontCss() });
    await page.evaluate(async () => {
      await Promise.all(['400 25px "Belleza"', '400 19px "Alegreya Sans"', '500 19px "Alegreya Sans"', '700 19px "Alegreya Sans"', '700 37px "Cinzel Decorative"'].map((face) => document.fonts.load(face)));
      await document.fonts.ready;
    });
  }

  mkdirSync(out, { recursive: true });
  const show = async (screen, players) => {
    await page.evaluate(
      ([w, h, device, id, n]) => {
        // eslint-disable-next-line no-undef
        DEVICES.capture = { ...device, w, h };
        // eslint-disable-next-line no-undef
        current.device = "capture";
        // eslint-disable-next-line no-undef
        current.real = false;
        // eslint-disable-next-line no-undef
        current.textScale = 1;
        if (n !== null) {
          // eslint-disable-next-line no-undef
          current.players = n;
        }
        // eslint-disable-next-line no-undef
        current.variant = 0;
        if (location.hash !== `#${id}`) {
          location.hash = id;
        }
        // eslint-disable-next-line no-undef
        render();
      },
      [width, height, DEVICE, screen, players],
    );
    await page.waitForTimeout(250);
  };
  // Exactly the window's size, from the window's own corner.
  const shoot = async (name) => {
    const box = await page.locator("#glass").boundingBox();
    await page.screenshot({ path: join(out, `${name}.png`), animations: "disabled", clip: { x: box.x, y: box.y, width, height } });
  };

  for (const players of [2, 3, 4, 5, 6]) {
    await show("seating", players);
    await shoot(`table-${players}-players`);
  }
  await show("bidding", null);
  await shoot("bidding");
  await show("play", null);
  await shoot("play");
  await context.close();
}

async function main() {
  const { values } = parseArgs({ options: { android: { type: "string" }, out: { type: "string" }, sizes: { type: "string" } } });
  const android = resolve(ROOT, values.android ?? "../romanian_whist_android");
  const out = resolve(ROOT, values.out ?? "build/shots/mockup");
  const sizes = (values.sizes ?? "640x360,915x412,832x384").split(",").map((text) => text.split("x").map(Number));
  const html = join(android, "docs/android-client-mockup/android_client_mockup.html");
  if (!existsSync(html)) {
    throw new Error(`there is no ${html}: --android names the checkout of romanian_whist_android`);
  }
  const browser = await chromium.launch();
  try {
    for (const size of sizes) {
      const report = {};
      await capture(browser, pathToFileURL(html).href, size, join(out, size.join("x")), report);
      console.log(
        `${size.join("x")}: the mock-up's fonts ${report.fonts.map(([family, ok]) => `${family} ${ok ? "loaded" : "did not load"}`).join(", ")}` +
          (report.replaced ? "; its three families are the page's own copies of them" : ""),
      );
    }
  } finally {
    await browser.close();
  }
}

main();

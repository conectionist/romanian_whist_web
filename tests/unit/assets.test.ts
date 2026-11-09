import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "../../src/assets/manifest.json";
import { cardBackUrl, cardUrl, desktopCommit, portraitUrl } from "../../src/assets/assets";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC = join(ROOT, "public");
const CATALOGUES = join(ROOT, "libs/romanian_whist_server/protocol/catalogues");

function everyUrl(): string[] {
  return [
    ...Object.values(manifest.cards),
    manifest.back,
    ...Object.values(manifest.portraits),
    ...Object.values(manifest.textures),
    ...Object.values(manifest.fonts).flatMap((faces) => Object.values(faces)),
  ];
}

describe("the asset manifest", () => {
  it("names the desktop commit it was imported from", () => {
    expect(desktopCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("lists every card the protocol deals", () => {
    for (const rank of "3456789TJQKA") {
      for (const suit of "HDSC") {
        expect(cardUrl(`${rank}${suit}`)).toBe(`/cards/${rank}${suit}.webp`);
      }
    }
    expect(Object.keys(manifest.cards)).toHaveLength(48);
  });

  it("has a file for every URL, and no data: URL", () => {
    for (const url of everyUrl()) {
      expect(url.startsWith("/")).toBe(true);
      expect(existsSync(join(PUBLIC, url)), url).toBe(true);
    }
  });

  it("has a portrait for every avatar the server's catalogue lists", () => {
    const avatars: { id: string }[] = JSON.parse(readFileSync(join(CATALOGUES, "avatars.json"), "utf8"));
    expect(avatars.length).toBeGreaterThan(0);
    for (const { id } of avatars) {
      expect(portraitUrl(id), id).toBeDefined();
    }
    expect(portraitUrl("no-such-avatar")).toBeUndefined();
  });

  it("copies the server's catalogues", () => {
    for (const file of ["avatars.json", "player_names.json"]) {
      expect(readFileSync(join(PUBLIC, file), "utf8"), file).toBe(readFileSync(join(CATALOGUES, file), "utf8"));
    }
  });

  it("ships a licence with each font", () => {
    for (const faces of Object.values(manifest.fonts)) {
      const directory = dirname(Object.values(faces)[0]);
      expect(existsSync(join(PUBLIC, directory, "OFL.txt")), directory).toBe(true);
    }
  });

  it("keeps the first load under the budget", () => {
    const size = (url: string) => statSync(join(PUBLIC, url)).size;
    const largest = (urls: string[], n: number) =>
      urls
        .map(size)
        .sort((a, b) => b - a)
        .slice(0, n)
        .reduce((sum, bytes) => sum + bytes, 0);
    const fonts = Object.values(manifest.fonts).flatMap((faces) => Object.values(faces));
    const total =
      fonts.map(size).reduce((sum, bytes) => sum + bytes, 0) +
      Object.values(manifest.textures).map(size).reduce((sum, bytes) => sum + bytes, 0) +
      size(cardBackUrl) +
      largest(Object.values(manifest.cards), 15) +
      largest(Object.values(manifest.portraits), 6);
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });
});

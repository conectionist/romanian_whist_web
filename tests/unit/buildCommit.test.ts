import { describe, expect, it } from "vitest";
import { buildCommit, chooseCommit } from "../../tools/buildCommit.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";

describe("the commit a build is of", () => {
  it("is what the build was told, whatever the checkout says", () => {
    expect(chooseCommit({ told: "abc1234", toplevel: "/src", folder: "/src", head: HEAD, porcelain: " M a.ts" })).toBe("abc1234");
    expect(chooseCommit({ told: "  abc1234\n", head: HEAD })).toBe("abc1234");
  });

  it("is the head of the repository that is this folder", () => {
    expect(chooseCommit({ toplevel: "/src/page", folder: "/src/page", head: HEAD, porcelain: "" })).toBe(HEAD);
    expect(chooseCommit({ told: "", toplevel: "/src/page", folder: "/src/page", head: HEAD, porcelain: "\n" })).toBe(HEAD);
  });

  it("marks a tree with changes, an untracked file among them", () => {
    expect(chooseCommit({ toplevel: "/src/page", folder: "/src/page", head: HEAD, porcelain: " M src/main.ts\n" })).toBe(`${HEAD}-dirty`);
    expect(chooseCommit({ toplevel: "/src/page", folder: "/src/page", head: HEAD, porcelain: "?? new.ts\n" })).toBe(`${HEAD}-dirty`);
  });

  it("is nothing where the repository holds this folder without being it", () => {
    expect(chooseCommit({ toplevel: "/src", folder: "/src/page", head: HEAD, porcelain: "" })).toBe("");
  });

  it("is nothing without a repository or a head", () => {
    expect(chooseCommit({ folder: "/src/page" })).toBe("");
    expect(chooseCommit({ toplevel: "/src/page", folder: "/src/page", head: "", porcelain: "" })).toBe("");
    expect(chooseCommit({ toplevel: "/src/page", folder: "/src/page" })).toBe("");
  });
});

describe("reading the commit from git", () => {
  // A git of our own, that says what a folder's repository would.
  const asks: string[][] = [];
  const git = (answers: Record<string, string>) => (folder: string, args: string[]) => {
    asks.push([folder, ...args]);
    const answer = answers[args.join(" ")];
    if (answer === undefined) {
      throw new Error("not a repository");
    }
    return answer;
  };

  it("asks git in the folder it is given, and uses a head whose repository is that folder", () => {
    const folder = process.cwd();
    const found = buildCommit(folder, {}, git({ "rev-parse --show-toplevel": folder, "rev-parse HEAD": HEAD, "status --porcelain": "" }));
    expect(found).toBe(HEAD);
    expect(asks.every((ask) => ask[0] === folder)).toBe(true);
  });

  it("marks changes, and gives nothing for another repository's head", () => {
    const folder = process.cwd();
    const dirty = git({ "rev-parse --show-toplevel": folder, "rev-parse HEAD": HEAD, "status --porcelain": " M a" });
    expect(buildCommit(folder, {}, dirty)).toBe(`${HEAD}-dirty`);
    const parent = git({ "rev-parse --show-toplevel": "/", "rev-parse HEAD": HEAD, "status --porcelain": "" });
    expect(buildCommit(folder, {}, parent)).toBe("");
  });

  it("gives nothing where git cannot say, and does not ask it when it was told", () => {
    expect(buildCommit(process.cwd(), {}, git({}))).toBe("");
    const before = asks.length;
    expect(buildCommit(process.cwd(), { WHIST_WEB_COMMIT: "abc1234" }, git({}))).toBe("abc1234");
    expect(asks.length).toBe(before);
  });
});

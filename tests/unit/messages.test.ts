import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ClientMessage, Profile, Settings } from "../../src/net/protocol";
import { continueRound, createTable, joinTable, setSeat, takeSeat, updateProfile, updateSettings } from "../../src/net/send";

const PROTOCOL = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/PROTOCOL.md");

// The fields PROTOCOL.md lists for each client message: the first word in backticks of each part of
// the "Fields" cell, which are separated by commas outside brackets.
function documented(): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  const section = readFileSync(PROTOCOL, "utf8").split("## Client to server")[1].split("### hello")[0];
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    const type = /^`(\w+)`(?:, `(\w+)`)?$/.exec(cells[1] ?? "");
    if (type === null || cells.length < 4) {
      continue;
    }
    const parts: string[] = [];
    let depth = 0;
    let part = "";
    for (const character of cells[2]) {
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      if (character === "," && depth === 0) {
        parts.push(part);
        part = "";
      } else {
        part += character;
      }
    }
    parts.push(part);
    const fields = parts.flatMap((each) => {
      const named = /^\s*`(\w+)`/.exec(each);
      return named === null ? [] : [named[1]];
    });
    for (const name of [type[1], type[2]]) {
      if (name !== undefined) {
        rows.set(name, fields);
      }
    }
  }
  return rows;
}

const profile: Profile = { name: "Ana", gender: "female", avatar: "woman-long-red-hair" };
const settings: Settings = {
  seats: [{ kind: "open" }, { kind: "open" }],
  structure: "1-8-1",
  foreheadAndHidden: true,
  allOneCardForehead: false,
  botSpeed: 2,
  waitAfterRound: false,
};

function fieldsOf(message: ClientMessage): string[] {
  return Object.keys(message)
    .filter((key) => key !== "type")
    .sort();
}

describe("the client messages", () => {
  const table = documented();

  it("are read from PROTOCOL.md's table", () => {
    expect(table.get("createTable")).toEqual(["settings", "profile"]);
    expect(table.get("setSeat")).toEqual(["seat", "kind", "level"]);
    expect(table.get("startGame")).toEqual([]);
    expect(table.get("pause")).toEqual([]);
    expect(table.get("resume")).toEqual([]);
  });

  const built: [string, ClientMessage][] = [
    ["createTable", createTable(settings, profile)],
    ["joinTable", joinTable("ABC234", profile)],
    ["updateProfile", updateProfile(profile)],
    ["takeSeat", takeSeat(2)],
    ["setSeat", setSeat(1, "computer", "cyborg")],
    ["updateSettings", updateSettings(settings)],
    ["continue", continueRound(3)],
    ["startGame", { type: "startGame" }],
    ["pause", { type: "pause" }],
    ["resume", { type: "resume" }],
    ["leaveTable", { type: "leaveTable" }],
    ["back", { type: "back" }],
  ];

  for (const [type, message] of built) {
    it(`${type} carries the fields the table lists, and no others`, () => {
      expect(message.type).toBe(type);
      expect(fieldsOf(message)).toEqual([...(table.get(type) ?? ["missing from PROTOCOL.md"])].sort());
    });
  }

  it("makes an open seat with no level, and a computer player's with one", () => {
    expect(setSeat(3, "open")).toEqual({ type: "setSeat", seat: 3, kind: "open" });
    expect(setSeat(3, "computer", "ducking")).toEqual({ type: "setSeat", seat: 3, kind: "computer", level: "ducking" });
  });

  it("copies the profile, so a later edit of the form's own cannot change a message already built", () => {
    const mine = { ...profile };
    const message = createTable(settings, mine);
    mine.name = "Changed";
    expect(message).toMatchObject({ profile: { name: "Ana" } });
  });

  it("send the profile's three fields and nothing else", () => {
    const crowded = { ...profile, extra: 1 } as Profile;
    expect(updateProfile(crowded)).toEqual({ type: "updateProfile", ...profile });
    expect(joinTable("ABC234", crowded)).toEqual({ type: "joinTable", code: "ABC234", profile });
    expect(createTable(settings, crowded)).toEqual({ type: "createTable", settings, profile });
  });
});

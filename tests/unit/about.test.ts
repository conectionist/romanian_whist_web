import { afterEach, describe, expect, it } from "vitest";
import { ISSUES_URL, PAGE_REPOSITORY, SERVER_REPOSITORY, isCommit, pageSourceUrl, serverSourceUrl, shortCommit, sourceUrl, versionsOf, type Versions } from "../../src/about/links";
import { LANGUAGES, setLanguage } from "../../src/i18n/language";
import { PROTOCOL_VERSION } from "../../src/net/protocol";
import { fieldsFor } from "../../src/sheets/aboutSheet";
import { storedItems } from "../../src/storage/stored";

afterEach(() => setLanguage("en"));

const WHOLE = "0123456789abcdef0123456789abcdef01234567";

function versions(changes: Partial<Versions> = {}): Versions {
  return { page: { version: "1.0.0", commit: WHOLE }, server: { version: "1.0.0", commit: "89abcde" }, protocol: 2, ...changes };
}

describe("the links to the source", () => {
  it("name the commit that runs, short or whole", () => {
    expect(sourceUrl(SERVER_REPOSITORY, "89abcde")).toBe(`${SERVER_REPOSITORY}/tree/89abcde`);
    expect(sourceUrl(PAGE_REPOSITORY, WHOLE)).toBe(`${PAGE_REPOSITORY}/tree/${WHOLE}`);
    expect(sourceUrl(PAGE_REPOSITORY, "89ABCDE")).toBe(`${PAGE_REPOSITORY}/tree/89abcde`);
  });

  it("are the repository itself where there is no commit, or what stands for one is not a commit", () => {
    for (const none of [null, undefined, "", "unknown", "abc", "main", "89abcde/../x", "89abcde?x=1", `${WHOLE}0`]) {
      expect(sourceUrl(PAGE_REPOSITORY, none), String(none)).toBe(PAGE_REPOSITORY);
    }
  });

  it("read a commit a person sees as seven characters", () => {
    expect(shortCommit(WHOLE)).toBe("0123456");
    expect(shortCommit("89abcde")).toBe("89abcde");
    expect(shortCommit("")).toBeNull();
    expect(isCommit("0123456")).toBe(true);
    expect(isCommit("012345")).toBe(false);
  });

  it("follow what the welcome said of the server, and are the repository until it has", () => {
    expect(serverSourceUrl(versions())).toBe(`${SERVER_REPOSITORY}/tree/89abcde`);
    expect(serverSourceUrl(versions({ server: null }))).toBe(SERVER_REPOSITORY);
    expect(serverSourceUrl(versions({ server: { version: "1.0.0", commit: null } }))).toBe(SERVER_REPOSITORY);
    expect(pageSourceUrl(versions())).toBe(`${PAGE_REPOSITORY}/tree/${WHOLE}`);
    expect(pageSourceUrl(versions({ page: { version: "1.0.0", commit: null } }))).toBe(PAGE_REPOSITORY);
  });

  it("are the owner's two repositories, and the problems go to the page's tracker", () => {
    expect(PAGE_REPOSITORY).toBe("https://github.com/conectionist/romanian_whist_web");
    expect(SERVER_REPOSITORY).toBe("https://github.com/conectionist/romanian_whist_server");
    expect(ISSUES_URL).toBe("https://github.com/conectionist/romanian_whist_web/issues");
  });

  it("take the server's commit from its welcome, dropping one that is not a commit", () => {
    expect(versionsOf({ version: "1.0.0", commit: "89abcde" }).server).toEqual({ version: "1.0.0", commit: "89abcde" });
    expect(versionsOf({ version: "1.0.0", commit: "" }).server).toEqual({ version: "1.0.0", commit: null });
    expect(versionsOf(null).server).toBeNull();
    expect(versionsOf(null).protocol).toBe(PROTOCOL_VERSION);
  });
});

describe("About", () => {
  const items = () => storedItems(LANGUAGES);

  it("tells the licence, the two links at their commits, both versions and the protocol", () => {
    const fields = fieldsFor(versions(), items());
    expect(fields.licence).toContain("AGPL-3.0-or-later");
    expect(fields.sources.map((source) => source.href)).toEqual([`${SERVER_REPOSITORY}/tree/89abcde`, `${PAGE_REPOSITORY}/tree/${WHOLE}`]);
    expect(fields.sources.map((source) => source.note)).toEqual(["commit 89abcde", "commit 0123456"]);
    expect(fields.versions).toEqual([
      { label: "Page", value: "1.0.0, commit 0123456" },
      { label: "Server", value: "1.0.0, commit 89abcde" },
      { label: "Protocol", value: "2" },
    ]);
  });

  it("says that the page's commit is unknown, and links to the repository, for a build with none", () => {
    const fields = fieldsFor(versions({ page: { version: "1.0.0", commit: null } }), items());
    expect(fields.sources[1].href).toBe(PAGE_REPOSITORY);
    expect(fields.sources[1].note).toContain("commit is unknown");
    expect(fields.versions[0].value).toBe("1.0.0, commit unknown");
  });

  it("says the server is not connected yet before its welcome, and that its commit is unknown when it says none", () => {
    const before = fieldsFor(versions({ server: null }), items());
    expect(before.sources[0].href).toBe(SERVER_REPOSITORY);
    expect(before.sources[0].note).toContain("not connected yet");
    expect(before.versions[1].value).toBe("not connected yet");
    const without = fieldsFor(versions({ server: { version: "1.0.0", commit: null } }), items());
    expect(without.sources[0].note).toContain("unknown");
    expect(without.versions[1].value).toBe("1.0.0, commit unknown");
  });

  it("lists what the page keeps, with the names, from the one list that Forget clears", () => {
    const fields = fieldsFor(versions(), items());
    expect(fields.stored.map((each) => each.keys)).toEqual(items().map((item) => item.keys.join(", ")));
    expect(fields.stored.map((each) => each.keys)).toContain("whist.setup.ro, whist.setup.en");
    expect(fields.privacy).toContain("no accounts and no cookies");
  });

  it("is the same in Romanian, with the sources and versions named", () => {
    setLanguage("ro");
    const fields = fieldsFor(versions(), items());
    expect(fields.title).toBe("Despre această pagină");
    expect(fields.licence).toContain("AGPL-3.0-or-later");
    expect(fields.sources.map((source) => source.label)).toEqual(["Codul sursă al serverului", "Codul sursă al paginii"]);
    expect(fields.versions.map((each) => each.label)).toEqual(["Pagina", "Serverul", "Protocol"]);
    expect(fields.versions[1].value).toBe("1.0.0, commit 89abcde");
    expect(JSON.stringify(fields)).not.toMatch(/\bbot\b/i);
  });
});

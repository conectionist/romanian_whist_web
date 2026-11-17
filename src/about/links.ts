import { PROTOCOL_VERSION } from "../net/protocol";

// Where the source of the two programs is, and the page's tracker. Every visitor is offered the source, as the
// AGPL asks of a program people use over a network.
export const PAGE_REPOSITORY = "https://github.com/conectionist/romanian_whist_web";
export const SERVER_REPOSITORY = "https://github.com/conectionist/romanian_whist_server";
export const ISSUES_URL = `${PAGE_REPOSITORY}/issues`;
export const LICENCE_NAME = "AGPL-3.0-or-later";

// A commit as git writes it, short or whole. Anything else, such as an empty string or a word a build
// puts there when it could not ask git, is no commit and is not put in a link.
export function isCommit(text: string | null | undefined): text is string {
  return text !== null && text !== undefined && /^[0-9a-f]{7,40}$/i.test(text);
}

// The repository at a commit, or the repository itself where there is none to name.
export function sourceUrl(repository: string, commit: string | null | undefined): string {
  return isCommit(commit) ? `${repository}/tree/${commit.toLowerCase()}` : repository;
}

// What a person reads of a commit: seven characters, which name it as git's short form does.
export function shortCommit(commit: string | null | undefined): string | null {
  return isCommit(commit) ? commit.slice(0, 7).toLowerCase() : null;
}

// What the build knows of itself, and what the server said in its welcome; the server's is null until it has.
export interface Versions {
  page: { version: string; commit: string | null };
  server: { version: string; commit: string | null } | null;
  protocol: number;
}

export function pageBuild(): Versions["page"] {
  return { version: __WHIST_WEB_VERSION__, commit: isCommit(__WHIST_WEB_COMMIT__) ? __WHIST_WEB_COMMIT__ : null };
}

export function versionsOf(server: { version: string; commit: string } | null): Versions {
  return {
    page: pageBuild(),
    server: server === null ? null : { version: server.version, commit: isCommit(server.commit) ? server.commit : null },
    protocol: PROTOCOL_VERSION,
  };
}

export function pageSourceUrl(versions: Versions): string {
  return sourceUrl(PAGE_REPOSITORY, versions.page.commit);
}

export function serverSourceUrl(versions: Versions): string {
  return sourceUrl(SERVER_REPOSITORY, versions.server?.commit);
}

// A table's link is /t/<code>, which the server answers with the page: the page reads the code from
// its address, and writes it there when it is at a table.

const LINK = /^\/t\/([A-Z0-9]{6})\/?$/;

// The code in an address's path, or null for any other.
export function tableCodeFrom(pathname: string): string | null {
  return LINK.exec(pathname)?.[1] ?? null;
}

export function pathFor(code: string | null): string {
  return code === null ? "/" : `/t/${code}`;
}

// The link to a table, for sharing.
export function linkFor(code: string, origin: string): string {
  return `${origin}${pathFor(code)}`;
}

// The table the address was last set for, and whether that added an entry to the browser's history.
export interface Entered {
  code: string;
  pushed: boolean;
}

export type AddressMove =
  | { kind: "none" }
  // Adds an entry for the table, so that Back has somewhere to come from.
  | { kind: "push"; path: string; entered: Entered }
  // The address is the table's already: a link was followed, or the page reloaded.
  | { kind: "mark"; entered: Entered }
  // The table is left: Back takes away the entry that was added for it.
  | { kind: "back" }
  | { kind: "replace"; path: string };

// What the address needs once the page knows where it is: an online table's code or none, the table
// the address was last set for, and whether a table's link still waits for an answer.
export function addressMove(at: string, table: string | null, entered: Entered | null, asking: boolean): AddressMove {
  if (table !== null) {
    if (entered?.code === table) {
      return { kind: "none" };
    }
    return tableCodeFrom(at) === table
      ? { kind: "mark", entered: { code: table, pushed: false } }
      : { kind: "push", path: pathFor(table), entered: { code: table, pushed: true } };
  }
  if (entered !== null) {
    return entered.pushed ? { kind: "back" } : { kind: "replace", path: pathFor(null) };
  }
  return !asking && tableCodeFrom(at) !== null ? { kind: "replace", path: pathFor(null) } : { kind: "none" };
}

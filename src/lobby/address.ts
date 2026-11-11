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

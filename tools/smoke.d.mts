export const PAGE_CSP: string;
export function cspCopies(root?: string): { file: string; csp: string | null }[];
export function checkPage(
  baseUrl: string,
  profile: string,
  options?: { serverCommit?: string; webCommit?: string; timeoutMs?: number; log?: (line: string) => void },
): Promise<number>;

export function chooseCommit(found: { told?: string; toplevel?: string; folder?: string; head?: string; porcelain?: string }): string;
export function buildCommit(folder: string, env?: Record<string, string | undefined>, git?: (folder: string, args: string[]) => string): string;

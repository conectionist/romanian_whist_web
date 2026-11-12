// Whether the table is touched with a finger: what the stylesheet's (pointer: coarse) says.
export function touched(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

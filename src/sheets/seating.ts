import type { StoreState } from "../play/store";

// Who sits where, as the sheets name them: the round results, the last trick and the standings
// carry seats and no names, and the table's snapshot has them.
export interface Seating {
  names: readonly string[];
  // Your seat, or null for a watcher.
  you: number | null;
}

export function seatingOf(state: Pick<StoreState, "snapshot">): Seating {
  const snapshot = state.snapshot;
  return { names: snapshot === null ? [] : snapshot.seats.map((seat) => seat.name), you: snapshot?.you ?? null };
}

export function nameOf(seating: Seating, seat: number): string {
  return seating.names[seat] ?? "";
}

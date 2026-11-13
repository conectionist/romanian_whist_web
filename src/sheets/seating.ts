import type { Gender } from "../net/protocol";
import type { StoreState } from "../play/store";

// Who sits where, as the sheets name them: the round results, the last trick and the standings
// carry seats and no names, and the table's snapshot has them.
export interface Seating {
  names: readonly string[];
  // What each is, which a sentence about them agrees with: a seat with nobody in it is a man's.
  genders: readonly Gender[];
  // Your seat, or null for a watcher.
  you: number | null;
}

export function seatingOf(state: Pick<StoreState, "snapshot" | "table">): Seating {
  const snapshot = state.snapshot;
  return {
    names: snapshot === null ? [] : snapshot.seats.map((seat) => seat.name),
    genders: (state.table?.seats ?? []).map((seat) => (seat.kind === "open" ? "male" : seat.gender)),
    you: snapshot?.you ?? null,
  };
}

export function nameOf(seating: Seating, seat: number): string {
  return seating.names[seat] ?? "";
}

export function genderOf(seating: Seating, seat: number): Gender {
  return seating.genders[seat] ?? "male";
}

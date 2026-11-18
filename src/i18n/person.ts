import type { Gender } from "../net/protocol";
import { t } from "./t";

// Sentences that agree with the person they are about: Romanian says "Ana e prima" and "Bogdan e
// primul", and "Tu ești primul" of you. One English sentence is filed once for each variant, told
// apart by its comment, so a catalogue can translate each.
export interface Variant {
  source: string;
  comment: string;
}

export interface Gendered {
  male: Variant;
  female: Variant;
}

export interface Sentence {
  context: string;
  others: Gendered;
  yours: Gendered;
}

export interface People {
  humanSeat: number;
  seats: readonly { gender: Gender }[];
}

export function translateGendered(
  context: string,
  variants: Gendered,
  gender: Gender,
  args: readonly (string | number)[] = [],
): string {
  const variant = gender === "female" ? variants.female : variants.male;
  return t(context, variant.source, args, { comment: variant.comment });
}

// The variant for this seat: yours if it is the human's, the others' otherwise, in the seat's
// gender. A seat the game does not have is somebody else's, a man's.
export function translateSentence(
  sentence: Sentence,
  people: People,
  seat: number,
  args: readonly (string | number)[] = [],
): string {
  const yours = seat === people.humanSeat;
  const gender = people.seats[seat]?.gender ?? "male";
  return translateGendered(sentence.context, yours ? sentence.yours : sentence.others, gender, args);
}

// The human seat's gender, and male in a game nobody plays.
export function yourGender(people: People): Gender {
  return people.seats[people.humanSeat]?.gender ?? "male";
}

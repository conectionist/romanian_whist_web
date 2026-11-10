import manifest from "./manifest.json";

// The desktop client's commit that the pictures and fonts were imported from.
export const desktopCommit: string = manifest.desktopCommit;

const cards: Record<string, string> = manifest.cards;
const portraits: Record<string, string> = manifest.portraits;

export function cardUrl(card: string): string {
  const url = cards[card];
  if (url === undefined) {
    throw new Error(`There is no picture of the card ${card}`);
  }
  return url;
}

export const cardBackUrl: string = manifest.back;
export const woodUrl: string = manifest.textures.wood;
export const feltUrl: string = manifest.textures.felt;

// A portrait the catalogue does not list gets none, and the panel shows its frame empty.
export function portraitUrl(avatar: string): string | undefined {
  return portraits[avatar];
}

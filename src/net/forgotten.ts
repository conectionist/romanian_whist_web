import { TOKEN_KEY } from "../storage/keys";

// Whether another tab has taken the player's token out of the browser, which is what Forget does, or cleared all
// that the site keeps. A tab that goes on would write the token back with its next welcome.
export function tokenForgotten(event: Pick<StorageEvent, "key" | "newValue" | "storageArea">, local: Storage | null): boolean {
  return local !== null && event.storageArea === local && (event.key === null || event.key === TOKEN_KEY) && event.newValue === null;
}

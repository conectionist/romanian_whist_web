import { FORGET_SIGNAL } from "../storage/keys";

// Whether another tab has forgotten this browser: it set the signal Forget sets, or cleared all that the site keeps.
// A tab that went on would write the token back with its next welcome. The token's removal alone is no sign, since
// a page drops a token the server refuses.
export function forgetHeard(event: Pick<StorageEvent, "key" | "newValue" | "storageArea">, local: Storage | null): boolean {
  return local !== null && event.storageArea === local && (event.key === null || (event.key === FORGET_SIGNAL && event.newValue !== null));
}

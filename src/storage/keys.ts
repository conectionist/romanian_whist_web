// Every name the page keeps something under in the browser. Nothing else writes to storage, and a test
// reads the source to hold that, so what the About sheet lists and what Forget clears cannot drift from it.

// Local storage, which lasts until it is cleared.
export const TOKEN_KEY = "whist.token";
export const PROFILE_KEY = "whist.profile";
export const PACE_KEY = "whist.pace";
export const LANGUAGE_KEY = "whist.language";
// The last New Game is kept once for each language, under this name, a dot and the language. The name with no
// language is never written now, and is still cleared.
export const SETUP_KEY = "whist.setup";

// Session storage, which lasts until the tab is closed.
export const RELOADED_KEY = "whist.reloaded";
export const DISMISSED_KEY = "whist.fullscreenNoticeDismissed";

export function setupKeyFor(language: string): string {
  return `${SETUP_KEY}.${language}`;
}

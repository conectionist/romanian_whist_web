import { el } from "../dom/el";
import { t } from "../i18n/t";
import { touched } from "./pointer";

// Full screen on a touch screen, which takes the browser's bars away and holds the phone sideways where the
// browser allows. A button is offered only where it can do something.

export interface FullscreenFacts {
  // The pointer is coarse: a touch screen.
  coarse: boolean;
  // The browser has full screen at all. An iPhone's has none.
  enabled: boolean;
  // The page is in full screen now.
  active: boolean;
  // The page was opened from the home screen, which has no bars to take away.
  installed: boolean;
}

export function fullscreenOffered(facts: FullscreenFacts): boolean {
  return facts.coarse && facts.enabled && !facts.active && !facts.installed;
}

// What the browser tells now.
export function fullscreenFacts(): FullscreenFacts {
  const mode = (name: string) => typeof window.matchMedia === "function" && window.matchMedia(`(display-mode: ${name})`).matches;
  return {
    coarse: touched(),
    enabled: document.fullscreenEnabled === true,
    active: document.fullscreenElement !== null,
    installed: mode("fullscreen") || mode("standalone") || (navigator as unknown as { standalone?: boolean }).standalone === true,
  };
}

// What a table drawn smaller than designed says, if anything: to take the whole screen, or, where the browser
// has no full screen, to add the page to the home screen. Nothing once the page has the whole screen, was opened
// from the home screen, is not on a touch screen, or the notice was put away.
export type SmallNotice = "fullscreen" | "home-screen" | null;

export function smallNoticeFor(facts: FullscreenFacts, shrunk: boolean, dismissed: boolean): SmallNotice {
  if (!shrunk || dismissed || !facts.coarse || facts.active || facts.installed) {
    return null;
  }
  return facts.enabled ? "fullscreen" : "home-screen";
}

// Asks for the whole screen and then for the phone to be held sideways. Either may be refused, which is the
// browser's to do and nothing to report.
export async function enterFullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen();
  } catch {
    // The browser said no.
  }
  try {
    await (screen.orientation as unknown as { lock(orientation: string): Promise<void> }).lock("landscape");
  } catch {
    // The browser, or the phone, holds its own turn.
  }
}

const buttons = new Set<HTMLButtonElement>();

// Every full-screen button there is shows or hides itself by what the browser says now.
export function refreshFullscreenButtons(): void {
  const offered = fullscreenOffered(fullscreenFacts());
  for (const button of buttons) {
    button.hidden = !offered;
  }
}

// A button that asks for full screen, hidden where it cannot be had. `className` styles it where it stands.
export function fullscreenButton(className: string): HTMLButtonElement {
  const button = el("button", { class: className, attrs: { type: "button" }, data: { action: "fullscreen" }, text: t("fullscreen", "Full screen") });
  button.addEventListener("click", () => void enterFullscreen());
  buttons.add(button);
  button.hidden = !fullscreenOffered(fullscreenFacts());
  return button;
}

// Told when the page enters or leaves full screen, or the pointer changes, so that what depends on it is drawn
// again.
export function watchFullscreen(changed: () => void): void {
  const again = () => {
    refreshFullscreenButtons();
    changed();
  };
  document.addEventListener("fullscreenchange", again);
  if (typeof window.matchMedia === "function") {
    for (const query of ["(display-mode: fullscreen)", "(display-mode: standalone)", "(pointer: coarse)"]) {
      window.matchMedia(query).addEventListener("change", again);
    }
  }
}

const DISMISSED = "whist.fullscreenNoticeDismissed";

// Whether the notice about a small table was put away in this visit. Kept for the visit only, in the session's
// storage, which a private window may refuse.
export function smallNoticeDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISSED) === "1";
  } catch {
    return dismissedHere;
  }
}

let dismissedHere = false;

export function dismissSmallNotice(): void {
  dismissedHere = true;
  try {
    window.sessionStorage.setItem(DISMISSED, "1");
  } catch {
    // Kept in memory for the visit.
  }
}

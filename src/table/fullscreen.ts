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
  return fullscreenActionFor(facts, false) === "enter";
}

// What a full-screen button does now: asks for full screen, or, where it can, leaves it while the page is in it. Nothing
// where there is nothing to do: not a touch screen, no full screen in the browser, or a page from the home screen.
export type FullscreenAction = "enter" | "exit" | null;

export function fullscreenActionFor(facts: FullscreenFacts, canExit: boolean): FullscreenAction {
  if (!facts.coarse || !facts.enabled || facts.installed) {
    return null;
  }
  if (facts.active) {
    return canExit ? "exit" : null;
  }
  return "enter";
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

// Leaves full screen, and lets the phone turn as it likes again. Either may be refused.
export async function exitFullscreen(): Promise<void> {
  try {
    await document.exitFullscreen();
  } catch {
    // The page was not in it, or the browser said no.
  }
  try {
    (screen.orientation as unknown as { unlock(): void }).unlock();
  } catch {
    // Nothing was locked.
  }
}

// The full-screen buttons there are, each with whether it may also leave full screen.
const buttons = new Map<HTMLButtonElement, { label: HTMLElement; canExit: boolean }>();

// Every full-screen button shows, says what it does and hides itself by what the browser says now.
export function refreshFullscreenButtons(): void {
  const facts = fullscreenFacts();
  for (const [button, { label, canExit }] of buttons) {
    const action = fullscreenActionFor(facts, canExit);
    button.hidden = action === null;
    if (action !== null) {
      button.dataset.fullscreen = action;
      label.textContent = action === "exit" ? t("fullscreen", "Exit full screen") : t("fullscreen", "Full screen");
    }
  }
}

// A button that asks for full screen, hidden where it cannot be had, and, where `canExit`, that leaves it while the page
// is in it. `className` styles it where it stands.
export function fullscreenButton(className: string, canExit = false): HTMLButtonElement {
  const label = el("span", { class: "fullscreen-label" });
  const button = el("button", { class: className, attrs: { type: "button" }, data: { action: "fullscreen" } }, label);
  button.addEventListener("click", () => void (button.dataset.fullscreen === "exit" ? exitFullscreen() : enterFullscreen()));
  buttons.set(button, { label, canExit });
  refreshFullscreenButtons();
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

// Input types that take no keyboard.
const NO_KEYBOARD = new Set(["checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image", "hidden"]);

// Whether the person is typing: the focus is on a field that takes text. On a phone that is when the keyboard is up.
export function typingIn(): boolean {
  const node = document.activeElement;
  if (node instanceof HTMLTextAreaElement) {
    return !node.readOnly;
  }
  if (node instanceof HTMLInputElement) {
    return !NO_KEYBOARD.has(node.type) && !node.readOnly;
  }
  return node instanceof HTMLElement && node.isContentEditable;
}

// Keeps the field being typed in on the screen: when the keyboard takes part of the window, the sheet that holds the
// field scrolls to it, under its bar and above the keyboard. A sheet that opens with a field focused is not scrolled,
// since it opens at its top.
export function keepFieldInView(): void {
  const show = () => {
    const node = document.activeElement;
    if (typingIn() && node instanceof HTMLElement && node.closest(".sheet") !== null) {
      node.scrollIntoView({ block: "center", inline: "nearest" });
    }
  };
  window.addEventListener("resize", show);
  window.visualViewport?.addEventListener("resize", show);
}

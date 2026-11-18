import { el } from "../dom/el";

// The form controls of New Game and the lobby, in the sheets' own look: dark fields, gold rules, and
// boxes drawn as the settings sheet draws its check. Real inputs underneath, so the keyboard, a label's
// click and a screen reader all work as they do on any form.

export function textField(options: { name: string; max?: number; label: string; value?: string; placeholder?: string }): HTMLInputElement {
  const input = el("input", {
    class: "field",
    attrs: { type: "text", name: options.name, "aria-label": options.label, autocomplete: "off", spellcheck: "false" },
  });
  if (options.max !== undefined) {
    input.maxLength = options.max;
  }
  if (options.placeholder !== undefined) {
    input.placeholder = options.placeholder;
  }
  input.value = options.value ?? "";
  return input;
}

export function numberField(options: { name: string; min: number; max: number; label: string; value: number }): HTMLInputElement {
  const input = el("input", {
    class: "field number",
    attrs: { type: "number", name: options.name, min: String(options.min), max: String(options.max), step: "1", "aria-label": options.label },
  });
  input.value = String(options.value);
  return input;
}

export interface Choice<V extends string> {
  value: V;
  label: string;
  title?: string;
}

// A drop-down: its options are the page's own words, and the one chosen reads back as its value.
export class Choose<V extends string> {
  readonly element: HTMLSelectElement;

  constructor(
    name: string,
    label: string,
    private readonly choices: readonly Choice<V>[],
    value: V,
  ) {
    this.element = el("select", { class: "field", attrs: { name, "aria-label": label } });
    for (const choice of choices) {
      const option = el("option", { text: choice.label, attrs: { value: choice.value } });
      if (choice.title !== undefined) {
        option.title = choice.title;
      }
      this.element.append(option);
    }
    this.value = value;
  }

  get value(): V {
    return (this.choices[this.element.selectedIndex] ?? this.choices[0]).value;
  }

  set value(next: V) {
    const at = this.choices.findIndex((choice) => choice.value === next);
    this.element.selectedIndex = Math.max(0, at);
    this.describe();
  }

  // The chosen option's note is the control's tooltip, so a level is explained where it is chosen.
  describe(): void {
    this.element.title = this.choices[this.element.selectedIndex]?.title ?? "";
  }

  onChange(handler: () => void): void {
    this.element.addEventListener("change", () => {
      this.describe();
      handler();
    });
  }
}

// A box and its words, which a click on either flips: kind "check" or "radio".
export class Box {
  readonly element: HTMLLabelElement;
  readonly input: HTMLInputElement;

  constructor(kind: "check" | "radio", label: string, name: string) {
    this.input = el("input", { attrs: { type: kind === "check" ? "checkbox" : "radio", name } });
    this.element = el("label", { class: `check sheet-body ${kind === "radio" ? "radio" : ""}`.trim() }, this.input, el("span", { class: "box" }), el("span", { text: label }));
  }

  get checked(): boolean {
    return this.input.checked;
  }

  set checked(value: boolean) {
    this.input.checked = value;
  }

  onChange(handler: () => void): void {
    this.input.addEventListener("change", handler);
  }
}

// A heading over a rule, which sets a group of controls apart.
export function groupHead(text: string): HTMLElement {
  return el("div", { class: "ng-head sheet-label", text });
}

// A row of a form: the words, and what they are for.
export function formRow(label: string, ...controls: (Node | string)[]): HTMLElement[] {
  return [el("span", { class: "ng-label", text: label }), el("div", { class: "ng-line" }, ...controls)];
}

export function hint(text: string): HTMLElement {
  return el("span", { class: "sheet-note", text });
}

// The server's word on the last try. It stands in the sheet's error line in place of the sheet's own
// until the person changes something, since it was said of what they had typed then.
export class Refusal {
  private text = "";

  constructor(sheet: HTMLElement, private readonly changed: () => void) {
    // Capturing, so the word is gone before the control's own listener draws the line again.
    sheet.addEventListener("input", () => this.clear(), true);
    sheet.addEventListener("change", () => this.clear(), true);
  }

  set(text: string): void {
    this.text = text;
    this.changed();
  }

  clear(): void {
    this.text = "";
  }

  or(own: string): string {
    return this.text === "" ? own : this.text;
  }
}

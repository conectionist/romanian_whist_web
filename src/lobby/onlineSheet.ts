import { portraitUrl } from "../assets/assets";
import { el, setAttr, setSrc, setText } from "../dom/el";
import { t } from "../i18n/t";
import type { Gender, Profile } from "../net/protocol";
import type { Sheet } from "../sheets/layer";
import { SheetButton, actions } from "../sheets/parts";
import { facesFor } from "./catalogue";
import { Choose, Refusal, formRow, hint, textField } from "./controls";
import { genderChoices } from "./newGameSheet";
import { codeError, faceFor, normalizeCode, profileError } from "./profile";
import { MAX_NAME_LENGTH } from "./setup";

// Play online: who you are, and then a table of your own or somebody else's, by its code. Opened with
// a code when the address is a table's link, which fixes the table and asks only for who you are.

export interface OnlineActions {
  create(profile: Profile): void;
  join(code: string, profile: Profile): void;
  cancel(): void;
}

export class OnlineSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title", attrs: { id: "sheet-online-title" } });
  private readonly meta = el("div", { class: "sheet-meta" });
  private readonly name = textField({ name: "profileName", max: MAX_NAME_LENGTH, label: t("lobby", "Your name") });
  private readonly gender = new Choose<Gender>("profileGender", t("lobby", "Gender"), genderChoices(), "male");
  private readonly faces = el("div", { class: "portrait-choices", attrs: { role: "radiogroup", "aria-label": t("lobby", "Portrait") } });
  private readonly code = textField({ name: "tableCode", max: 40, label: t("lobby", "Table code"), placeholder: "ABC234" });
  private readonly codeRow: HTMLElement[];
  private readonly error = el("div", { class: "ng-error", attrs: { role: "alert" } });
  private readonly cancel = new SheetButton(t("NewGameDialog", "Cancel"), "quiet", "cancel");
  private readonly create = new SheetButton(t("lobby", "Create a table"), "quiet", "create");
  private readonly join = new SheetButton(t("lobby", "Join"), "primary", "join");
  private avatar = "";
  // The table the address names, when it names one.
  private fixed: string | null = null;
  private served = "";
  private readonly refusal: Refusal;
  private waiting = false;

  constructor(private readonly handlers: OnlineActions) {
    this.codeRow = formRow(t("lobby", "Table code"), this.code, hint(t("lobby", "from a link or a friend")));
    this.element = el(
      "section",
      { class: "sheet online", data: { sheet: "online" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-online-title" } },
      this.title,
      this.meta,
      el(
        "div",
        { class: "ng-grid" },
        ...formRow(t("lobby", "Your name"), this.name, this.gender.element),
        el("span", { class: "ng-label", text: t("lobby", "Portrait") }),
        this.faces,
        ...this.codeRow,
      ),
      this.error,
      actions(this.cancel, this.create, this.join),
    );
    this.refusal = new Refusal(this.element, () => this.refresh());
    this.name.addEventListener("input", () => this.refresh());
    this.gender.onChange(() => {
      this.avatar = faceFor(this.gender.value, this.avatar);
      this.paintFaces();
      this.refresh();
    });
    this.code.addEventListener("input", () => this.refresh());
    this.cancel.onClick(() => handlers.cancel());
    this.create.onClick(() => {
      if (profileError(this.profile()) === null) {
        handlers.create(this.profile());
      }
    });
    this.join.onClick(() => this.submit());
    this.element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement && !this.join.element.disabled) {
        event.preventDefault();
        this.submit();
      }
    });
  }

  // Opens on the profile last kept, or on a blank one. With `code` it joins that table and no other.
  open(profile: Profile, code: string | null): void {
    this.fixed = code;
    this.name.value = profile.name;
    this.gender.value = profile.gender;
    this.avatar = faceFor(profile.gender, profile.avatar);
    this.paintFaces();
    this.code.value = code ?? "";
    this.code.readOnly = code !== null;
    this.title.textContent = code === null ? t("lobby", "Play online") : t("lobby", "Join table %1", [code]);
    setText(this.meta, code === null ? t("lobby", "Make a table and share its link, or join one by its code.") : t("lobby", "Say who you are, and sit down."));
    for (const node of this.codeRow) {
      node.hidden = code !== null;
    }
    this.create.element.hidden = code !== null;
    this.refusal.clear();
    this.served = "";
    this.error.textContent = "";
    this.refresh();
  }

  refuse(text: string): void {
    this.refusal.set(text);
  }

  // The server is asked and has not answered: the button waits with it, so one click is one table.
  busy(waiting: boolean): void {
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      this.refresh();
    }
  }

  profile(): Profile {
    return { name: this.name.value, gender: this.gender.value, avatar: this.avatar };
  }

  private submit(): void {
    const code = this.fixed ?? normalizeCode(this.code.value);
    if (profileError(this.profile()) === null && codeError(code) === null) {
      this.handlers.join(code, this.profile());
    }
  }

  private paintFaces(): void {
    const ids = facesFor(this.gender.value);
    this.faces.replaceChildren(
      ...ids.map((id) => {
        const picture = el("img", { attrs: { alt: "", draggable: "false" } });
        setSrc(picture, portraitUrl(id) ?? null);
        const button = el("button", { class: "portrait-choice", attrs: { type: "button", role: "radio", "aria-label": id.replace(/-/g, " ") }, data: { face: id } }, picture);
        setAttr(button, "aria-checked", id === this.avatar ? "true" : "false");
        button.addEventListener("click", () => {
          this.avatar = id;
          this.refusal.clear();
          this.refresh();
          this.paintFaces();
        });
        return button;
      }),
    );
  }

  private refresh(): void {
    const wrong = profileError(this.profile());
    const code = this.fixed ?? normalizeCode(this.code.value);
    this.create.disabled = wrong !== null || this.waiting;
    this.join.disabled = wrong !== null || codeError(code) !== null || this.waiting;
    // Said once, and not on every key: the first thing a person needs is to be told what is missing.
    const shown = this.fixed === null && this.code.value === "" ? "" : (codeError(code) ?? "");
    const next = this.refusal.or(wrong !== null && this.name.value !== "" ? wrong : shown);
    if (next !== this.served) {
      this.served = next;
      setText(this.error, next);
    }
  }

  focusDefault(): void {
    if (this.name.value === "") {
      this.name.focus();
    } else if (this.fixed === null) {
      this.code.focus();
    } else {
      this.join.focus();
    }
  }
}

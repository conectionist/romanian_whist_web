import { el, setText } from "../dom/el";
import { t } from "../i18n/t";
import { ISSUES_URL, LICENCE_NAME, pageSourceUrl, serverSourceUrl, shortCommit, type Versions } from "../about/links";
import type { StoredItem } from "../storage/stored";
import type { Sheet } from "./layer";
import { SheetButton } from "./parts";

// About the page: who may read and change it, where its source is, which versions run, what it keeps in the
// browser, and the way to make it forget. The words are worked out apart from the elements, so a test reads them.

export interface SourceLine {
  label: string;
  href: string;
  // What is known of the commit the link names, or why the link is to the repository itself.
  note: string;
}

export interface AboutFields {
  title: string;
  licence: string;
  sourceHeading: string;
  sources: SourceLine[];
  versionHeading: string;
  versions: { label: string; value: string }[];
  storedHeading: string;
  stored: { what: string; keys: string }[];
  privacy: string;
}

function build(version: string, commit: string | null): string {
  const short = shortCommit(commit);
  return short === null ? t("about", "%1, commit unknown", [version]) : t("about", "%1, commit %2", [version, short]);
}

export function fieldsFor(versions: Versions, items: readonly StoredItem[]): AboutFields {
  const page = versions.page;
  const server = versions.server;
  const pageCommit = shortCommit(page.commit);
  const serverCommit = shortCommit(server?.commit);
  return {
    title: t("about", "About this page"),
    licence: t("about", "Romanian Whist online is free software under the %1. Anyone may read, run and change its source.", [LICENCE_NAME]),
    sourceHeading: t("about", "Source code"),
    sources: [
      {
        label: t("about", "Server source code"),
        href: serverSourceUrl(versions),
        note:
          server === null
            ? t("about", "not connected yet, so the link is to the repository")
            : serverCommit === null
              ? t("about", "its commit is unknown, so the link is to the repository")
              : t("about", "commit %1", [serverCommit]),
      },
      {
        label: t("about", "Page source code"),
        href: pageSourceUrl(versions),
        note: pageCommit === null ? t("about", "this build's commit is unknown, so the link is to the repository") : t("about", "commit %1", [pageCommit]),
      },
    ],
    versionHeading: t("about", "Versions"),
    versions: [
      { label: t("about", "Page"), value: build(page.version, page.commit) },
      { label: t("about", "Server"), value: server === null ? t("about", "not connected yet") : build(server.version, server.commit) },
      { label: t("about", "Protocol"), value: String(versions.protocol) },
    ],
    storedHeading: t("about", "What this page keeps in your browser"),
    stored: items.map((item) => ({ what: item.what, keys: item.keys.join(", ") })),
    privacy: t("about", "There are no accounts and no cookies, and the page asks no other site for anything."),
  };
}

export interface AboutActions {
  close(): void;
  // Clears what the page keeps and loads it anew.
  forget(): void;
}

function link(href: string, text: string, className: string): HTMLAnchorElement {
  // Opened in a tab of its own, which cannot reach back into the page.
  return el("a", { class: className, attrs: { href, target: "_blank", rel: "noopener noreferrer" }, text });
}

export class AboutSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title", attrs: { id: "sheet-about-title" } });
  private readonly body = el("div", { class: "sheet-body about" });
  private readonly close = new SheetButton(t("about", "Close"), "primary", "close");
  private readonly forget = new SheetButton(t("about", "Forget this browser"), "quiet", "forget");
  private readonly really = new SheetButton(t("about", "Forget"), "primary", "forget-yes");
  private readonly keep = new SheetButton(t("about", "Keep"), "quiet", "forget-no");
  private readonly report = link(ISSUES_URL, t("about", "Report a problem"), "sheet-btn");
  private readonly confirm = el("div", { class: "sheet-actions about-confirm", attrs: { role: "group", "aria-labelledby": "about-confirm-text" } });
  private readonly choices = el("div", { class: "sheet-actions" });
  private shown = "";

  constructor(handlers: AboutActions) {
    this.report.dataset.action = "report";
    this.choices.append(this.report, this.forget.element, this.close.element);
    const question = el("p", { class: "about-confirm-text", attrs: { id: "about-confirm-text" }, text: t("about", "Remove everything listed above from this browser? You will not be able to return to a game you are at. The page reloads.") });
    this.confirm.append(question, this.keep.element, this.really.element);
    this.confirm.hidden = true;
    this.element = el(
      "section",
      { class: "sheet about-sheet", data: { sheet: "about" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-about-title" } },
      this.title,
      this.body,
      this.choices,
      this.confirm,
    );
    this.close.onClick(handlers.close);
    this.forget.onClick(() => this.ask(true));
    this.keep.onClick(() => this.ask(false));
    this.really.onClick(handlers.forget);
  }

  // Fills the sheet, unless it already says this.
  update(fields: AboutFields): void {
    const key = JSON.stringify(fields);
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    setText(this.title, fields.title);
    this.body.replaceChildren(
      el("p", { class: "about-licence", text: fields.licence }),
      el("h3", { class: "sheet-label", text: fields.sourceHeading }),
      el(
        "ul",
        { class: "about-list about-sources" },
        ...fields.sources.map((source) => el("li", {}, link(source.href, source.label, "about-link"), el("span", { class: "about-note", text: ` ${source.note}` }))),
      ),
      el("h3", { class: "sheet-label", text: fields.versionHeading }),
      el("dl", { class: "about-versions" }, ...fields.versions.flatMap((each) => [el("dt", { text: each.label }), el("dd", { text: each.value })])),
      el("h3", { class: "sheet-label", text: fields.storedHeading }),
      el(
        "ul",
        { class: "about-list about-stored" },
        ...fields.stored.map((each) => el("li", {}, el("span", { text: each.what }), el("code", { class: "about-note", text: ` ${each.keys}` }))),
      ),
      el("p", { class: "about-privacy", text: fields.privacy }),
    );
  }

  // The question is put to the person each time the sheet comes up, never left standing from before.
  open(): void {
    this.ask(false, false);
  }

  private ask(asking: boolean, focus = true): void {
    this.confirm.hidden = !asking;
    this.choices.hidden = asking;
    if (focus) {
      (asking ? this.keep : this.forget).focus();
    }
  }

  focusDefault(): void {
    this.close.focus();
  }
}

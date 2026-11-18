import { t } from "../i18n/t";

// The name a link gives a screen reader when it opens in a tab of its own, which a person who cannot see the tab
// would not otherwise know: the visible words come first, as the name must hold them.
export function opensInNewTab(label: string): string {
  return t("links", "%1 (opens in a new tab)", [label]);
}

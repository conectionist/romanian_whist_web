import { setLanguage, type Language } from "./language";
import { t } from "./t";

// What a language is for the page's document: the language it is written in, for the browser and for
// screen readers, and the title in that language.
export interface Titled {
  title: string;
  documentElement: { lang: string };
}

// Starts the page in a language: it is fixed here, before anything makes any text.
export function startIn(language: Language, page: Titled): void {
  setLanguage(language);
  page.documentElement.lang = language;
  page.title = t("MainWindow", "Romanian Whist");
}

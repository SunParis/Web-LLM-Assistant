import en from "./en.js";
import zhHant from "./zh-Hant.js";
import zhHans from "./zh-Hans.js";
import ja from "./ja.js";

export const LOCALES = {
  en,
  "ja": ja,
  "zh-Hant": zhHant,
  "zh-Hans": zhHans
};

export const SUPPORTED_LANGUAGES = Object.keys(LOCALES);

export function getLocale(lang) {
  return LOCALES[lang] || LOCALES["zh-Hant"];
}

export function getLocaleStrings(lang) {
  return getLocale(lang).strings;
}

export function getDefaultPromptByLanguage() {
  const prompts = {};
  for (const lang of SUPPORTED_LANGUAGES) {
    prompts[lang] = LOCALES[lang].promptTemplate;
  }
  return prompts;
}

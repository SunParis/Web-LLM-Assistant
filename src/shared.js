import {
  getDefaultPromptByLanguage,
  getLocaleStrings,
  SUPPORTED_LANGUAGES
} from "./locales/index.js";

export { SUPPORTED_LANGUAGES };

export const DEFAULT_SETTINGS = {
  displayLanguage: "zh-Hant",
  themeMode: "system",
  apiUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  promptByLanguage: getDefaultPromptByLanguage(),
  temperature: 0.7,
  topP: 1,
  maxTokens: 1024
};

export async function getSettings() {
  const data = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const promptByLanguage = {
    ...DEFAULT_SETTINGS.promptByLanguage,
    ...(data.promptByLanguage || {})
  };
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    promptByLanguage
  };
}

export function normalizeApiEndpoint(raw) {
  const base = (raw || "").trim();
  if (!base) {
    return "";
  }
  if (base.endsWith("/chat/completions")) {
    return base;
  }
  return `${base.replace(/\/$/, "")}/chat/completions`;
}

export function makeSessionKey(tabId, pageUrl) {
  return `session:${tabId}:${pageUrl}`;
}

export async function getSession(tabId, pageUrl) {
  const key = makeSessionKey(tabId, pageUrl);
  const data = await chrome.storage.session.get(key);
  return data[key] || { messages: [], snippets: [] };
}

export async function setSession(tabId, pageUrl, session) {
  const key = makeSessionKey(tabId, pageUrl);
  await chrome.storage.session.set({ [key]: session });
}

export async function appendSnippet(tabId, pageUrl, snippet) {
  const session = await getSession(tabId, pageUrl);
  session.snippets.push(snippet);
  await setSession(tabId, pageUrl, session);
  return session;
}

export async function clearTabSessions(tabId) {
  const all = await chrome.storage.session.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(`session:${tabId}:`));
  if (keys.length > 0) {
    await chrome.storage.session.remove(keys);
  }
}

export function getDict(lang) {
  return getLocaleStrings(lang);
}

function emptyMarker(lang) {
  if (lang === "en") {
    return "(empty)";
  }
  return "（空）";
}

export function getPromptTemplate(settings, lang) {
  const promptByLanguage = settings?.promptByLanguage || {};
  return (
    promptByLanguage[lang] ||
    DEFAULT_SETTINGS.promptByLanguage[lang] ||
    DEFAULT_SETTINGS.promptByLanguage[DEFAULT_SETTINGS.displayLanguage]
  );
}

export function fillPromptTemplate(template, vars, lang) {
  const normalized = {
    history: vars?.history?.trim() || emptyMarker(lang),
    selected_text: vars?.selected_text?.trim() || emptyMarker(lang),
    user_query: vars?.user_query?.trim() || emptyMarker(lang)
  };

  return template
    .replaceAll("{{history}}", normalized.history)
    .replaceAll("{{selected_text}}", normalized.selected_text)
    .replaceAll("{{user_query}}", normalized.user_query);
}

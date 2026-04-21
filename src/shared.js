import {
  getDefaultPromptByLanguage,
  getLocaleStrings,
  SUPPORTED_LANGUAGES
} from "./locales/index.js";

export { SUPPORTED_LANGUAGES };

export const DEFAULT_SETTINGS = {
  displayLanguage: "zh-Hant",
  themeMode: "system",
  enableSidePanelShortcut: false,
  enablePageSummary: false,
  legalConsentAccepted: false,
  sensitiveDataReminderEnabled: true,
  apiUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  promptByLanguage: getDefaultPromptByLanguage(),
  temperature: 0.7,
  topP: 1,
  maxTokens: 1024
};

const API_KEY_LEGACY_KEY = "apiKey";
const API_KEY_CIPHERTEXT_KEY = "apiKeyCiphertext";
const API_KEY_IV_KEY = "apiKeyIv";
const LOCAL_SECRET_KEY = "localCryptoSecret";
const SESSION_KEY_VERSION = "v2";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizePageUrlForSession(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    // Treat only in-page fragment updates as the same page session.
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

async function sha256Hex(input) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
  const hashBytes = new Uint8Array(hashBuffer);
  let hex = "";
  for (let i = 0; i < hashBytes.length; i += 1) {
    hex += hashBytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function getOrCreateLocalSecret() {
  const data = await chrome.storage.local.get(LOCAL_SECRET_KEY);
  const existing = data[LOCAL_SECRET_KEY];
  if (typeof existing === "string" && existing) {
    return existing;
  }

  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const created = bytesToBase64(randomBytes);
  await chrome.storage.local.set({ [LOCAL_SECRET_KEY]: created });
  return created;
}

async function getApiKeyCryptoKey() {
  const localSecret = await getOrCreateLocalSecret();
  const keySeed = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(`web-llm-assistant|${chrome.runtime.id}|${localSecret}`)
  );
  return crypto.subtle.importKey("raw", keySeed, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
}

async function encryptApiKey(plainApiKey) {
  const normalized = String(plainApiKey || "").trim();
  if (!normalized) {
    return {
      [API_KEY_CIPHERTEXT_KEY]: "",
      [API_KEY_IV_KEY]: ""
    };
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await getApiKeyCryptoKey();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    textEncoder.encode(normalized)
  );

  return {
    [API_KEY_CIPHERTEXT_KEY]: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    [API_KEY_IV_KEY]: bytesToBase64(iv)
  };
}

async function decryptApiKey(ciphertextBase64, ivBase64) {
  if (!ciphertextBase64 || !ivBase64) {
    return "";
  }

  try {
    const ciphertext = base64ToBytes(ciphertextBase64);
    const iv = base64ToBytes(ivBase64);
    const cryptoKey = await getApiKeyCryptoKey();
    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext
    );
    return textDecoder.decode(plainBuffer).trim();
  } catch {
    return "";
  }
}

function makeLegacySessionKey(tabId, pageUrl) {
  return `session:${tabId}:${pageUrl}`;
}

export async function getSettings() {
  const data = await chrome.storage.local.get(null);
  const {
    [API_KEY_LEGACY_KEY]: _legacyApiKey,
    [API_KEY_CIPHERTEXT_KEY]: _apiCiphertext,
    [API_KEY_IV_KEY]: _apiIv,
    [LOCAL_SECRET_KEY]: _localSecret,
    ...publicData
  } = data;
  const promptByLanguage = {
    ...DEFAULT_SETTINGS.promptByLanguage,
    ...(publicData.promptByLanguage || {})
  };
  const encryptedApiKey = await decryptApiKey(
    data[API_KEY_CIPHERTEXT_KEY],
    data[API_KEY_IV_KEY]
  );
  const legacyApiKey = typeof data[API_KEY_LEGACY_KEY] === "string" ? data[API_KEY_LEGACY_KEY].trim() : "";
  const apiKey = encryptedApiKey || legacyApiKey;

  if (legacyApiKey) {
    await setApiKey(legacyApiKey);
  }

  return {
    ...DEFAULT_SETTINGS,
    ...publicData,
    promptByLanguage,
    apiKey
  };
}

export async function setApiKey(apiKey) {
  const normalized = String(apiKey || "").trim();
  if (!normalized) {
    await chrome.storage.local.remove([
      API_KEY_CIPHERTEXT_KEY,
      API_KEY_IV_KEY,
      API_KEY_LEGACY_KEY
    ]);
    return;
  }
  const encrypted = await encryptApiKey(normalized);
  await chrome.storage.local.set(encrypted);
  await chrome.storage.local.remove(API_KEY_LEGACY_KEY);
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

export async function makeSessionKey(tabId, pageUrl) {
  const normalizedUrl = normalizePageUrlForSession(pageUrl);
  const pageHash = await sha256Hex(normalizedUrl || "(empty)");
  return `session:${tabId}:${SESSION_KEY_VERSION}:${pageHash}`;
}

export async function getSession(tabId, pageUrl) {
  const key = await makeSessionKey(tabId, pageUrl);
  const legacyKey = makeLegacySessionKey(tabId, pageUrl);
  const data = await chrome.storage.session.get([key, legacyKey]);

  if (data[key]) {
    return data[key];
  }

  if (data[legacyKey]) {
    await chrome.storage.session.set({ [key]: data[legacyKey] });
    await chrome.storage.session.remove(legacyKey);
    return data[legacyKey];
  }

  return { messages: [], snippets: [] };
}

export async function setSession(tabId, pageUrl, session) {
  const key = await makeSessionKey(tabId, pageUrl);
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
    page_summary: vars?.page_summary?.trim() || "",
    user_query: vars?.user_query?.trim() || emptyMarker(lang)
  };

  return template
    .replaceAll("{{history}}", normalized.history)
    .replaceAll("{{selected_text}}", normalized.selected_text)
    .replaceAll("{{page_summary}}", normalized.page_summary)
    .replaceAll("{{user_query}}", normalized.user_query);
}

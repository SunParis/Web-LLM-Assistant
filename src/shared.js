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

const RUNTIME_BOUNDS = {
  temperature: { min: 0, max: 2 },
  topP: { min: 0, max: 1 },
  maxTokens: { min: 1, max: 16384 }
};

const API_KEY_LEGACY_KEY = "apiKey";
const API_KEY_CIPHERTEXT_KEY = "apiKeyCiphertext";
const API_KEY_IV_KEY = "apiKeyIv";
const LOCAL_SECRET_KEY = "localCryptoSecret";
const SESSION_KEY_VERSION = "v2";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Converts a byte array to a base64 string.
 * @param {Uint8Array} bytes - The byte array to convert.
 * @returns {string} The resulting base64 string.
 */
function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to a byte array.
 * @param {string} base64 - The base64 string to convert.
 * @returns {Uint8Array} The resulting byte array.
 */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Normalizes a page URL by removing its hash, used for session grouping.
 * @param {string} rawUrl - The raw input URL.
 * @returns {string} The normalized URL.
 */
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

/**
 * Computes the SHA-256 hash of an input string and returns it as a hex string.
 * @param {string} input - The string to hash.
 * @returns {Promise<string>} A promise resolving to the hex string hash.
 */
async function sha256Hex(input) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
  const hashBytes = new Uint8Array(hashBuffer);
  let hex = "";
  for (let i = 0; i < hashBytes.length; i += 1) {
    hex += hashBytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Retrieves the local cryptographic secret or creates one if it does not exist.
 * @returns {Promise<string>} A promise resolving to the base64 encrypted secret.
 */
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

/**
 * Derives an AES-GCM CryptoKey used for encrypting and decrypting the API key.
 * @returns {Promise<CryptoKey>} A promise resolving to the derived CryptoKey.
 */
async function getApiKeyCryptoKey() {
  // Derive a stable local-only key:
  // extension id (scope) + random secret (entropy) -> AES-GCM key seed.
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

/**
 * Encrypts a plaintext API key and returns the ciphertext and Initialization Vector (IV).
 * @param {string} plainApiKey - The plaintext API key.
 * @returns {Promise<Object>} An object containing the ciphertext and IV.
 */
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

/**
 * Decrypts an encrypted API key back to its plaintext string.
 * @param {string} ciphertextBase64 - The base64 encoded ciphertext.
 * @param {string} ivBase64 - The base64 encoded IV.
 * @returns {Promise<string>} A promise resolving to the plaintext API key.
 */
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

/**
 * Generates a legacy session key based on tab ID and page URL.
 * @param {number|string} tabId - The tab ID.
 * @param {string} pageUrl - The page URL.
 * @returns {string} The legacy session key.
 */
function makeLegacySessionKey(tabId, pageUrl) {
  return `session:${tabId}:${pageUrl}`;
}

/**
 * Retrieves all user settings from local storage, decrypting the API key if necessary.
 * @returns {Promise<Object>} A promise resolving to the settings object.
 */
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

  // Lazy migration: any old plaintext key is re-written as encrypted key on read.
  if (legacyApiKey) {
    await setApiKey(legacyApiKey);
  }

  return {
    ...DEFAULT_SETTINGS,
    ...publicData,
    promptByLanguage,
    enableSidePanelShortcut: publicData.enableSidePanelShortcut === true,
    enablePageSummary: publicData.enablePageSummary === true,
    legalConsentAccepted: publicData.legalConsentAccepted === true,
    sensitiveDataReminderEnabled: publicData.sensitiveDataReminderEnabled !== false,
    apiKey
  };
}

/**
 * Encrypts and securely stores the provided API key in local storage.
 * @param {string} apiKey - The plaintext API key to save.
 */
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

/**
 * Clamps a number within a specified minimum and maximum bound.
 * @param {number|string} value - The input value.
 * @param {Object} bounds - An object with `min` and `max` properties.
 * @param {number} fallback - The fallback value if input is invalid.
 * @returns {number} The clamped number.
 */
function clampNumber(value, bounds, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}

/**
 * Centralized runtime parameter sanitization used by both options and side panel.
 * This keeps saved values and request payloads bounded without changing UX flow.
 */
export function sanitizeModelParams(input = {}) {
  return {
    temperature: clampNumber(
      input.temperature,
      RUNTIME_BOUNDS.temperature,
      DEFAULT_SETTINGS.temperature
    ),
    topP: clampNumber(input.topP, RUNTIME_BOUNDS.topP, DEFAULT_SETTINGS.topP),
    maxTokens: Math.floor(
      clampNumber(
        input.maxTokens,
        RUNTIME_BOUNDS.maxTokens,
        DEFAULT_SETTINGS.maxTokens
      )
    )
  };
}

/**
 * Normalize user-provided API base URL into `/chat/completions` endpoint.
 * Only `http(s)` endpoints are accepted to avoid accidental or unsafe schemes.
 */
export function normalizeApiEndpoint(raw) {
  const base = (raw || "").trim();
  if (!base) {
    return "";
  }
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    if (!parsed.pathname.endsWith("/chat/completions")) {
      parsed.pathname = `${parsed.pathname}/chat/completions`;
    }
    return parsed.toString();
  } catch {
    if (base.endsWith("/chat/completions")) {
      return base;
    }
    return `${base.replace(/\/$/, "")}/chat/completions`;
  }
}

/**
 * Generates a current version session key for storing tab-specific data.
 * @param {number} tabId - The ID of the tab.
 * @param {string} pageUrl - The current URL of the page.
 * @returns {Promise<string>} A promise resolving to the session storage key.
 */
export async function makeSessionKey(tabId, pageUrl) {
  // Avoid storing raw URL in storage key to reduce privacy exposure.
  const normalizedUrl = normalizePageUrlForSession(pageUrl);
  const pageHash = await sha256Hex(normalizedUrl || "(empty)");
  return `session:${tabId}:${SESSION_KEY_VERSION}:${pageHash}`;
}

/**
 * Retrieves the session data for a given tab and URL, handling legacy keys migration.
 * @param {number} tabId - The tab ID.
 * @param {string} pageUrl - The tab URL.
 * @returns {Promise<Object>} A promise resolving to the session data object.
 */
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

/**
 * Saves the session data for a given tab and URL.
 * @param {number} tabId - The tab ID.
 * @param {string} pageUrl - The tab URL.
 * @param {Object} session - The session data to store.
 */
export async function setSession(tabId, pageUrl, session) {
  const key = await makeSessionKey(tabId, pageUrl);
  await chrome.storage.session.set({ [key]: session });
}

/**
 * Appends a text snippet to the current session associated with a tab and URL.
 * @param {number} tabId - The tab ID.
 * @param {string} pageUrl - The tab URL.
 * @param {string} snippet - The text snippet to add.
 * @returns {Promise<Object>} A promise resolving to the updated session data.
 */
export async function appendSnippet(tabId, pageUrl, snippet) {
  const session = await getSession(tabId, pageUrl);
  session.snippets.push(snippet);
  await setSession(tabId, pageUrl, session);
  return session;
}

/**
 * Clears all session data related to a specific tab ID from session storage.
 * @param {number} tabId - The tab ID to clear data for.
 */
export async function clearTabSessions(tabId) {
  const all = await chrome.storage.session.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(`session:${tabId}:`));
  if (keys.length > 0) {
    await chrome.storage.session.remove(keys);
  }
}

/**
 * Retrieves the localized dictionary for the given language.
 * @param {string} lang - The language code.
 * @returns {Object} The dictionary object containing localized strings.
 */
export function getDict(lang) {
  return getLocaleStrings(lang);
}

function emptyMarker(lang) {
  if (lang === "en") {
    return "(empty)";
  }
  return "（空）";
}

/**
 * Selects the appropriate prompt template based on user settings and language.
 * @param {Object} settings - The user settings containing prompt preferences.
 * @param {string} lang - The target language code.
 * @returns {string} The prompt template string.
 */
export function getPromptTemplate(settings, lang) {
  const promptByLanguage = settings?.promptByLanguage || {};
  return (
    promptByLanguage[lang] ||
    DEFAULT_SETTINGS.promptByLanguage[lang] ||
    DEFAULT_SETTINGS.promptByLanguage[DEFAULT_SETTINGS.displayLanguage]
  );
}

/**
 * Fills the prompt template with provided variables (history, selected text, etc.).
 * @param {string} template - The prompt template string.
 * @param {Object} vars - The variables to replace in the template.
 * @param {string} lang - The language code for specific empty markers.
 * @returns {string} The fully instantiated prompt string.
 */
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

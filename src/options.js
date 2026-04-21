import {
  DEFAULT_SETTINGS,
  getPromptTemplate,
  getDict,
  getSettings,
  normalizeApiEndpoint,
  setApiKey,
  SUPPORTED_LANGUAGES
} from "./shared.js";

const els = {
  title: document.getElementById("settings-title"),
  language: document.getElementById("display-language"),
  themeMode: document.getElementById("theme-mode"),
  apiUrl: document.getElementById("api-url"),
  apiKey: document.getElementById("api-key"),
  model: document.getElementById("model"),
  prompt: document.getElementById("system-prompt"),
  temperature: document.getElementById("temperature"),
  topP: document.getElementById("top-p"),
  maxTokens: document.getElementById("max-tokens"),
  enableSidePanelShortcut: document.getElementById("enable-sidepanel-shortcut"),
  enableSidePanelShortcutHelp: document.getElementById("enable-sidepanel-shortcut-help"),
  enablePageSummary: document.getElementById("enable-page-summary"),
  enablePageSummaryHelp: document.getElementById("enable-page-summary-help"),
  legalConsent: document.getElementById("legal-consent"),
  legalConsentHelp: document.getElementById("legal-consent-help"),
  sensitiveReminder: document.getElementById("sensitive-reminder"),
  sensitiveReminderHelp: document.getElementById("sensitive-reminder-help"),
  saveBtn: document.getElementById("save-btn"),
  testBtn: document.getElementById("test-btn"),
  status: document.getElementById("status"),
  labelLanguage: document.getElementById("label-language"),
  labelThemeMode: document.getElementById("label-theme-mode"),
  labelApiUrl: document.getElementById("label-api-url"),
  labelApiKey: document.getElementById("label-api-key"),
  labelModel: document.getElementById("label-model"),
  labelPrompt: document.getElementById("label-prompt"),
  promptHelp: document.getElementById("prompt-help"),
  labelTemperature: document.getElementById("label-temperature"),
  labelTopP: document.getElementById("label-top-p"),
  labelMaxTokens: document.getElementById("label-max-tokens"),
  labelEnableSidePanelShortcut: document.getElementById("label-enable-sidepanel-shortcut"),
  labelEnablePageSummary: document.getElementById("label-enable-page-summary"),
  labelLegalConsent: document.getElementById("label-legal-consent"),
  labelSensitiveReminder: document.getElementById("label-sensitive-reminder")
};

let currentDict = getDict(DEFAULT_SETTINGS.displayLanguage);
let promptByLanguageCache = { ...DEFAULT_SETTINGS.promptByLanguage };
let activeLanguage = DEFAULT_SETTINGS.displayLanguage;

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") {
    root.setAttribute("data-theme", mode);
    return;
  }
  root.removeAttribute("data-theme");
}

function normalizePromptText(text) {
  return (text || "").trim();
}

function isCustomPrompt(text, lang) {
  const current = normalizePromptText(text);
  const def = normalizePromptText(DEFAULT_SETTINGS.promptByLanguage[lang] || "");
  return current !== "" && current !== def;
}

function applyPromptToAllLanguages(promptText) {
  for (const lang of SUPPORTED_LANGUAGES) {
    promptByLanguageCache[lang] = promptText;
  }
}

function applyText() {
  els.title.textContent = currentDict.settingsTitle;
  els.labelLanguage.textContent = currentDict.displayLanguage;
  els.labelThemeMode.textContent = currentDict.themeMode;
  els.themeMode.options[0].textContent = currentDict.themeSystem;
  els.themeMode.options[1].textContent = currentDict.themeLight;
  els.themeMode.options[2].textContent = currentDict.themeDark;
  els.labelApiUrl.textContent = currentDict.apiUrl;
  els.labelApiKey.textContent = currentDict.apiKey;
  els.labelModel.textContent = currentDict.model;
  els.labelPrompt.textContent = currentDict.prompt;
  els.promptHelp.textContent = currentDict.promptHelp || "";
  els.labelTemperature.textContent = currentDict.temperature;
  els.labelTopP.textContent = currentDict.topP;
  els.labelMaxTokens.textContent = currentDict.maxTokens;
  els.labelEnableSidePanelShortcut.textContent = currentDict.enableSidePanelShortcutLabel;
  els.enableSidePanelShortcutHelp.textContent = currentDict.enableSidePanelShortcutHelp;
  els.labelEnablePageSummary.textContent = currentDict.enablePageSummaryLabel;
  els.enablePageSummaryHelp.textContent = currentDict.enablePageSummaryHelp;
  els.labelLegalConsent.textContent = currentDict.legalConsentLabel;
  els.legalConsentHelp.textContent = currentDict.legalConsentHelp;
  els.labelSensitiveReminder.textContent = currentDict.sensitiveReminderLabel;
  els.sensitiveReminderHelp.textContent = currentDict.sensitiveReminderHelp;
  els.saveBtn.textContent = currentDict.save;
  els.testBtn.textContent = currentDict.testApi;
}

function setStatus(text, ok = true) {
  els.status.textContent = text;
  els.status.style.color = ok ? "#166534" : "#b91c1c";
}

async function loadValues() {
  const settings = await getSettings();
  if (!settings.promptByLanguage || typeof settings.promptByLanguage !== "object") {
    settings.promptByLanguage = { ...DEFAULT_SETTINGS.promptByLanguage };
  }
  currentDict = getDict(settings.displayLanguage);
  applyText();

  activeLanguage = SUPPORTED_LANGUAGES.includes(settings.displayLanguage)
    ? settings.displayLanguage
    : DEFAULT_SETTINGS.displayLanguage;
  els.language.value = activeLanguage;
  els.apiUrl.value = settings.apiUrl;
  els.themeMode.value = settings.themeMode || "system";
  applyTheme(els.themeMode.value);
  els.apiKey.value = settings.apiKey;
  els.model.value = settings.model;
  promptByLanguageCache = {
    ...DEFAULT_SETTINGS.promptByLanguage,
    ...(settings.promptByLanguage || {})
  };
  els.prompt.value = getPromptTemplate({ promptByLanguage: promptByLanguageCache }, activeLanguage);
  els.temperature.value = settings.temperature;
  els.topP.value = settings.topP;
  els.maxTokens.value = settings.maxTokens;
  els.enableSidePanelShortcut.checked = Boolean(settings.enableSidePanelShortcut);
  els.enablePageSummary.checked = Boolean(settings.enablePageSummary);
  els.legalConsent.checked = Boolean(settings.legalConsentAccepted);
  els.sensitiveReminder.checked = settings.sensitiveDataReminderEnabled !== false;
}

function collectValues() {
  promptByLanguageCache[activeLanguage] = els.prompt.value;
  if (isCustomPrompt(els.prompt.value, activeLanguage)) {
    applyPromptToAllLanguages(els.prompt.value);
  }
  return {
    displayLanguage: els.language.value,
    themeMode: els.themeMode.value,
    apiUrl: els.apiUrl.value.trim(),
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim(),
    promptByLanguage: promptByLanguageCache,
    temperature: Number(els.temperature.value),
    topP: Number(els.topP.value),
    maxTokens: Number(els.maxTokens.value),
    enableSidePanelShortcut: Boolean(els.enableSidePanelShortcut.checked),
    enablePageSummary: Boolean(els.enablePageSummary.checked),
    legalConsentAccepted: Boolean(els.legalConsent.checked),
    sensitiveDataReminderEnabled: Boolean(els.sensitiveReminder.checked)
  };
}

async function saveSettings() {
  const settings = collectValues();
  if (!settings.legalConsentAccepted) {
    setStatus(currentDict.legalConsentRequired, false);
    return;
  }
  const { apiKey, ...nonSecretSettings } = settings;
  await chrome.storage.local.set(nonSecretSettings);
  await setApiKey(apiKey);
  currentDict = getDict(settings.displayLanguage);
  applyTheme(settings.themeMode);
  applyText();
  setStatus(currentDict.saved, true);
}

async function testConnection() {
  const settings = collectValues();
  const endpoint = normalizeApiEndpoint(settings.apiUrl);
  if (!endpoint || !settings.apiKey || !settings.model) {
    setStatus(`${currentDict.testFail}: missing API URL/key/model`, false);
    return;
  }

  els.testBtn.disabled = true;
  setStatus(currentDict.testing, true);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: Number.isFinite(settings.temperature) ? settings.temperature : 0.7,
        messages: [{ role: "user", content: "Reply with: OK" }],
        max_tokens: 20
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      setStatus(`${currentDict.testFail}: ${res.status} ${txt}`, false);
      return;
    }

    setStatus(currentDict.testOk, true);
  } catch (err) {
    setStatus(`${currentDict.testFail}: ${err.message}`, false);
  } finally {
    els.testBtn.disabled = false;
  }
}

els.language.addEventListener("change", async () => {
  promptByLanguageCache[activeLanguage] = els.prompt.value;
  if (isCustomPrompt(els.prompt.value, activeLanguage)) {
    applyPromptToAllLanguages(els.prompt.value);
  }
  activeLanguage = els.language.value;
  currentDict = getDict(els.language.value);
  els.prompt.value = getPromptTemplate({ promptByLanguage: promptByLanguageCache }, activeLanguage);
  applyText();
});

els.themeMode.addEventListener("change", () => {
  setStatus("", true);
});

els.saveBtn.addEventListener("click", saveSettings);
els.testBtn.addEventListener("click", testConnection);

loadValues();

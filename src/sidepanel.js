import {
  fillPromptTemplate,
  getDict,
  getPromptTemplate,
  getSession,
  getSettings,
  normalizeApiEndpoint,
  setSession
} from "./shared.js";

const els = {
  title: document.getElementById("title"),
  clearHistoryBtn: document.getElementById("clear-history-btn"),
  settingsLink: document.getElementById("settings-link"),
  messages: document.getElementById("messages"),
  snippetLabel: document.getElementById("snippet-label"),
  snippetList: document.getElementById("snippet-list"),
  input: document.getElementById("user-input"),
  sendBtn: document.getElementById("send-btn")
};

let currentContext = {
  tabId: null,
  pageUrl: "",
  session: { messages: [], snippets: [] }
};

let currentDict = getDict("zh-Hant");
let currentAbortController = null;
const ICON_SEND =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 20.25V14.5L10.5 12L3 9.5V3.75L21 12L3 20.25Z"/></svg>';
const ICON_STOP =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';
const ICON_COPY =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 8h11v13H8z"/><path fill="currentColor" d="M5 3h11v3H8v10H5z"/></svg>';
const ICON_DELETE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4z"/><path fill="currentColor" d="M6 9h12l-1 12H7z"/></svg>';
const ICON_SETTINGS =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.51.41 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/></svg>';
const ICON_CLEAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 7h12v2H6z"/><path fill="currentColor" d="M8 10h8l-1 9H9z"/><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4z"/></svg>';

function isPendingMessage(msg) {
  return msg?.meta === "pending";
}

function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

async function copyToClipboard(text) {
  if (!text) {
    return;
  }
  await navigator.clipboard.writeText(text);
}

async function deleteMessageAt(index) {
  const target = currentContext.session.messages[index];
  const indexesToRemove = [index];

  // If deleting a user question, also delete attached selected-text messages immediately before it.
  if (target?.role === "user" && target?.meta !== "snippet") {
    let i = index - 1;
    while (i >= 0 && currentContext.session.messages[i]?.meta === "snippet") {
      indexesToRemove.push(i);
      i -= 1;
    }
  }

  indexesToRemove.sort((a, b) => b - a).forEach((i) => {
    currentContext.session.messages.splice(i, 1);
  });
  await persistSession();
  renderMessages();
}

function createIconButton(iconSvg, title, onClick, className = "msg-btn") {
  const btn = document.createElement("button");
  btn.className = className;
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.innerHTML = iconSvg;
  btn.addEventListener("click", onClick);
  return btn;
}

function setSendButtonMode(isGenerating) {
  if (isGenerating) {
    els.sendBtn.dataset.mode = "stop";
    els.sendBtn.title = currentDict.stop;
    els.sendBtn.setAttribute("aria-label", currentDict.stop);
    els.sendBtn.innerHTML = ICON_STOP;
    return;
  }
  els.sendBtn.dataset.mode = "send";
  els.sendBtn.title = currentDict.send;
  els.sendBtn.setAttribute("aria-label", currentDict.send);
  els.sendBtn.innerHTML = ICON_SEND;
}

function renderMessages() {
  const { messages } = currentContext.session;
  els.messages.innerHTML = "";

  if (!messages.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = currentDict.noMessages;
    els.messages.appendChild(div);
    return;
  }

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    const div = document.createElement("div");
    const isSnippet = msg.meta === "snippet";
    const isPending = isPendingMessage(msg);
    div.className = `msg ${isSnippet ? "snippet" : msg.role === "user" ? "user" : "assistant"}`;

    const content = document.createElement("div");
    content.className = "msg-content";
    if (isPending) {
      content.classList.add("pending");
      const dots = document.createElement("span");
      dots.className = "pending-dots";
      dots.innerHTML = "<span></span><span></span><span></span>";
      content.appendChild(dots);
    } else {
      content.textContent = msg.content;
    }
    div.appendChild(content);

    if (!isPending && !isSnippet) {
      const actions = document.createElement("div");
      actions.className = "msg-actions";

      const copyBtn = createIconButton(ICON_COPY, currentDict.copy, async () => {
        await copyToClipboard(msg.content);
      });

      const deleteBtn = createIconButton(ICON_DELETE, currentDict.delete, async () => {
        await deleteMessageAt(i);
      });

      actions.appendChild(copyBtn);
      actions.appendChild(deleteBtn);
      div.appendChild(actions);
    }

    els.messages.appendChild(div);
  }

  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderSnippets() {
  els.snippetList.innerHTML = "";
  for (let i = 0; i < currentContext.session.snippets.length; i += 1) {
    const snippet = currentContext.session.snippets[i];
    const chip = document.createElement("div");
    chip.className = "snippet-chip";

    const text = document.createElement("span");
    text.className = "snippet-text";
    text.title = snippet;
    text.textContent = snippet;

    const removeBtn = document.createElement("button");
    removeBtn.className = "snippet-remove";
    removeBtn.type = "button";
    removeBtn.textContent = "x";
    removeBtn.addEventListener("click", async () => {
      currentContext.session.snippets.splice(i, 1);
      await persistSession();
      renderSnippets();
    });

    chip.appendChild(text);
    chip.appendChild(removeBtn);
    els.snippetList.appendChild(chip);
  }
}

function applyText() {
  els.title.textContent = currentDict.sidepanelTitle;
  els.input.placeholder = currentDict.placeholderInput;
  els.snippetLabel.textContent = currentDict.selectedText;
  els.clearHistoryBtn.innerHTML = ICON_CLEAR;
  els.clearHistoryBtn.title = currentDict.clearHistory;
  els.clearHistoryBtn.setAttribute("aria-label", currentDict.clearHistory);
  els.settingsLink.innerHTML = ICON_SETTINGS;
  els.settingsLink.title = currentDict.settings;
  els.settingsLink.setAttribute("aria-label", currentDict.settings);
  setSendButtonMode(Boolean(currentAbortController));
}

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") {
    root.setAttribute("data-theme", mode);
    return;
  }
  root.removeAttribute("data-theme");
}

function toHistoryMessages(messages) {
  return messages.filter((m) => {
    if (m.role !== "user" && m.role !== "assistant") {
      return false;
    }
    return m.meta !== "pending";
  });
}

function historyToText(messages) {
  if (!messages.length) {
    return "";
  }
  return messages
    .map((m) => {
      if (m.meta === "snippet") {
        return `${currentDict.selectedTextHistoryLabel} ${m.content}`;
      }
      return `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`;
    })
    .join("\n");
}

function snippetsToText(snippets, maxCharsPerSnippet = Number.MAX_SAFE_INTEGER, maxTotalChars = Number.MAX_SAFE_INTEGER) {
  if (!snippets.length) {
    return "";
  }

  const lines = [];
  let total = 0;
  for (let i = 0; i < snippets.length; i += 1) {
    const raw = snippets[i];
    const trimmed = raw.slice(0, maxCharsPerSnippet);
    const line = `[${i + 1}] ${trimmed}`;
    if (total + line.length > maxTotalChars) {
      break;
    }
    lines.push(line);
    total += line.length;
  }
  return lines.join("\n");
}

async function persistSession() {
  if (!currentContext.tabId || !currentContext.pageUrl) {
    return;
  }
  await setSession(currentContext.tabId, currentContext.pageUrl, currentContext.session);
}

async function initContext() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab?.url) {
    return;
  }
  currentContext.tabId = tab.id;
  currentContext.pageUrl = tab.url;
  currentContext.session = await getSession(tab.id, tab.url);
}

function extractAssistantText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item?.text === "string") {
          return item.text;
        }
        return "";
      })
      .filter(Boolean);
    if (textParts.length) {
      return textParts.join("\n");
    }
  }

  const alt = data?.output_text;
  if (typeof alt === "string" && alt.trim()) {
    return alt;
  }

  const choiceText = data?.choices?.[0]?.text;
  if (typeof choiceText === "string" && choiceText.trim()) {
    return choiceText;
  }

  const refusal = data?.choices?.[0]?.message?.refusal;
  if (typeof refusal === "string" && refusal.trim()) {
    return refusal;
  }

  const reasoningContent = data?.choices?.[0]?.message?.reasoning_content;
  if (typeof reasoningContent === "string" && reasoningContent.trim()) {
    return reasoningContent;
  }

  const responsesApiOutput = data?.output?.[0]?.content;
  if (Array.isArray(responsesApiOutput)) {
    const textParts = responsesApiOutput
      .map((item) => {
        if (typeof item?.text === "string") {
          return item.text;
        }
        if (typeof item?.output_text === "string") {
          return item.output_text;
        }
        return "";
      })
      .filter(Boolean);
    if (textParts.length) {
      return textParts.join("\n");
    }
  }

  const geminiLike = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(geminiLike)) {
    const textParts = geminiLike
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean);
    if (textParts.length) {
      return textParts.join("\n");
    }
  }

  return "";
}

function buildRawPreview(data) {
  try {
    return JSON.stringify(data).slice(0, 400);
  } catch {
    return "[unserializable response]";
  }
}

async function callChatCompletions(endpoint, apiKey, body, signal) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API ${res.status}: ${errorText}`);
  }

  return res.json();
}

async function askModel(inputText, historyMessages, selectedSnippets, signal) {
  const settings = await getSettings();
  const endpoint = normalizeApiEndpoint(settings.apiUrl);
  if (!endpoint || !settings.apiKey || !settings.model) {
    throw new Error("Missing API settings");
  }
  const baseMaxTokens = Number(settings.maxTokens) || 1024;
  const historyForPrompt = toHistoryMessages(historyMessages);
  const lang = settings.displayLanguage;
  const promptTemplate = getPromptTemplate(settings, lang);
  const promptText = fillPromptTemplate(
    promptTemplate,
    {
      history: historyToText(historyForPrompt),
      selected_text: snippetsToText(selectedSnippets),
      user_query: inputText
    },
    lang
  );

  const body = {
    model: settings.model,
    temperature: Number(settings.temperature),
    top_p: Number(settings.topP),
    max_tokens: baseMaxTokens,
    messages: [
      {
        role: "user",
        content: promptText
      }
    ]
  };

  const data = await callChatCompletions(endpoint, settings.apiKey, body, signal);
  if (data?.error) {
    const msg = data?.error?.message || JSON.stringify(data.error);
    throw new Error(`API error payload: ${msg}`);
  }

  let text = extractAssistantText(data);
  if (text) {
    return text;
  }

  const finishReason = data?.choices?.[0]?.finish_reason;
  if (finishReason === "length") {
    const conciseHint =
      lang === "en"
        ? "Please keep the answer concise."
        : lang === "zh-Hans"
          ? "请直接给出精简答案。"
          : "請直接給出精簡答案。";
    const retryPromptText = fillPromptTemplate(
      promptTemplate,
      {
        history: historyToText(historyForPrompt.slice(-10)),
        selected_text: snippetsToText(selectedSnippets, 600, 2400),
        user_query: inputText
      },
      lang
    );

    const retryBody = {
      model: settings.model,
      temperature: Number(settings.temperature),
      top_p: Number(settings.topP),
      max_tokens: Math.max(baseMaxTokens, 2048),
      messages: [
        {
          role: "user",
          content: `${retryPromptText}\n\n${conciseHint}`
        }
      ]
    };

    const retryData = await callChatCompletions(endpoint, settings.apiKey, retryBody, signal);
    if (retryData?.error) {
      const msg = retryData?.error?.message || JSON.stringify(retryData.error);
      throw new Error(`API error payload: ${msg}`);
    }
    text = extractAssistantText(retryData);
    if (text) {
      return text;
    }
    const retryPreview = buildRawPreview(retryData);
    throw new Error(
      `Model output hit token limit twice. Please increase Max Tokens in settings (suggest 2048+). Raw preview: ${retryPreview}`
    );
  }

  const preview = buildRawPreview(data);
  throw new Error(`Model returned empty content. Raw preview: ${preview}`);
}

async function onSend() {
  if (currentAbortController || els.sendBtn.dataset.mode === "stop") {
    stopGeneration();
    return;
  }

  const inputText = els.input.value.trim();
  if (!inputText) {
    return;
  }

  const history = [...currentContext.session.messages];
  const submittedSnippets = [...currentContext.session.snippets];
  for (const snippet of submittedSnippets) {
    currentContext.session.messages.push({ role: "user", content: snippet, meta: "snippet" });
  }
  currentContext.session.messages.push({ role: "user", content: inputText });
  currentContext.session.messages.push({ role: "assistant", content: "...", meta: "pending" });
  currentContext.session.snippets = [];
  els.input.value = "";
  await persistSession();
  renderMessages();
  renderSnippets();

  currentAbortController = new AbortController();
  setSendButtonMode(true);
  const pendingIndex = currentContext.session.messages.length - 1;

  try {
    const answer = await askModel(
      inputText,
      history,
      submittedSnippets,
      currentAbortController.signal
    );
    currentContext.session.messages[pendingIndex] = { role: "assistant", content: answer };
    await persistSession();
    renderMessages();
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    currentContext.session.messages[pendingIndex] = {
      role: "assistant",
      content: isAbort ? currentDict.stopped : `${currentDict.errorPrefix}: ${err.message}`
    };
    await persistSession();
    renderMessages();
  } finally {
    currentAbortController = null;
    setSendButtonMode(false);
  }
}

async function clearCurrentPageHistory() {
  currentContext.session = { messages: [], snippets: [] };
  await persistSession();
  renderMessages();
  renderSnippets();
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg?.type !== "SNIPPET_APPENDED") {
    return;
  }
  if (msg.tabId !== currentContext.tabId || msg.pageUrl !== currentContext.pageUrl) {
    return;
  }
  currentContext.session = await getSession(currentContext.tabId, currentContext.pageUrl);
  renderMessages();
  renderSnippets();
});

async function bootstrap() {
  const settings = await getSettings();
  currentDict = getDict(settings.displayLanguage);
  applyTheme(settings.themeMode || "system");
  applyText();

  await initContext();
  renderMessages();
  renderSnippets();

  els.sendBtn.addEventListener("click", onSend);
  els.clearHistoryBtn.addEventListener("click", clearCurrentPageHistory);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  });

  chrome.tabs.onActivated.addListener(async () => {
    const latestSettings = await getSettings();
    currentDict = getDict(latestSettings.displayLanguage);
    applyTheme(latestSettings.themeMode || "system");
    applyText();
    await initContext();
    renderMessages();
    renderSnippets();
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tabId !== currentContext.tabId || !changeInfo.url || !tab.url) {
      return;
    }
    currentContext.pageUrl = tab.url;
    currentContext.session = await getSession(currentContext.tabId, currentContext.pageUrl);
    renderMessages();
    renderSnippets();
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local") {
      return;
    }
    if (changes.displayLanguage || changes.themeMode) {
      const latestSettings = await getSettings();
      currentDict = getDict(latestSettings.displayLanguage);
      applyTheme(latestSettings.themeMode || "system");
      applyText();
      renderMessages();
      renderSnippets();
    }
  });
}

bootstrap();

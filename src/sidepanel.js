import {
  fillPromptTemplate,
  getDict,
  getPromptTemplate,
  getSession,
  getSettings,
  normalizeApiEndpoint,
  sanitizeModelParams,
  setSession
} from "./shared.js";
import {
  ICON_CANCEL_EDIT,
  ICON_CLEAR,
  ICON_COPY,
  ICON_DELETE,
  ICON_EDIT,
  ICON_RESEND,
  ICON_SEND,
  ICON_SETTINGS,
  ICON_STOP
} from "./sidepanel_icons.js";
import {
  SUMMARY_OUTPUT_CHAR_LIMIT,
  SUMMARY_SOURCE_CHAR_LIMIT,
  buildFallbackSummary,
  condensePageText,
  detectSensitiveData,
  historyToText,
  snippetsToText
} from "./sidepanel_text.js";
import {
  buildRawPreview,
  extractAssistantText,
  requestChatCompletionsWithFallback,
  sanitizeErrorDetail
} from "./sidepanel_api.js";
import { createEventHub, SIDEPANEL_EVENTS } from "./sidepanel_events.js";
import { createSidepanelUI } from "./sidepanel_ui.js";

const els = {
  title: document.getElementById("title"),
  clearHistoryBtn: document.getElementById("clear-history-btn"),
  settingsLink: document.getElementById("settings-link"),
  messages: document.getElementById("messages"),
  snippetLabel: document.getElementById("snippet-label"),
  snippetList: document.getElementById("snippet-list"),
  summaryStatus: document.getElementById("summary-status"),
  input: document.getElementById("user-input"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  sendBtn: document.getElementById("send-btn")
};

// Per-active-tab runtime state in side panel UI.
// `session` itself is persisted in chrome.storage.session by page URL hash.
let currentContext = {
  tabId: null,
  pageUrl: "",
  session: { messages: [], snippets: [] }
};

let currentDict = getDict("zh-Hant");
let currentAbortController = null;
let currentSummaryAbortController = null;
let isSummaryInProgress = false;
let editingContext = null;
const eventHub = createEventHub();
const ui = createSidepanelUI({
  els,
  icons: {
    ICON_CANCEL_EDIT,
    ICON_CLEAR,
    ICON_COPY,
    ICON_DELETE,
    ICON_EDIT,
    ICON_RESEND,
    ICON_SEND,
    ICON_SETTINGS,
    ICON_STOP
  },
  onEditMessage: async (index) => {
    await editMessageAt(index);
  },
  onResendMessage: async (index) => {
    await resendMessageAt(index);
  },
  onCopyMessage: async (text, index) => {
    await copyToClipboard(text);
    eventHub.emit(SIDEPANEL_EVENTS.MESSAGE_COPIED, { index });
  },
  onDeleteMessage: async (index) => {
    await deleteMessageAt(index);
  },
  onRemoveSnippet: async (index, snippet) => {
    currentContext.session.snippets.splice(index, 1);
    await persistSession();
    renderSnippets();
    eventHub.emit(SIDEPANEL_EVENTS.SNIPPET_REMOVED, { index, snippet });
  }
});

function exposeEventApi() {
  if (typeof window === "undefined") {
    return;
  }
  window.WebLLMAssistant = window.WebLLMAssistant || {};
  window.WebLLMAssistant.sidepanelEvents = {
    on: eventHub.on,
    off: eventHub.off,
    events: SIDEPANEL_EVENTS
  };
}

/**
 * Checks if any generation is currently in progress.
 * @returns {boolean} True if generating.
 */
function isGenerationInProgress() {
  return Boolean(currentAbortController || (isSummaryInProgress && currentSummaryAbortController));
}

/**
 * Stops the current generation by aborting the active fetch controller.
 */
function stopGeneration() {
  if (isSummaryInProgress && currentSummaryAbortController) {
    currentSummaryAbortController.abort();
    return;
  }
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

function setPendingAssistantStatus(pendingIndex, text) {
  if (pendingIndex < 0) {
    return;
  }
  const pendingMsg = currentContext.session.messages[pendingIndex];
  if (!pendingMsg || pendingMsg.meta !== "pending") {
    return;
  }
  pendingMsg.content = text || "";
  void persistSession();
  renderMessages();
  eventHub.emit(SIDEPANEL_EVENTS.SUMMARY_STATE, {
    phase: "pending_status",
    text: pendingMsg.content
  });
}

/**
 * Ensures a pending assistant message exists at the specified index or creates one.
 * @param {number} index - The target index in the messages array.
 * @returns {Object} The pending assistant message.
 */
function ensurePendingAssistantMessage(index) {
  if (index >= 0 && currentContext.session.messages[index]?.meta === "pending") {
    return index;
  }

  const safeIndex = Math.min(
    Math.max(index, 0),
    currentContext.session.messages.length
  );
  currentContext.session.messages.splice(safeIndex, 0, {
    role: "assistant",
    content: "",
    meta: "pending"
  });
  return safeIndex;
}

function showSummaryStatus(message, options = {}) {
  const { type = "info", animated = false } = options;
  if (!els.summaryStatus) {
    return;
  }

  els.summaryStatus.className = `summary-status active ${type}`;
  els.summaryStatus.innerHTML = "";

  const text = document.createElement("span");
  text.textContent = message;
  els.summaryStatus.appendChild(text);

  if (animated) {
    const dots = document.createElement("span");
    dots.className = "pending-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";
    els.summaryStatus.appendChild(dots);
  }
}

function clearSummaryStatus() {
  if (!els.summaryStatus) {
    return;
  }
  els.summaryStatus.className = "summary-status";
  els.summaryStatus.innerHTML = "";
}

function getSummaryFailureReason(err) {
  if (!err) {
    return currentDict.summaryFailedUnknown || "Unknown reason";
  }
  if (err.name === "AbortError") {
    return currentDict.stopped || "Stopped";
  }
  const msg = String(err.message || err || "").trim();
  return msg || currentDict.summaryFailedUnknown || "Unknown reason";
}

/**
 * Appends a notice-level message from the assistant to the chat.
 * @param {string} text - The notice text.
 * @returns {Promise<void>}
 */
async function appendAssistantNotice(text) {
  if (!text) {
    return;
  }
  currentContext.session.messages.push({ role: "assistant", content: text });
  await persistSession();
  renderMessages();
  eventHub.emit(SIDEPANEL_EVENTS.MESSAGE_UPDATED, {
    reason: "assistant_notice"
  });
}

function mapSummaryFailureReason(reasonCode) {
  const reasonMap = {
    no_active_tab: "No active tab",
    page_extract_failed: "Failed to extract page text",
    empty_page_content: "Page text is empty",
    missing_api_settings: "Missing API URL / key / model",
    summary_empty: "Model returned empty summary",
    heuristic_fallback: "Used local fallback summary"
  };
  return reasonMap[reasonCode] || currentDict.summaryFailedUnknown || "Unknown reason";
}

/**
 * Copies the provided text to the system clipboard.
 * @param {string} text - The text to copy.
 * @returns {Promise<void>}
 */
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
  eventHub.emit(SIDEPANEL_EVENTS.MESSAGE_DELETED, { index });
}

function getAttachedSnippetsBefore(index) {
  const snippets = [];
  let i = index - 1;
  while (i >= 0 && currentContext.session.messages[i]?.meta === "snippet") {
    snippets.unshift(currentContext.session.messages[i].content);
    i -= 1;
  }
  return snippets;
}

function getConversationStartIndex(index) {
  let i = index;
  while (i > 0 && currentContext.session.messages[i - 1]?.meta === "snippet") {
    i -= 1;
  }
  return i;
}

function getAttachedSnippetRange(index) {
  let start = index;
  while (start > 0 && currentContext.session.messages[start - 1]?.meta === "snippet") {
    start -= 1;
  }
  return {
    start,
    end: index - 1
  };
}

function findAssistantReplyIndex(userIndex) {
  for (let i = userIndex + 1; i < currentContext.session.messages.length; i += 1) {
    const msg = currentContext.session.messages[i];
    if (msg?.meta === "snippet") {
      continue;
    }
    if (msg?.meta === "summary-status") {
      continue;
    }
    if (msg?.role === "assistant") {
      return i;
    }
    if (msg?.role === "user") {
      break;
    }
  }
  return -1;
}

async function removeSummaryStatusAfterUser(userIndex) {
  const nextIndex = userIndex + 1;
  const nextMsg = currentContext.session.messages[nextIndex];
  if (nextMsg?.role === "assistant" && nextMsg?.meta === "summary-status") {
    currentContext.session.messages.splice(nextIndex, 1);
    await persistSession();
    renderMessages();
  }
}

/**
 * Injects a content script to extract readable text from the current page for summarization.
 * @returns {Promise<string>} The extracted text.
 */
async function extractPageSourceForSummary() {
  if (!currentContext.tabId) {
    return { ok: false, reason: "no_active_tab", title: "", text: "" };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentContext.tabId },
      func: () => {
        const pickMainNode = () => {
          const selectors = [
            "article",
            "main",
            "[role='main']",
            ".content",
            "#content"
          ];

          let best = null;
          let bestLen = 0;
          for (const selector of selectors) {
            const nodes = document.querySelectorAll(selector);
            for (const node of nodes) {
              const text = (node.innerText || "").trim();
              if (text.length > bestLen) {
                best = node;
                bestLen = text.length;
              }
            }
          }
          return best || document.body;
        };

        const root = pickMainNode();
        const text = (root?.innerText || "")
          .replace(/\u00a0/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\n{2,}/g, "\n")
          .trim();

        return {
          title: document.title || "",
          text: text.slice(0, 18000)
        };
      }
    });

    const result = results?.[0]?.result || { title: "", text: "" };
    return {
      ok: true,
      reason: "",
      title: result.title || "",
      text: result.text || ""
    };
  } catch {
    return { ok: false, reason: "page_extract_failed", title: "", text: "" };
  }
}

/**
 * Calls the API to generate a summary for the provided page content.
 * @param {string} pageTitle - The title of the page.
 * @param {string} condensedText - The condensed page text.
 * @param {AbortSignal} signal - An abort signal for the request.
 * @returns {Promise<string>} The generated summary.
 */
async function generatePageSummary(pageTitle, condensedText, signal) {
  // Summary request is intentionally low-temperature to maximize factual density.
  const settings = await getSettings();
  const endpoint = normalizeApiEndpoint(settings.apiUrl);
  if (!endpoint || !settings.apiKey || !settings.model || !condensedText) {
    return {
      ok: false,
      reason: !condensedText ? "empty_page_content" : "missing_api_settings",
      summary: ""
    };
  }

  const body = {
    model: settings.model,
    temperature: 0.2,
    top_p: 1,
    max_tokens: 220,
    messages: [
      {
        role: "system",
        content:
          "You create compact factual webpage summaries for retrieval. Keep it precise and short."
      },
      {
        role: "user",
        content: [
          "Summarize the webpage below for future question answering.",
          "Output requirements:",
          "- Use 4-6 bullet points.",
          "- Include topic, key claims/facts, and important entities or numbers.",
          "- No filler and no repetition.",
          "- Total output under 520 characters if possible.",
          "",
          `Page title: ${pageTitle || "(none)"}`,
          "",
          "Page text:",
          condensedText
        ].join("\n")
      }
    ]
  };

  const data = await requestChatCompletionsWithFallback(
    endpoint,
    settings.apiKey,
    body,
    signal,
    () => {}
  );
  const summary = extractAssistantText(data).trim();
  if (!summary) {
    const fallback = buildFallbackSummary(condensedText);
    if (fallback) {
      return { ok: true, reason: "heuristic_fallback", summary: fallback };
    }
    return { ok: false, reason: "summary_empty", summary: "" };
  }
  return {
    ok: true,
    reason: "",
    summary: summary.slice(0, SUMMARY_OUTPUT_CHAR_LIMIT)
  };
}

async function ensurePageSummary(signal) {
  const existing = currentContext.session?.pageSummary;
  if (typeof existing === "string" && existing.trim()) {
    return { ok: true, reason: "", summary: existing.trim() };
  }

  const source = await extractPageSourceForSummary();
  if (!source.ok) {
    return { ok: false, reason: source.reason || "page_extract_failed", summary: "" };
  }

  const condensed = condensePageText(source.text || "", SUMMARY_SOURCE_CHAR_LIMIT);
  if (!condensed) {
    return { ok: false, reason: "empty_page_content", summary: "" };
  }

  const summaryResult = await generatePageSummary(
    source.title || "",
    condensed,
    signal
  );
  if (!summaryResult.ok || !summaryResult.summary) {
    return {
      ok: false,
      reason: summaryResult.reason || "summary_empty",
      summary: ""
    };
  }
  currentContext.session.pageSummary = summaryResult.summary;
  await persistSession();
  return { ok: true, reason: "", summary: summaryResult.summary };
}

async function submitMessageWithContext(inputText, submittedSnippets, options = {}) {
  const {
    historyMessages = [...currentContext.session.messages],
    userIndex = -1,
    assistantIndex = -1
  } = options;

  let pendingIndex = assistantIndex;

  if (userIndex >= 0) {
    let adjustedUserIndex = userIndex;
    let adjustedAssistantIndex = assistantIndex;

    // Normalize snippet attachment for this user message:
    // 1) remove all currently attached snippet rows immediately before the user message,
    // 2) insert exactly the new submitted snippets once.
    let existingSnippetStart = adjustedUserIndex;
    while (
      existingSnippetStart > 0 &&
      currentContext.session.messages[existingSnippetStart - 1]?.meta === "snippet"
    ) {
      existingSnippetStart -= 1;
    }
    const existingSnippetEnd = adjustedUserIndex - 1;
    if (existingSnippetEnd >= existingSnippetStart) {
      const removedCount = existingSnippetEnd - existingSnippetStart + 1;
      currentContext.session.messages.splice(existingSnippetStart, removedCount);
      adjustedUserIndex -= removedCount;
      if (adjustedAssistantIndex >= 0) {
        adjustedAssistantIndex -= removedCount;
      }
    }

    if (submittedSnippets.length) {
      const replacement = submittedSnippets.map((snippet) => ({
        role: "user",
        content: snippet,
        meta: "snippet"
      }));
      currentContext.session.messages.splice(adjustedUserIndex, 0, ...replacement);
      adjustedUserIndex += replacement.length;
      if (adjustedAssistantIndex >= 0) {
        adjustedAssistantIndex += replacement.length;
      }
    }

    currentContext.session.messages[adjustedUserIndex].content = inputText;

    if (adjustedAssistantIndex >= 0) {
      currentContext.session.messages[adjustedAssistantIndex] = {
        role: "assistant",
        content: "",
        meta: "pending"
      };
      pendingIndex = adjustedAssistantIndex;
    } else {
      pendingIndex = adjustedUserIndex + 1;
      currentContext.session.messages.splice(pendingIndex, 0, {
        role: "assistant",
        content: "",
        meta: "pending"
      });
    }
  } else {
    for (const snippet of submittedSnippets) {
      currentContext.session.messages.push({ role: "user", content: snippet, meta: "snippet" });
    }
    currentContext.session.messages.push({ role: "user", content: inputText });
    currentContext.session.messages.push({ role: "assistant", content: "", meta: "pending" });
    pendingIndex = currentContext.session.messages.length - 1;
  }

  currentContext.session.snippets = [];
  els.input.value = "";
  editingContext = null;
  setEditingMode(false);
  await persistSession();
  renderMessages();
  renderSnippets();
  setSendButtonMode(true);
  eventHub.emit(SIDEPANEL_EVENTS.MESSAGE_SENT, {
    textLength: inputText.length,
    snippetCount: submittedSnippets.length,
    isEdit: userIndex >= 0
  });

  const runtimeSettings = await getSettings();
  const isPageSummaryEnabled = Boolean(runtimeSettings.enablePageSummary);
  let pageSummary = isPageSummaryEnabled ? currentContext.session?.pageSummary || "" : "";
  let summaryFailureReasonCode = "";
  let summaryAttempted = false;

  // Step 3: show summary progress inside assistant pending bubble.
  if (isPageSummaryEnabled && !pageSummary) {
    summaryAttempted = true;
    isSummaryInProgress = true;
    currentSummaryAbortController = new AbortController();
    setPendingAssistantStatus(
      pendingIndex,
      currentDict.summaryPreparing || "Trying a quick page summary"
    );

    try {
      const summaryResult = await ensurePageSummary(currentSummaryAbortController.signal);
      pageSummary = summaryResult.summary || "";
      summaryFailureReasonCode = summaryResult.reason || "";

      if (summaryResult.ok && pageSummary) {
        setPendingAssistantStatus(pendingIndex, currentDict.summarySuccess || "Page summary ready");
      } else {
        const reason = mapSummaryFailureReason(summaryFailureReasonCode);
        setPendingAssistantStatus(
          pendingIndex,
          `${currentDict.summaryFailedPrefix || "Summary failed"}: ${reason}`
        );
        console.warn(
          `[summary] skipped/failed: ${summaryFailureReasonCode || "unknown"}`
        );
      }
    } catch (err) {
      const reason = getSummaryFailureReason(err);
      setPendingAssistantStatus(
        pendingIndex,
        `${currentDict.summaryFailedPrefix || "Summary failed"}: ${reason}`
      );
      console.warn(
        `[summary] exception: ${sanitizeErrorDetail(String(err?.message || err))}`
      );
      pageSummary = "";
    } finally {
      isSummaryInProgress = false;
      currentSummaryAbortController = null;
    }
  }

  // When summary step is shown, keep it as one assistant message,
  // then open a new pending line for the actual answer.
  if (summaryAttempted) {
    const summaryMsg = currentContext.session.messages[pendingIndex];
    const summaryText = (summaryMsg?.content || "").trim();
    currentContext.session.messages[pendingIndex] = {
      role: "assistant",
      content: summaryText || `${currentDict.summaryFailedPrefix || "Summary failed"}: ${currentDict.summaryFailedUnknown || "Unknown reason"}`,
      meta: "summary-status"
    };

    pendingIndex += 1;
    currentContext.session.messages.splice(pendingIndex, 0, {
      role: "assistant",
      content: "",
      meta: "pending"
    });

    await persistSession();
    renderMessages();
  }

  pendingIndex = ensurePendingAssistantMessage(pendingIndex);

  currentAbortController = new AbortController();
  eventHub.emit(SIDEPANEL_EVENTS.GENERATION_STATE, { state: "started" });

  try {
    const answer = await askModel(
      inputText,
      historyMessages,
      submittedSnippets,
      pageSummary,
      currentAbortController.signal,
      (partialText) => {
        const pendingMsg = currentContext.session.messages[pendingIndex];
        if (!pendingMsg || pendingMsg.meta !== "pending") {
          return;
        }
        pendingMsg.content = partialText;
        renderMessages();
      }
    );
    currentContext.session.messages[pendingIndex] = { role: "assistant", content: answer };
    await persistSession();
    renderMessages();
    eventHub.emit(SIDEPANEL_EVENTS.MESSAGE_UPDATED, {
      reason: "assistant_answer",
      length: answer.length
    });
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    currentContext.session.messages[pendingIndex] = {
      role: "assistant",
      content: isAbort ? currentDict.stopped : `${currentDict.errorPrefix}: ${err.message}`
    };
    await persistSession();
    renderMessages();
    eventHub.emit(SIDEPANEL_EVENTS.MESSAGE_UPDATED, {
      reason: "assistant_error",
      error: String(err?.message || err || "")
    });
  } finally {
    currentAbortController = null;
    setSendButtonMode(false);
    clearSummaryStatus();
    eventHub.emit(SIDEPANEL_EVENTS.GENERATION_STATE, { state: "finished" });
  }
}

async function resendMessageAt(index) {
  if (currentAbortController || els.sendBtn.dataset.mode === "stop") {
    return;
  }
  const target = currentContext.session.messages[index];
  if (!target || target.role !== "user" || target.meta === "snippet") {
    return;
  }

  await removeSummaryStatusAfterUser(index);

  const submittedSnippets = getAttachedSnippetsBefore(index);
  const conversationStart = getConversationStartIndex(index);
  const historyMessages = currentContext.session.messages.slice(0, conversationStart);
  const assistantIndex = findAssistantReplyIndex(index);
  await submitMessageWithContext(target.content, submittedSnippets, {
    historyMessages,
    userIndex: index,
    assistantIndex,
    ...getAttachedSnippetRange(index)
  });
}

async function editMessageAt(index) {
  if (currentAbortController || els.sendBtn.dataset.mode === "stop") {
    return;
  }
  const target = currentContext.session.messages[index];
  if (!target || target.role !== "user" || target.meta === "snippet") {
    return;
  }

  await removeSummaryStatusAfterUser(index);

  const conversationStart = getConversationStartIndex(index);
  editingContext = {
    userIndex: index,
    assistantIndex: findAssistantReplyIndex(index),
    historyMessages: currentContext.session.messages.slice(0, conversationStart),
    ...getAttachedSnippetRange(index)
  };
  // Do not auto-carry old snippets when editing a sent message.
  currentContext.session.snippets = [];
  els.input.value = target.content;
  await persistSession();
  renderSnippets();
  setEditingMode(true);
  els.input.focus();
}

function setSendButtonMode(isGenerating) {
  ui.setSendButtonMode(currentDict, isGenerating);
}

function setEditingMode(isEditing) {
  ui.setEditingMode(isEditing);
}

async function cancelEditing() {
  editingContext = null;
  currentContext.session.snippets = [];
  els.input.value = "";
  await persistSession();
  renderSnippets();
  setEditingMode(false);
}

function renderMessages() {
  ui.renderMessages(currentContext.session, currentDict, isGenerationInProgress());
}

function renderSnippets() {
  ui.renderSnippets(currentContext.session);
}

function applyText() {
  ui.applyText(currentDict, isGenerationInProgress());
}

function applyTheme(mode) {
  ui.applyTheme(mode);
}

function toHistoryMessages(messages) {
  return messages.filter((m) => {
    if (m.role !== "user" && m.role !== "assistant") {
      return false;
    }
    return m.meta !== "pending";
  });
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

/**
 * Master function to call the language model API with full context and history.
 * @param {string} inputText - The user's input question.
 * @param {Object[]} historyMessages - The selected conversation history.
 * @param {Object[]} selectedSnippets - The highlighted snippets included.
 * @param {string} pageSummary - The extracted page summary context, if any.
 * @param {AbortSignal} signal - The abort signal for cancellation.
 * @param {Function} onDelta - Callback for streaming text chunks.
 * @returns {Promise<string>} The full response string.
 */
async function askModel(inputText, historyMessages, selectedSnippets, pageSummary, signal, onDelta) {
  const settings = await getSettings();
  const safeParams = sanitizeModelParams(settings);
  const endpoint = normalizeApiEndpoint(settings.apiUrl);
  if (!endpoint || !settings.apiKey || !settings.model) {
    throw new Error("Missing API settings");
  }
  const baseMaxTokens = safeParams.maxTokens;
  const historyForPrompt = toHistoryMessages(historyMessages);
  const lang = settings.displayLanguage;
  const promptTemplate = getPromptTemplate(settings, lang);
  const promptText = fillPromptTemplate(
    promptTemplate,
    {
      history: historyToText(historyForPrompt, currentDict.selectedTextHistoryLabel),
      selected_text: snippetsToText(selectedSnippets),
      page_summary: pageSummary || "",
      user_query: inputText
    },
    lang
  );

  const body = {
    model: settings.model,
    temperature: safeParams.temperature,
    top_p: safeParams.topP,
    max_tokens: baseMaxTokens,
    messages: [
      {
        role: "user",
        content: promptText
      }
    ]
  };

  const data = await requestChatCompletionsWithFallback(
    endpoint,
    settings.apiKey,
    body,
    signal,
    onDelta
  );
  if (data?.error) {
    const msg = sanitizeErrorDetail(data?.error?.message || JSON.stringify(data.error));
    throw new Error(`API error payload: ${msg}`);
  }

  let text = extractAssistantText(data);
  if (text) {
    return text;
  }

  // If provider truncated output, retry once with shorter context and higher cap.
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
        history: historyToText(
          historyForPrompt.slice(-10),
          currentDict.selectedTextHistoryLabel
        ),
        selected_text: snippetsToText(selectedSnippets, 600, 2400),
        page_summary: pageSummary || "",
        user_query: inputText
      },
      lang
    );

    const retryBody = {
      model: settings.model,
      temperature: safeParams.temperature,
      top_p: safeParams.topP,
      max_tokens: Math.max(baseMaxTokens, 2048),
      messages: [
        {
          role: "user",
          content: `${retryPromptText}\n\n${conciseHint}`
        }
      ]
    };

    const retryData = await requestChatCompletionsWithFallback(
      endpoint,
      settings.apiKey,
      retryBody,
      signal,
      onDelta
    );
    if (retryData?.error) {
      const msg = sanitizeErrorDetail(
        retryData?.error?.message || JSON.stringify(retryData.error)
      );
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

/**
 * Handles the default send action from the UI, pulling text from the input.
 * @returns {Promise<void>}
 */
async function onSend() {
  if (currentAbortController || els.sendBtn.dataset.mode === "stop") {
    stopGeneration();
    return;
  }

  const inputText = els.input.value.trim();
  if (!inputText) {
    return;
  }

  const runtimeSettings = await getSettings();
  if (!runtimeSettings.legalConsentAccepted) {
    await appendAssistantNotice(
      currentDict.consentNotAcceptedMessage ||
        "Please open Settings and accept the compliance notice before sending messages."
    );
    eventHub.emit(SIDEPANEL_EVENTS.CONSENT_BLOCKED, {});
    return;
  }

  const submittedSnippets = [...currentContext.session.snippets];
  if (runtimeSettings.sensitiveDataReminderEnabled !== false) {
    const sensitiveSource = `${inputText}\n${submittedSnippets.join("\n")}`;
    if (detectSensitiveData(sensitiveSource)) {
      eventHub.emit(SIDEPANEL_EVENTS.SENSITIVE_WARNING, {
        state: "detected"
      });
      const confirmed = window.confirm(
        currentDict.sensitiveReminderConfirm ||
          "Potential sensitive data detected. Continue sending to your configured API provider?"
      );
      if (!confirmed) {
        eventHub.emit(SIDEPANEL_EVENTS.SENSITIVE_WARNING, {
          state: "cancelled"
        });
        return;
      }
      eventHub.emit(SIDEPANEL_EVENTS.SENSITIVE_WARNING, {
        state: "confirmed"
      });
    }
  }

  await submitMessageWithContext(inputText, submittedSnippets, editingContext || {});
}

async function clearCurrentPageHistory() {
  const preservedSummary = currentContext.session?.pageSummary;
  currentContext.session = {
    messages: [],
    snippets: [],
    ...(preservedSummary ? { pageSummary: preservedSummary } : {})
  };
  editingContext = null;
  els.input.value = "";
  setEditingMode(false);
  await persistSession();
  renderMessages();
  renderSnippets();
  eventHub.emit(SIDEPANEL_EVENTS.HISTORY_CLEARED, {});
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg?.type !== "SNIPPET_APPENDED") {
    return;
  }
  if (msg.tabId !== currentContext.tabId) {
    return;
  }
  currentContext.session = await getSession(currentContext.tabId, currentContext.pageUrl);
  renderMessages();
  renderSnippets();
  eventHub.emit(SIDEPANEL_EVENTS.CONTEXT_SYNCED, { source: "runtime_message" });
});

/**
 * Initializes the sidepanel state, restoring session data and handling configurations.
 * @returns {Promise<void>}
 */
async function bootstrap() {
  exposeEventApi();
  const settings = await getSettings();
  currentDict = getDict(settings.displayLanguage);
  applyTheme(settings.themeMode || "system");
  applyText();

  await initContext();
  renderMessages();
  renderSnippets();
  eventHub.emit(SIDEPANEL_EVENTS.CONTEXT_SYNCED, { source: "bootstrap" });

  els.sendBtn.addEventListener("click", onSend);
  els.cancelEditBtn.addEventListener("click", cancelEditing);
  els.clearHistoryBtn.addEventListener("click", clearCurrentPageHistory);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && editingContext) {
      e.preventDefault();
      cancelEditing();
      return;
    }
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
    eventHub.emit(SIDEPANEL_EVENTS.CONTEXT_SYNCED, { source: "tab_activated" });
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tabId !== currentContext.tabId || !changeInfo.url || !tab.url) {
      return;
    }
    currentContext.pageUrl = tab.url;
    currentContext.session = await getSession(currentContext.tabId, currentContext.pageUrl);
    renderMessages();
    renderSnippets();
    eventHub.emit(SIDEPANEL_EVENTS.CONTEXT_SYNCED, { source: "tab_updated" });
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
      eventHub.emit(SIDEPANEL_EVENTS.CONTEXT_SYNCED, { source: "settings_changed" });
    }
  });
}

bootstrap();

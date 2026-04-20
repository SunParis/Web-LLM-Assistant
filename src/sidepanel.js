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
  summaryStatus: document.getElementById("summary-status"),
  input: document.getElementById("user-input"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  sendBtn: document.getElementById("send-btn")
};

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
const ICON_SEND =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 20.25V14.5L10.5 12L3 9.5V3.75L21 12L3 20.25Z"/></svg>';
const ICON_EDIT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25Zm18-11.5a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75L21 5.75Z"/></svg>';
const ICON_RESEND =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7 6l5 4V7c3.31 0 6 2.69 6 6a6 6 0 0 1-10.24 4.24l-1.42 1.42A8 8 0 0 0 20 13c0-4.42-3.58-8-8-8Z"/><path fill="currentColor" d="M6 13a6 6 0 0 1 10.24-4.24l1.42-1.42A8 8 0 0 0 4 13a7.96 7.96 0 0 0 2.34 5.66L7.76 17.24A5.96 5.96 0 0 1 6 13Z"/></svg>';
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
const ICON_CANCEL_EDIT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.29 1.41 1.42 6.3-6.3 6.29 6.3 1.42-1.42-6.3-6.29 6.3-6.3z"/></svg>';
const SUMMARY_SOURCE_CHAR_LIMIT = 4200;
const SUMMARY_OUTPUT_CHAR_LIMIT = 520;

function isPendingMessage(msg) {
  return msg?.meta === "pending";
}

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
  renderMessages();
}

function buildFallbackSummary(condensedText, maxChars = SUMMARY_OUTPUT_CHAR_LIMIT) {
  const sentences = (condensedText || "")
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!sentences.length) {
    return "";
  }

  const lines = [];
  let total = 0;
  for (let i = 0; i < sentences.length && lines.length < 5; i += 1) {
    const sentence = sentences[i].slice(0, 130);
    const line = `- ${sentence}`;
    if (total + line.length + 1 > maxChars) {
      break;
    }
    lines.push(line);
    total += line.length + 1;
  }

  return lines.join("\n");
}

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

function detectSensitiveData(text) {
  const value = String(text || "");
  if (!value.trim()) {
    return false;
  }

  const patterns = [
    /\b\d{13,19}\b/, // possible card-like long numbers
    /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/, // possible US SSN-like pattern
    /\b[A-Z][12]\d{8}\b/i, // possible TW ID pattern
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}\b/, // email
    /\b(password|passwd|api[_-]?key|secret|token|private key|信用卡|卡號|身份证|身分證|密碼)\b/i
  ];
  return patterns.some((p) => p.test(value));
}

async function appendAssistantNotice(text) {
  if (!text) {
    return;
  }
  currentContext.session.messages.push({ role: "assistant", content: text });
  await persistSession();
  renderMessages();
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

function condensePageText(rawText, maxChars = SUMMARY_SOURCE_CHAR_LIMIT) {
  const normalized = (rawText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }

  const sentences = normalized.split(/(?<=[.!?。！？])\s+/).map((s) => s.trim());
  const selected = [];
  const seen = new Set();
  let total = 0;

  for (const sentence of sentences) {
    if (!sentence || sentence.length < 20) {
      continue;
    }
    const key = sentence.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const capped = sentence.slice(0, 220);
    if (total + capped.length + 1 > maxChars) {
      break;
    }
    selected.push(capped);
    total += capped.length + 1;
  }

  if (!selected.length) {
    return normalized.slice(0, maxChars);
  }
  return selected.join("\n");
}

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

async function generatePageSummary(pageTitle, pageUrl, condensedText, signal) {
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
          `Page URL: ${pageUrl || "(none)"}`,
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
    currentContext.pageUrl || "",
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
    assistantIndex = -1,
    snippetStartIndex = -1,
    snippetEndIndex = -1
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
        console.warn(`[summary] skipped/failed ${JSON.stringify({
          reasonCode: summaryFailureReasonCode,
          tabId: currentContext.tabId,
          pageUrl: currentContext.pageUrl
        })}`);
      }
    } catch (err) {
      const reason = getSummaryFailureReason(err);
      setPendingAssistantStatus(
        pendingIndex,
        `${currentDict.summaryFailedPrefix || "Summary failed"}: ${reason}`
      );
      console.warn(`[summary] exception ${JSON.stringify({
        error: String(err?.message || err),
        tabId: currentContext.tabId,
        pageUrl: currentContext.pageUrl
      })}`);
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
    clearSummaryStatus();
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

function setEditingMode(isEditing) {
  document.body.classList.toggle("editing", isEditing);
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
    if (!msg || typeof msg !== "object") {
      continue;
    }
    const div = document.createElement("div");
    const isSnippet = msg?.meta === "snippet";
    const isPending = isPendingMessage(msg);
    div.className = `msg ${isSnippet ? "snippet" : msg.role === "user" ? "user" : "assistant"}`;

    const content = document.createElement("div");
    content.className = "msg-content";
    if (isPending) {
      content.classList.add("pending");
      if (msg.content) {
        const text = document.createElement("span");
        text.className = "pending-text";
        text.textContent = msg.content;
        content.appendChild(text);
      }
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

      if (msg.role === "user") {
        const editBtn = createIconButton(ICON_EDIT, currentDict.edit, async () => {
          await editMessageAt(i);
        });
        const resendBtn = createIconButton(ICON_RESEND, currentDict.resend, async () => {
          await resendMessageAt(i);
        });
        actions.appendChild(editBtn);
        actions.appendChild(resendBtn);
      }

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
  const cancelEditLabel = currentDict.cancelEdit || "Cancel edit";
  const cancelEditLabelWithShortcut = `${cancelEditLabel} (Esc)`;
  els.cancelEditBtn.innerHTML = `${ICON_CANCEL_EDIT}`;
  els.cancelEditBtn.title = cancelEditLabelWithShortcut;
  els.cancelEditBtn.setAttribute("aria-label", cancelEditLabelWithShortcut);
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

function extractStreamDelta(data) {
  const delta = data?.choices?.[0]?.delta;
  if (typeof delta?.content === "string") {
    return delta.content;
  }

  if (Array.isArray(delta?.content)) {
    return delta.content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item?.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("");
  }

  if (typeof delta?.reasoning_content === "string") {
    return delta.reasoning_content;
  }

  const text = data?.choices?.[0]?.text;
  if (typeof text === "string") {
    return text;
  }

  return "";
}

async function streamChatCompletions(endpoint, apiKey, body, signal, onDelta) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API ${res.status}: ${errorText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !res.body) {
    return res.json();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamedText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const lines = event
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"));

      for (const line of lines) {
        const dataText = line.slice(5).trim();
        if (!dataText || dataText === "[DONE]") {
          continue;
        }

        let data;
        try {
          data = JSON.parse(dataText);
        } catch {
          continue;
        }

        if (data?.error) {
          const msg = data?.error?.message || JSON.stringify(data.error);
          throw new Error(`API error payload: ${msg}`);
        }

        const chunk = extractStreamDelta(data);
        if (chunk) {
          streamedText += chunk;
          onDelta(streamedText);
        }
      }
    }
  }

  return {
    choices: [
      {
        message: {
          content: streamedText
        }
      }
    ]
  };
}

async function requestChatCompletionsWithFallback(endpoint, apiKey, body, signal, onDelta) {
  const streamed = await streamChatCompletions(endpoint, apiKey, body, signal, onDelta);
  const streamedText = extractAssistantText(streamed);
  if (streamedText) {
    return streamed;
  }

  // Some OpenAI-compatible providers accept stream=true but end with an empty payload.
  return callChatCompletions(endpoint, apiKey, body, signal);
}

async function askModel(inputText, historyMessages, selectedSnippets, pageSummary, signal, onDelta) {
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
      page_summary: pageSummary || "",
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

  const data = await requestChatCompletionsWithFallback(
    endpoint,
    settings.apiKey,
    body,
    signal,
    onDelta
  );
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
        page_summary: pageSummary || "",
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

    const retryData = await requestChatCompletionsWithFallback(
      endpoint,
      settings.apiKey,
      retryBody,
      signal,
      onDelta
    );
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

  const runtimeSettings = await getSettings();
  if (!runtimeSettings.legalConsentAccepted) {
    await appendAssistantNotice(
      currentDict.consentNotAcceptedMessage ||
        "Please open Settings and accept the compliance notice before sending messages."
    );
    return;
  }

  const submittedSnippets = [...currentContext.session.snippets];
  if (runtimeSettings.sensitiveDataReminderEnabled !== false) {
    const sensitiveSource = `${inputText}\n${submittedSnippets.join("\n")}`;
    if (detectSensitiveData(sensitiveSource)) {
      const confirmed = window.confirm(
        currentDict.sensitiveReminderConfirm ||
          "Potential sensitive data detected. Continue sending to your configured API provider?"
      );
      if (!confirmed) {
        return;
      }
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

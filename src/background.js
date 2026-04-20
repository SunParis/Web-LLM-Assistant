import {
  DEFAULT_SETTINGS,
  appendSnippet,
  clearTabSessions,
  getSettings,
  getDict
} from "./shared.js";

const CONTEXT_MENU_ID = "ask-ai-about-selection";
let hasActionClickFallbackListener = false;

function isUserGestureRestrictionError(err) {
  const message = String(err?.message || err || "").toLowerCase();
  return (
    message.includes("sidepanel.open()") &&
    (message.includes("user gesture") || message.includes("user activation"))
  );
}

async function openSidePanelSafely(tabId, source) {
  try {
    await chrome.sidePanel.open({ tabId });
    return true;
  } catch (err) {
    const message = String(err?.message || err || "");
    if (isUserGestureRestrictionError(err)) {
      console.warn(
        `[Web LLM Assistant] Skip side panel open from ${source}: ${message}`
      );
      return false;
    }
    console.error(`[Web LLM Assistant] side panel open failed from ${source}:`, err);
    return false;
  }
}

function removeContextMenu(menuId) {
  return new Promise((resolve) => {
    chrome.contextMenus.remove(menuId, () => {
      // Consume runtime.lastError to avoid "Unchecked runtime.lastError".
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function createContextMenu(title) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title,
        contexts: ["selection"]
      },
      () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          if (msg.includes("duplicate id")) {
            resolve();
            return;
          }
          reject(new Error(msg));
          return;
        }
        resolve();
      }
    );
  });
}

async function ensureContextMenu() {
  const { displayLanguage } = await getSettings();
  const dict = getDict(displayLanguage);
  await removeContextMenu(CONTEXT_MENU_ID);
  await createContextMenu(dict.askAiMenu);
}

async function setupActionOpenSidePanel() {
  const { enableSidePanelShortcut } = await getSettings();

  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: Boolean(enableSidePanelShortcut)
      });
    } catch {
      // Fallback below.
    }
  }

  if (!hasActionClickFallbackListener) {
    chrome.action.onClicked.addListener(async (tab) => {
      try {
        if (!tab?.id) {
          return;
        }

        // When native action behavior is enabled, browser handles opening.
        const settings = await getSettings();
        if (settings.enableSidePanelShortcut) {
          return;
        }

        await openSidePanelSafely(tab.id, "action_click");
      } catch (err) {
        console.error("[Web LLM Assistant] action click failed:", err);
      }
    });
    hasActionClickFallbackListener = true;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(null);
  const merged = {
    ...DEFAULT_SETTINGS,
    ...existing,
    promptByLanguage: {
      ...DEFAULT_SETTINGS.promptByLanguage,
      ...(existing.promptByLanguage || {})
    }
  };
  await chrome.storage.local.set(merged);
  await setupActionOpenSidePanel();
  await ensureContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupActionOpenSidePanel();
  await ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id || !tab?.url) {
    return;
  }

  const text = (info.selectionText || "").trim();
  if (!text) {
    return;
  }

  // Must run immediately in the user-gesture call stack.
  const openPanelPromise = openSidePanelSafely(tab.id, "context_menu");

  await appendSnippet(tab.id, tab.url, text);

  await openPanelPromise;

  try {
    await chrome.runtime.sendMessage({
      type: "SNIPPET_APPENDED",
      tabId: tab.id,
      pageUrl: tab.url,
      snippet: text
    });
  } catch (err) {
    if (!String(err?.message || "").includes("Receiving end does not exist")) {
      throw err;
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await clearTabSessions(tabId);
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (
    area !== "local" ||
    (!changes.displayLanguage && !changes.enableSidePanelShortcut)
  ) {
    return;
  }

  try {
    if (changes.displayLanguage) {
      await ensureContextMenu();
    }
    if (changes.enableSidePanelShortcut) {
      await setupActionOpenSidePanel();
    }
  } catch {
    // Avoid uncaught errors from timing races during setting updates.
  }
});

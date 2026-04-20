import {
  DEFAULT_SETTINGS,
  appendSnippet,
  clearTabSessions,
  getSettings,
  getDict
} from "./shared.js";

const CONTEXT_MENU_ID = "ask-ai-about-selection";
let hasActionClickFallbackListener = false;

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
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      return;
    } catch {
      // Fallback below.
    }
  }

  if (!hasActionClickFallbackListener) {
    chrome.action.onClicked.addListener(async (tab) => {
      if (!tab?.id) {
        return;
      }
      await chrome.sidePanel.open({ tabId: tab.id });
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
  const openPanelPromise = chrome.sidePanel.open({ tabId: tab.id });

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
  if (area !== "local" || !changes.displayLanguage) {
    return;
  }
  try {
    await ensureContextMenu();
  } catch {
    // Avoid uncaught errors from context-menu timing races.
  }
});

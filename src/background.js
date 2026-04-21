import {
  DEFAULT_SETTINGS,
  appendSnippet,
  clearTabSessions,
  getSettings,
  getDict
} from "./shared.js";

const CONTEXT_MENU_ID = "ask-ai-about-selection";
const SIDE_PANEL_ENABLED_TABS_KEY = "sidepanel:enabled-tabs";
const LEGACY_SIDE_PANEL_ACTIVE_PAGE_KEY = "sidepanel:active-page";
const LEGACY_SIDE_PANEL_ENABLED_PAGES_KEY = "sidepanel:enabled-pages";
let hasActionClickFallbackListener = false;
let enabledTabsLoaded = false;
let enabledTabs = new Set();

async function hardenStorageAccess() {
  try {
    if (chrome.storage?.local?.setAccessLevel) {
      await chrome.storage.local.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS"
      });
    }
    if (chrome.storage?.session?.setAccessLevel) {
      await chrome.storage.session.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS"
      });
    }
  } catch {
    // Older Chrome versions might not support this API.
  }
}

function extractTabIdFromLegacyPageKey(key) {
  if (typeof key !== "string") {
    return null;
  }
  const splitAt = key.indexOf("::");
  if (splitAt <= 0) {
    return null;
  }
  const id = Number(key.slice(0, splitAt));
  return Number.isInteger(id) ? id : null;
}

async function persistEnabledTabs() {
  await chrome.storage.session.set({
    [SIDE_PANEL_ENABLED_TABS_KEY]: [...enabledTabs]
  });
}

async function loadEnabledTabs() {
  if (enabledTabsLoaded) {
    return;
  }
  const data = await chrome.storage.session.get([
    SIDE_PANEL_ENABLED_TABS_KEY,
    LEGACY_SIDE_PANEL_ACTIVE_PAGE_KEY,
    LEGACY_SIDE_PANEL_ENABLED_PAGES_KEY
  ]);

  enabledTabs = new Set();
  const current = data[SIDE_PANEL_ENABLED_TABS_KEY];
  if (Array.isArray(current)) {
    current
      .filter((tabId) => Number.isInteger(tabId))
      .forEach((tabId) => enabledTabs.add(tabId));
  }

  const legacyActivePage = data[LEGACY_SIDE_PANEL_ACTIVE_PAGE_KEY];
  if (Number.isInteger(legacyActivePage?.tabId)) {
    enabledTabs.add(legacyActivePage.tabId);
  }

  const legacyEnabledPages = data[LEGACY_SIDE_PANEL_ENABLED_PAGES_KEY];
  if (Array.isArray(legacyEnabledPages)) {
    legacyEnabledPages.forEach((key) => {
      const tabId = extractTabIdFromLegacyPageKey(key);
      if (tabId) {
        enabledTabs.add(tabId);
      }
    });
  }

  await persistEnabledTabs();
  if (data[LEGACY_SIDE_PANEL_ACTIVE_PAGE_KEY] !== undefined) {
    await chrome.storage.session.remove(LEGACY_SIDE_PANEL_ACTIVE_PAGE_KEY);
  }
  if (data[LEGACY_SIDE_PANEL_ENABLED_PAGES_KEY] !== undefined) {
    await chrome.storage.session.remove(LEGACY_SIDE_PANEL_ENABLED_PAGES_KEY);
  }
  enabledTabsLoaded = true;
}

async function markTabEnabled(tabId) {
  if (!Number.isInteger(tabId)) {
    return;
  }
  await loadEnabledTabs();
  if (enabledTabs.has(tabId)) {
    return;
  }
  enabledTabs.add(tabId);
  await persistEnabledTabs();
}

async function unmarkTabEnabled(tabId) {
  if (!Number.isInteger(tabId)) {
    return;
  }
  await loadEnabledTabs();
  if (!enabledTabs.delete(tabId)) {
    return;
  }
  await persistEnabledTabs();
}

async function setSidePanelEnabledForTab(tabId, enabled) {
  if (!tabId || !chrome.sidePanel?.setOptions) {
    return;
  }
  await chrome.sidePanel.setOptions({
    tabId,
    path: "sidepanel.html",
    enabled
  });
}

async function syncSidePanelEnabledStateForTab(tabId) {
  if (!tabId || !chrome.sidePanel?.setOptions) {
    return;
  }
  await loadEnabledTabs();
  const enabled = enabledTabs.has(tabId);
  await setSidePanelEnabledForTab(tabId, enabled);
}

async function syncAllTabsSidePanelEnabledState() {
  if (!chrome.sidePanel?.setOptions) {
    return;
  }
  await loadEnabledTabs();
  const tabs = await chrome.tabs.query({});
  const aliveTabIds = new Set(
    tabs.map((tab) => tab.id).filter((tabId) => Number.isInteger(tabId))
  );

  let changed = false;
  for (const tabId of [...enabledTabs]) {
    if (!aliveTabIds.has(tabId)) {
      enabledTabs.delete(tabId);
      changed = true;
    }
  }
  if (changed) {
    await persistEnabledTabs();
  }

  await Promise.all(
    tabs
      .map((tab) => tab.id)
      .filter((tabId) => Number.isInteger(tabId))
      .map((tabId) => syncSidePanelEnabledStateForTab(tabId))
  );
}

async function enforceGlobalSidePanelDefaultDisabled() {
  if (!chrome.sidePanel?.setOptions) {
    return;
  }
  await chrome.sidePanel.setOptions({
    path: "sidepanel.html",
    enabled: false
  });
}

function isUserGestureRestrictionError(err) {
  const message = String(err?.message || err || "").toLowerCase();
  return (
    message.includes("sidepanel.open()") &&
    (message.includes("user gesture") || message.includes("user activation"))
  );
}

async function openSidePanelSafely(tabId, source) {
  try {
    // Fire-and-open first to keep user-gesture context for sidePanel.open().
    const enablePromise = setSidePanelEnabledForTab(tabId, true);
    await chrome.sidePanel.open({ tabId });
    await enablePromise;
    await markTabEnabled(tabId);
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
  await enforceGlobalSidePanelDefaultDisabled();

  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      // Always keep native auto-open off. We open panel manually per-tab so
      // side panel state does not leak across tabs.
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: false
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
        await openSidePanelSafely(tab.id, "action_click");
      } catch (err) {
        console.error("[Web LLM Assistant] action click failed:", err);
      }
    });
    hasActionClickFallbackListener = true;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await hardenStorageAccess();
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
  await getSettings();
  await setupActionOpenSidePanel();
  await ensureContextMenu();
  await syncAllTabsSidePanelEnabledState();
});

chrome.runtime.onStartup.addListener(async () => {
  await hardenStorageAccess();
  await getSettings();
  await setupActionOpenSidePanel();
  await ensureContextMenu();
  await syncAllTabsSidePanelEnabledState();
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
      snippet: text
    });
  } catch (err) {
    if (!String(err?.message || "").includes("Receiving end does not exist")) {
      throw err;
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await unmarkTabEnabled(tabId);
  await clearTabSessions(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await syncSidePanelEnabledStateForTab(tabId);
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab?.id) {
    return;
  }
  await syncSidePanelEnabledStateForTab(tab.id);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab?.id || tab.id !== tabId) {
    return;
  }
  if (changeInfo.status === "loading" || changeInfo.url) {
    await syncSidePanelEnabledStateForTab(tabId);
  }
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
    await syncAllTabsSidePanelEnabledState();
  } catch {
    // Avoid uncaught errors from timing races during setting updates.
  }
});

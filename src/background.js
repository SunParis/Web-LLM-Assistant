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
const tabsWithPendingOpen = new Set();

async function ensureSummaryExtractionDefaultOff() {
  const data = await chrome.storage.local.get("enablePageSummary");
  if (typeof data.enablePageSummary !== "boolean") {
    await chrome.storage.local.set({ enablePageSummary: false });
  }
}

/**
 * Hardens storage access to 'TRUSTED_CONTEXTS' for both local and session storage.
 * @returns {Promise<void>}
 */
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

/**
 * Extracts the tab ID from a legacy storage session key format.
 * @param {string} key - The legacy session key.
 * @returns {number|null} The extracted tab ID, or null if invalid.
 */
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

/**
 * Persists the current 'enabledTabs' set into session storage.
 * @returns {Promise<void>}
 */
async function persistEnabledTabs() {
  await chrome.storage.session.set({
    [SIDE_PANEL_ENABLED_TABS_KEY]: [...enabledTabs]
  });
}

/**
 * Loads enabled tabs from storage, migrating legacy formats, and avoiding dual-writes.
 * @returns {Promise<void>}
 */
async function loadEnabledTabs() {
  // One-time migration + load:
  // - keep current `sidepanel:enabled-tabs`
  // - import legacy page-key formats
  // - remove legacy keys to avoid dual-write drift
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

/**
 * Marks a tab as enabled in the 'enabledTabs' set and persists it.
 * @param {number} tabId - The ID of the tab to enable.
 * @returns {Promise<void>}
 */
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

/**
 * Removes a tab from the 'enabledTabs' set and persists the changes.
 * @param {number} tabId - The ID of the tab to disable.
 * @returns {Promise<void>}
 */
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

/**
 * Dynamically enables or disables the Chrome side panel for a target tab.
 * @param {number} tabId - The target tab ID.
 * @param {boolean} enabled - Whether to enable the side panel.
 * @returns {Promise<void>}
 */
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

/**
 * Synchronizes the side panel active state for a specific tab according to 'enabledTabs'.
 * @param {number} tabId - The tab ID to sync.
 * @returns {Promise<void>}
 */
async function syncSidePanelEnabledStateForTab(tabId) {
  if (!tabId || !chrome.sidePanel?.setOptions) {
    return;
  }
  await loadEnabledTabs();
  // Keep side panel enabled while an open attempt is in flight to avoid
  // racing with tab activation/update sync that could disable it.
  const enabled = enabledTabs.has(tabId) || tabsWithPendingOpen.has(tabId);
  await setSidePanelEnabledForTab(tabId, enabled);
}

/**
 * Cleans up dead tabs and synchronizes side panel states across all lived tabs.
 * @returns {Promise<void>}
 */
async function syncAllTabsSidePanelEnabledState() {
  if (!chrome.sidePanel?.setOptions) {
    return;
  }
  await loadEnabledTabs();
  const tabs = await chrome.tabs.query({});
  const aliveTabIds = new Set(
    tabs.map((tab) => tab.id).filter((tabId) => Number.isInteger(tabId))
  );

  // Garbage-collect dead tab IDs from previous browser session.
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

/**
 * Disables the global side panel to force per-tab enablement.
 * @returns {Promise<void>}
 */
async function enforceGlobalSidePanelDefaultDisabled() {
  if (!chrome.sidePanel?.setOptions) {
    return;
  }
  await chrome.sidePanel.setOptions({
    path: "sidepanel.html",
    enabled: false
  });
}

/**
 * Checks if an error relates to a user gesture restriction.
 * @param {Error|string} err - The captured error.
 * @returns {boolean} True if the error is a user gesture restriction.
 */
function isUserGestureRestrictionError(err) {
  const message = String(err?.message || err || "").toLowerCase();
  return (
    message.includes("sidepanel.open()") &&
    (message.includes("user gesture") || message.includes("user activation"))
  );
}

/**
 * Checks whether an error likely means the panel is not yet enabled for a tab.
 * @param {Error|string} err - The captured error.
 * @returns {boolean} True if it looks like a pre-enable race.
 */
function isPanelNotReadyError(err) {
  const message = String(err?.message || err || "").toLowerCase();
  return (
    message.includes("no active side panel") ||
    message.includes("side panel is not enabled")
  );
}

/**
 * Attempts to safely open the side panel, managing user gesture restrictions.
 * @param {number} tabId - The target tab ID.
 * @param {string} source - The trigger context (e.g., 'action_click', 'context_menu').
 * @returns {Promise<boolean>} True if it opened successfully, otherwise false.
 */
async function openSidePanelSafely(tabId, source) {
  if (!Number.isInteger(tabId)) {
    return false;
  }

  tabsWithPendingOpen.add(tabId);
  const enablePromise = setSidePanelEnabledForTab(tabId, true);

  try {
    // Fire-and-open first to keep user-gesture context for sidePanel.open().
    await chrome.sidePanel.open({ tabId });
    await enablePromise;
    await markTabEnabled(tabId);
    return true;
  } catch (err) {
    if (isPanelNotReadyError(err)) {
      try {
        // Retry once after enable settles to absorb async ordering races.
        await enablePromise;
        await chrome.sidePanel.open({ tabId });
        await markTabEnabled(tabId);
        return true;
      } catch (retryErr) {
        if (isUserGestureRestrictionError(retryErr)) {
          const retryMessage = String(retryErr?.message || retryErr || "");
          console.warn(
            `[Web LLM Assistant] Skip side panel open from ${source}: ${retryMessage}`
          );
          return false;
        }
        console.error(
          `[Web LLM Assistant] side panel open failed from ${source}:`,
          retryErr
        );
        return false;
      }
    }

    const message = String(err?.message || err || "");
    if (isUserGestureRestrictionError(err)) {
      console.warn(
        `[Web LLM Assistant] Skip side panel open from ${source}: ${message}`
      );
      return false;
    }
    console.error(`[Web LLM Assistant] side panel open failed from ${source}:`, err);
    return false;
  } finally {
    tabsWithPendingOpen.delete(tabId);
  }
}

/**
 * Wraps chrome context menu removal in a Promise to safely bypass duplicate errors.
 * @param {string} menuId - The ID of the context menu to remove.
 * @returns {Promise<void>}
 */
function removeContextMenu(menuId) {
  return new Promise((resolve) => {
    chrome.contextMenus.remove(menuId, () => {
      // Consume runtime.lastError to avoid "Unchecked runtime.lastError".
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

/**
 * Wraps chrome context menu creation in a Promise.
 * @param {string} title - The title of the context menu.
 * @returns {Promise<void>}
 */
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

/**
 * Recreates the context menu with the correct language translation.
 * @returns {Promise<void>}
 */
async function ensureContextMenu() {
  const { displayLanguage } = await getSettings();
  const dict = getDict(displayLanguage);
  await removeContextMenu(CONTEXT_MENU_ID);
  await createContextMenu(dict.askAiMenu);
}

/**
 * Configures the fallback extension action behavior (toolbar icon click).
 * @returns {Promise<void>}
 */
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
    // Keep a single fallback listener across runtime setting toggles.
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
  await ensureSummaryExtractionDefaultOff();
  await getSettings();
  await setupActionOpenSidePanel();
  await ensureContextMenu();
  await syncAllTabsSidePanelEnabledState();
});

chrome.runtime.onStartup.addListener(async () => {
  await hardenStorageAccess();
  await ensureSummaryExtractionDefaultOff();
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

export const SIDEPANEL_EVENTS = {
  MESSAGE_SENT: "message_sent",
  MESSAGE_UPDATED: "message_updated",
  MESSAGE_DELETED: "message_deleted",
  MESSAGE_COPIED: "message_copied",
  SUMMARY_STATE: "summary_state",
  GENERATION_STATE: "generation_state",
  CONTEXT_SYNCED: "context_synced",
  HISTORY_CLEARED: "history_cleared",
  SNIPPET_REMOVED: "snippet_removed",
  CONSENT_BLOCKED: "consent_blocked",
  SENSITIVE_WARNING: "sensitive_warning"
};

export function createEventHub() {
  const listeners = new Map();

  function on(eventName, handler) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }
    listeners.get(eventName).add(handler);
    return () => off(eventName, handler);
  }

  function off(eventName, handler) {
    const handlers = listeners.get(eventName);
    if (!handlers) {
      return;
    }
    handlers.delete(handler);
    if (!handlers.size) {
      listeners.delete(eventName);
    }
  }

  function emit(eventName, payload = {}) {
    const handlers = listeners.get(eventName);
    if (!handlers) {
      // Still publish DOM event for future non-invasive integrations.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(`web-llm-assistant:${eventName}`, { detail: payload })
        );
      }
      return;
    }
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        console.warn("[sidepanel-events] handler error:", err);
      }
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(`web-llm-assistant:${eventName}`, { detail: payload })
      );
    }
  }

  return { on, off, emit };
}

# Sidepanel Architecture

This document describes how `src/sidepanel.js` is organized after modular refactoring.

## Module Responsibilities

- `src/sidepanel.js`
  - Orchestrates runtime flow and state transitions.
  - Handles Chrome APIs, session persistence, summary flow, and send lifecycle.
- `src/sidepanel_ui.js`
  - Renders message list and snippet chips.
  - Applies localized text labels and theme.
  - Encapsulates all sidepanel DOM write operations.
- `src/sidepanel_api.js`
  - Encapsulates API requests, SSE parsing, fallback strategy, and response extraction.
- `src/sidepanel_text.js`
  - Provides text-only utilities: summary condensation, fallback summary, sensitivity detection.
- `src/sidepanel_events.js`
  - Provides a lightweight event hub and named event constants for extension points.
- `src/sidepanel_icons.js`
  - Stores icon SVG constants.

## Extension Points

- In-module subscription API:
  - `window.WebLLMAssistant.sidepanelEvents.on(eventName, handler)`
  - `window.WebLLMAssistant.sidepanelEvents.off(eventName, handler)`
- DOM custom events:
  - `window.addEventListener("web-llm-assistant:<event_name>", handler)`

## Current Event Names

- `message_sent`
- `message_updated`
- `message_deleted`
- `message_copied`
- `summary_state`
- `generation_state`
- `context_synced`
- `history_cleared`
- `snippet_removed`
- `consent_blocked`
- `sensitive_warning`

## Recommended Future Changes

- Text rendering beautification:
  - Prefer changes in `src/sidepanel_ui.js` only.
- New behavioral triggers (e.g. banners, hint cards, metrics):
  - Subscribe to sidepanel events and avoid coupling with orchestration logic.
- LLM protocol/provider adaptations:
  - Isolate in `src/sidepanel_api.js`.

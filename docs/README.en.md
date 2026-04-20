# Web LLM Assistant

A page-aware browser extension that lets you chat with any OpenAI-compatible LLM in a side panel, with optional selected-text context from the current webpage.

## Languages

- English (this page)
- [日本語](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.ja.md)
- [繁體中文](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.zh-Hant.md)
- [简体中文](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.zh-Hans.md)

## Features

- Side panel chat interface for each tab/page session.
- Add selected webpage text as context via right-click menu.
- Edit, resend, copy, and delete chat messages.
- Stop generation while streaming.
- Per-page session history (stored in extension session storage).
- Configurable API endpoint, API key, model, prompt, and sampling params.
- UI language options:
  - English (`en`)
  - Japanese (`ja`)
  - Traditional Chinese (`zh-Hant`)
  - Simplified Chinese (`zh-Hans`)

## Project Structure

- `src/manifest.json`: Extension manifest (MV3).
- `src/background.js`: Context menu and side panel opening logic.
- `src/sidepanel.html|css|js`: Main chat UI.
- `src/options.html|css|js`: Settings page.
- `src/shared.js`: Shared storage, i18n, and helper utilities.
- `src/locales/*`: Locale strings and default prompts.

## Installation (Developer Mode)

1. Open Chrome/Edge and go to the extensions page.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select the project folder containing `src/manifest.json`.

## Setup

1. Open extension settings (`options.html`).
2. Configure:
   - OpenAI-compatible API URL
   - API key
   - Model name
   - Prompt template (optional)
   - Temperature / Top P / Max Tokens
3. Save settings.
4. (Optional) Use Test API Connection to verify connectivity.

## Usage

1. Click the extension action icon to open the side panel.
2. Ask directly in the input box.
3. To include page context:
   - Select text on a webpage.
   - Right-click and choose Ask AI.
4. Send the prompt and receive streamed responses.

## Notes

- This project uses `chrome.storage.local` for settings and `chrome.storage.session` for per-page chat sessions.
- Host permissions are currently set to `<all_urls>` for broad webpage support.

## License

See [LICENSE](LICENSE).

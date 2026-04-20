# Web LLM Assistant

可結合網頁選取內容的側邊欄 LLM 助手，支援 OpenAI 相容 API。

## 語言

- [English](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.md)
- [日本語](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.ja.md)
- 繁體中文（本頁）
- [简体中文](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.zh-Hans.md)

## 功能

- 以分頁/頁面為單位的側邊欄聊天。
- 透過右鍵選單把網頁選取文字加入上下文。
- 訊息可編輯、重送、複製、刪除。
- 串流生成中可中止。
- 每頁會話歷史保存。
- 可設定 API URL、API Key、模型、Prompt 與取樣參數。
- 介面語言選項:
  - English (`en`)
  - 日本語 (`ja`)
  - 繁體中文 (`zh-Hant`)
  - 简体中文 (`zh-Hans`)

## 安裝（開發者模式）

1. 開啟 Chrome/Edge 的擴充功能頁面。
2. 開啟開發人員模式。
3. 點擊「載入未封裝項目」。
4. 選擇包含 `src/manifest.json` 的專案資料夾。

## 設定

1. 開啟擴充功能設定頁（`options.html`）。
2. 填入以下項目:
   - OpenAI 相容 API URL
   - API Key
   - 模型名稱
   - Prompt Template（選填）
   - Temperature / Top P / Max Tokens
3. 儲存設定。
4. 可使用 API 測試按鈕確認連線。

## 使用方式

1. 點擊擴充功能圖示開啟側邊欄。
2. 直接在輸入框提問。
3. 若要加入頁面上下文:
   - 在網頁上選取文字
   - 右鍵選單點選 Ask AI

## 授權

請參考 [LICENSE](LICENSE)。

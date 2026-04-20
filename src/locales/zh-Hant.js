export default {
  strings: {
    askAiMenu: "問問AI",
    sidepanelTitle: "網頁 LLM 助手",
    placeholderInput: "輸入你的問題...",
    send: "送出",
    edit: "編輯",
    resend: "重新送出",
    cancelEdit: "取消編輯",
    stop: "停止",
    copy: "複製",
    delete: "刪除",
    settings: "設定",
    selectedText: "已選取片段",
    selectedTextHistoryLabel: "[圈選內容]",
    noMessages: "目前還沒有訊息。",
    summaryPreparing: "嘗試快速總結網頁",
    summarySuccess: "成功總結",
    summaryFailedPrefix: "總結失敗",
    summaryFailedUnknown: "未知原因",
    stopped: "已停止。",
    errorPrefix: "錯誤",
    settingsTitle: "擴充功能設定",
    displayLanguage: "顯示語言",
    themeMode: "主題模式",
    themeSystem: "跟隨系統",
    themeLight: "淺色",
    themeDark: "深色",
    apiUrl: "OpenAI 格式 API URL",
    apiKey: "API Key",
    model: "模型名稱",
    prompt: "詢問 Prompt",
    promptHelp:
      "可使用變數：{{history}}、{{selected_text}}、{{page_summary}}、{{user_query}}。若對話紀錄或圈選內容為空，系統會自動填入「（空）」。若頁面摘要不可用，會維持空白。",
    temperature: "Temperature",
    topP: "Top P",
    maxTokens: "Max Tokens",
    enableSidePanelShortcutLabel: "啟用開啟側邊欄快捷鍵",
    enableSidePanelShortcutHelp:
      "預設為關閉。開啟後，請到瀏覽器擴充功能快捷鍵頁面，將「啟用擴充功能（Activate extension）」綁定按鍵。",
    enablePageSummaryLabel: "啟用先對網頁總結",
    enablePageSummaryHelp: "預設為關閉。啟用後，提問前會先嘗試生成當前頁面摘要。",
    legalConsentLabel: "我已了解並同意資料/合規聲明",
    legalConsentHelp:
      "使用前請確認你有權處理並將網頁內容送至你設定的 API 服務商。",
    legalConsentRequired: "請先勾選同意合規聲明，再儲存設定。",
    sensitiveReminderLabel: "送出前提醒可能含隱私/機密內容",
    sensitiveReminderHelp:
      "啟用後，若偵測到可能包含個資、帳號識別資訊、憑證/密鑰或機密內容，送出前會要求你再次確認。",
    consentNotAcceptedMessage: "請先到設定頁同意合規聲明後，再送出訊息。",
    sensitiveReminderConfirm:
      "偵測到可能含隱私/機密內容（例如：個資、帳號識別資訊、憑證/密鑰）。仍要送到你設定的 API 服務商嗎？",
    save: "儲存設定",
    testApi: "測試 API 連線",
    testing: "測試中...",
    testOk: "連線成功",
    testFail: "連線失敗",
    saved: "設定已儲存",
    clearHistory: "清除此頁歷史",
    cleared: "歷史已清除"
  },
  promptTemplate: `你是一個專業、高效的Chrome網頁AI助手。
請根據提供的【對話紀錄】、【圈選的網頁內容】、【目前網頁摘要】，來回答【使用者指令】。

### 規則：
1. 請務必使用流暢的**繁體中文**（zh-TW）進行回答。
2. 你的回答需要直接、精煉，並且緊扣圈選的網頁內容。
3. 如果【目前網頁摘要】或【圈選的網頁內容】為空，請用其餘可用資訊直接回答。
4. 若部分內容為空，仍要直接回答，不要反過來要求使用者補資料（除非使用者明確要求你做頁面擷取）。
5. 請不要在回答中重複使用者的指令，直接給出結果。

### 資料輸入：

【對話紀錄】
"""
{{history}}
"""

【圈選的網頁內容】
"""
{{selected_text}}
"""

【目前網頁摘要】
"""
{{page_summary}}
"""

【使用者指令】
"""
{{user_query}}
"""`
};

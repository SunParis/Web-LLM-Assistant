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
      "可使用變數：{{history}}、{{selected_text}}、{{user_query}}。若對話紀錄或圈選內容為空，系統會自動填入「（空）」。",
    temperature: "Temperature",
    topP: "Top P",
    maxTokens: "Max Tokens",
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
請根據提供的【對話紀錄】、【圈選的網頁內容】，來回答【使用者指令】。

### 規則：
1. 請務必使用流暢的**繁體中文**（zh-TW）進行回答。
2. 你的回答需要直接、精煉，並且緊扣圈選的網頁內容。
3. 如果【圈選的網頁內容】為空，請僅根據【對話紀錄】和【使用者指令】進行回答。
4. 若圈選內容為空，仍要直接回答，不要反過來要求使用者再提供圈選內容（除非使用者明確要求你做頁面擷取）。
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

【使用者指令】
"""
{{user_query}}
"""`
};

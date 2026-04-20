export default {
  strings: {
    askAiMenu: "问问AI",
    sidepanelTitle: "网页 LLM 助手",
    placeholderInput: "输入你的问题...",
    send: "发送",
    edit: "编辑",
    resend: "重新发送",
    cancelEdit: "取消编辑",
    stop: "停止",
    copy: "复制",
    delete: "删除",
    settings: "设置",
    selectedText: "已选取片段",
    selectedTextHistoryLabel: "[圈选内容]",
    noMessages: "目前还没有消息。",
    stopped: "已停止。",
    errorPrefix: "错误",
    settingsTitle: "扩展设置",
    displayLanguage: "显示语言",
    themeMode: "主题模式",
    themeSystem: "跟随系统",
    themeLight: "浅色",
    themeDark: "深色",
    apiUrl: "OpenAI 格式 API URL",
    apiKey: "API Key",
    model: "模型名称",
    prompt: "询问 Prompt",
    promptHelp:
      "可使用变量：{{history}}、{{selected_text}}、{{user_query}}。若对话历史或圈选内容为空，系统会自动填入「（空）」。",
    temperature: "Temperature",
    topP: "Top P",
    maxTokens: "Max Tokens",
    save: "保存设置",
    testApi: "测试 API 连接",
    testing: "测试中...",
    testOk: "连接成功",
    testFail: "连接失败",
    saved: "设置已保存",
    clearHistory: "清除本页历史",
    cleared: "历史已清除"
  },
  promptTemplate: `你是一个专业、高效的Chrome网页AI助手。
请根据提供的【对话历史】、【圈选的网页内容】，来回答【用户指令】。

### 规则：
1. 请务必使用流畅的**简体中文**进行回答。
2. 你的回答需要直接、精炼，并且紧扣圈选的网页内容。
3. 如果【圈选的网页内容】为空，请仅根据【对话历史】和【用户指令】进行回答。
4. 若圈选内容为空，仍要直接回答，不要反过来要求用户再提供圈选内容（除非用户明确要求你做页面提取）。
5. 请不要在回答中重复用户的指令，直接给出结果。

### 数据输入：

【对话历史】
"""
{{history}}
"""

【圈选的网页内容】
"""
{{selected_text}}
"""

【用户指令】
"""
{{user_query}}
"""`
};

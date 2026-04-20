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
    summaryPreparing: "尝试快速总结网页",
    summarySuccess: "成功总结",
    summaryFailedPrefix: "总结失败",
    summaryFailedUnknown: "未知原因",
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
      "可使用变量：{{history}}、{{selected_text}}、{{page_summary}}、{{user_query}}。若对话历史或圈选内容为空，系统会自动填入「（空）」。若页面摘要不可用，会保持空白。",
    temperature: "Temperature",
    topP: "Top P",
    maxTokens: "Max Tokens",
    enableSidePanelShortcutLabel: "启用打开侧边栏快捷键",
    enableSidePanelShortcutHelp:
      "默认关闭。开启后，请到浏览器扩展快捷键页面，为“启用扩展程序（Activate extension）”绑定按键。",
    enablePageSummaryLabel: "启用先对网页总结",
    enablePageSummaryHelp: "默认关闭。开启后，提问前会先尝试生成当前页面摘要。",
    legalConsentLabel: "我已了解并同意数据/合规声明",
    legalConsentHelp:
      "使用前请确认你有权处理并将网页内容发送到你配置的 API 服务商。",
    legalConsentRequired: "请先勾选同意合规声明，再保存设置。",
    sensitiveReminderLabel: "发送前提醒可能含隐私/机密内容",
    sensitiveReminderHelp:
      "开启后，若检测到可能包含个人信息、账号识别信息、凭证/密钥或机密内容，发送前会要求你再次确认。",
    consentNotAcceptedMessage: "请先到设置页同意合规声明后，再发送消息。",
    sensitiveReminderConfirm:
      "检测到可能含隐私/机密内容（例如：个人信息、账号识别信息、凭证/密钥）。仍要发送到你配置的 API 服务商吗？",
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
请根据提供的【对话历史】、【圈选的网页内容】、【当前网页摘要】，来回答【用户指令】。

### 规则：
1. 请务必使用流畅的**简体中文**进行回答。
2. 你的回答需要直接、精炼，并且紧扣圈选的网页内容。
3. 如果【当前网页摘要】或【圈选的网页内容】为空，请使用其余可用信息直接回答。
4. 若部分上下文为空，仍要直接回答，不要反过来要求用户补充（除非用户明确要求你做页面提取）。
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

【当前网页摘要】
"""
{{page_summary}}
"""

【用户指令】
"""
{{user_query}}
"""`
};

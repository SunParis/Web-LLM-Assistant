export default {
  strings: {
    askAiMenu: "AIに質問",
    sidepanelTitle: "ウェブ LLM アシスタント",
    placeholderInput: "質問を入力してください...",
    send: "送信",
    edit: "編集",
    resend: "再送信",
    cancelEdit: "編集をキャンセル",
    stop: "停止",
    copy: "コピー",
    delete: "削除",
    settings: "設定",
    selectedText: "選択したテキスト",
    selectedTextHistoryLabel: "[選択内容]",
    noMessages: "まだメッセージはありません。",
    stopped: "停止しました。",
    errorPrefix: "エラー",
    settingsTitle: "拡張機能の設定",
    displayLanguage: "表示言語",
    themeMode: "テーマ",
    themeSystem: "システムに従う",
    themeLight: "ライト",
    themeDark: "ダーク",
    apiUrl: "OpenAI 形式 API URL",
    apiKey: "APIキー",
    model: "モデル名",
    prompt: "プロンプト",
    promptHelp:
      "使用可能な変数：{{history}}、{{selected_text}}、{{user_query}}。会話履歴や選択内容が空の場合は「（空）」が自動的に挿入されます。",
    temperature: "Temperature",
    topP: "Top P",
    maxTokens: "Max Tokens",
    save: "設定を保存",
    testApi: "API 接続テスト",
    testing: "テスト中...",
    testOk: "接続成功",
    testFail: "接続失敗",
    saved: "設定を保存しました",
    clearHistory: "このページの履歴をクリア",
    cleared: "履歴をクリアしました"
  },
  promptTemplate: `あなたはプロフェッショナルで効率的なChromeウェブAIアシスタントです。
提供された【会話履歴】と【選択されたウェブ内容】に基づいて、【ユーザーの指示】に答えてください。

### ルール：
1. 必ず自然で流暢な**日本語**で回答してください。
2. 回答は簡潔かつ要点を押さえ、選択されたウェブ内容に密接に基づいてください。
3. 【選択されたウェブ内容】が空の場合は、【会話履歴】と【ユーザーの指示】のみに基づいて回答してください。
4. 選択内容が空でも、ユーザーに再度選択を求めず、そのまま回答してください（ユーザーが明示的にページ取得を求めた場合を除く）。
5. ユーザーの指示を繰り返さず、直接結果を提示してください。

### 入力データ：

【会話履歴】
"""
{{history}}
"""

【選択されたウェブ内容】
"""
{{selected_text}}
"""

【ユーザーの指示】
"""
{{user_query}}
"""`
};
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
    summaryPreparing: "ページを高速要約中",
    summarySuccess: "要約が完了しました",
    summaryFailedPrefix: "要約失敗",
    summaryFailedUnknown: "不明な理由",
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
      "使用可能な変数：{{history}}、{{selected_text}}、{{page_summary}}、{{user_query}}。会話履歴や選択内容が空の場合は「（空）」が自動的に挿入されます。ページ要約がない場合は空のままになります。",
    temperature: "Temperature",
    topP: "Top P",
    maxTokens: "Max Tokens",
    enableSidePanelShortcutLabel: "サイドパネルを開くショートカットを有効化",
    enableSidePanelShortcutHelp:
      "既定はオフです。有効化後、ブラウザの拡張機能ショートカット画面で「拡張機能を有効化（Activate extension）」にキーを割り当ててください。",
    enablePageSummaryLabel: "ページ先行要約を有効化",
    enablePageSummaryHelp:
      "既定はオフです。有効化すると、回答前に現在ページの要約を試行します。",
    legalConsentLabel: "データ/コンプライアンス注意事項に同意します",
    legalConsentHelp:
      "利用前に、ページ内容を処理して設定した API プロバイダーへ送信する権利があることを確認してください。本拡張機能はプロジェクト運営側のクラウド/バックエンドへデータをアップロードせず、個人情報を能動的に収集しません。ユーザーが明示的に質問を送信した場合に限り、送信対象として選んだテキストのみが設定済み API プロバイダーへ送られます。",
    legalConsentRequired: "設定保存の前に、コンプライアンス同意にチェックしてください。",
    sensitiveReminderLabel: "送信前にプライバシー/機密情報の注意を表示する",
    sensitiveReminderHelp:
      "有効化すると、個人情報・アカウント識別情報・資格情報/キー・機密情報が含まれる可能性がある場合に、送信前の確認を表示します。",
    consentNotAcceptedMessage:
      "メッセージ送信前に、設定画面でコンプライアンス同意を有効にしてください。",
    sensitiveReminderConfirm:
      "プライバシー/機密情報（例: 個人情報、アカウント識別情報、資格情報/キー）が含まれる可能性があります。設定済み API プロバイダーへ送信しますか？",
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
提供された【会話履歴】、【選択されたウェブ内容】、【現在のページ要約】に基づいて、【ユーザーの指示】に答えてください。

### ルール：
1. 必ず自然で流暢な**日本語**で回答してください。
2. 回答は簡潔かつ要点を押さえ、選択されたウェブ内容に密接に基づいてください。
3. 【現在のページ要約】または【選択されたウェブ内容】が空でも、利用可能な文脈で回答してください。
4. 文脈が一部空でも、ユーザーに再入力を求めず、そのまま回答してください（ユーザーが明示的にページ取得を求めた場合を除く）。
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

【現在のページ要約】
"""
{{page_summary}}
"""

【ユーザーの指示】
"""
{{user_query}}
"""`
};

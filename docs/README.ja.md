# Web LLM Assistant

ページ内容を文脈として使える、サイドパネル型の OpenAI 互換 LLM チャット拡張機能です。

## 言語

- [English](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.md)
- 日本語（このページ）
- [繁體中文](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.zh-Hant.md)
- [简体中文](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.zh-Hans.md)

## 主な機能

- タブ/ページ単位のサイドパネルチャット。
- Web ページで選択したテキストを右クリックで文脈追加。
- メッセージの編集・再送・コピー・削除。
- 生成中の停止。
- ページ単位のセッション履歴保存。
- API エンドポイント、API キー、モデル、プロンプト、サンプリング値を設定可能。
- UI 言語オプション:
  - English (`en`)
  - 日本語 (`ja`)
  - 繁體中文 (`zh-Hant`)
  - 简体中文 (`zh-Hans`)

## インストール（開発者モード）

1. Chrome/Edge の拡張機能ページを開く。
2. 開発者モードを有効化。
3. 「パッケージ化されていない拡張機能を読み込む」をクリック。
4. `src/manifest.json` を含むプロジェクトフォルダを選択。

## 初期設定

1. 拡張機能設定（`options.html`）を開く。
2. 以下を設定:
   - OpenAI 互換 API URL
   - API キー
   - モデル名
   - プロンプトテンプレート（任意）
   - Temperature / Top P / Max Tokens
3. 設定を保存。
4. 必要に応じて API 接続テストを実行。

## 使い方

1. 拡張機能アイコンからサイドパネルを開く。
2. 入力欄に質問を入力して送信。
3. ページ文脈を追加する場合:
   - ページ上の文字を選択
   - 右クリックで Ask AI を選択

## ライセンス

[LICENSE](LICENSE) を参照してください。

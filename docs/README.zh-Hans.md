# Web LLM Assistant

一个可结合网页选取内容的侧边栏 LLM 助手，支持 OpenAI 兼容 API。

## 语言

- [English](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.md)
- [日本語](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.ja.md)
- [繁體中文](https://github.com/SunParis/Web-LLM-Assistant/blob/main/docs/README.zh-Hant.md)
- 简体中文（本页）

## 功能

- 以标签页/页面为单位的侧边栏聊天。
- 通过右键菜单把网页选取文字加入上下文。
- 消息可编辑、重发、复制、删除。
- 流式生成中可停止。
- 每页会话历史保存。
- 可配置 API URL、API Key、模型、Prompt 与采样参数。
- 界面语言选项:
  - English (`en`)
  - 日本語 (`ja`)
  - 繁體中文 (`zh-Hant`)
  - 简体中文 (`zh-Hans`)

## 安装（开发者模式）

1. 打开 Chrome/Edge 扩展页面。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择包含 `src/manifest.json` 的项目目录。

## 设置

1. 打开扩展设置页（`options.html`）。
2. 填写以下项:
   - OpenAI 兼容 API URL
   - API Key
   - 模型名称
   - Prompt Template（可选）
   - Temperature / Top P / Max Tokens
3. 保存设置。
4. 可用 API 测试按钮检查连通性。

## 使用

1. 点击扩展图标打开侧边栏。
2. 在输入框直接提问。
3. 如需加入页面上下文:
   - 在网页中选中文字
   - 右键菜单选择 Ask AI

## 许可证

请参阅 [LICENSE](LICENSE)。

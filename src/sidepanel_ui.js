function createIconButton(iconSvg, title, onClick, className = "msg-btn") {
  const btn = document.createElement("button");
  btn.className = className;
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.innerHTML = iconSvg;
  btn.addEventListener("click", onClick);
  return btn;
}

function isPendingMessage(msg) {
  return msg?.meta === "pending";
}

export function createSidepanelUI({
  els,
  icons,
  onEditMessage,
  onResendMessage,
  onCopyMessage,
  onDeleteMessage,
  onRemoveSnippet
}) {
  function setSendButtonMode(dict, isGenerating) {
    if (isGenerating) {
      els.sendBtn.dataset.mode = "stop";
      els.sendBtn.title = dict.stop;
      els.sendBtn.setAttribute("aria-label", dict.stop);
      els.sendBtn.innerHTML = icons.ICON_STOP;
      return;
    }
    els.sendBtn.dataset.mode = "send";
    els.sendBtn.title = dict.send;
    els.sendBtn.setAttribute("aria-label", dict.send);
    els.sendBtn.innerHTML = icons.ICON_SEND;
  }

  function setEditingMode(isEditing) {
    document.body.classList.toggle("editing", isEditing);
  }

  function applyText(dict, isGenerating) {
    els.title.textContent = dict.sidepanelTitle;
    els.input.placeholder = dict.placeholderInput;
    els.snippetLabel.textContent = dict.selectedText;
    const cancelEditLabel = dict.cancelEdit || "Cancel edit";
    const cancelEditLabelWithShortcut = `${cancelEditLabel} (Esc)`;
    els.cancelEditBtn.innerHTML = icons.ICON_CANCEL_EDIT;
    els.cancelEditBtn.title = cancelEditLabelWithShortcut;
    els.cancelEditBtn.setAttribute("aria-label", cancelEditLabelWithShortcut);
    els.clearHistoryBtn.innerHTML = icons.ICON_CLEAR;
    els.clearHistoryBtn.title = dict.clearHistory;
    els.clearHistoryBtn.setAttribute("aria-label", dict.clearHistory);
    els.settingsLink.innerHTML = icons.ICON_SETTINGS;
    els.settingsLink.title = dict.settings;
    els.settingsLink.setAttribute("aria-label", dict.settings);
    setSendButtonMode(dict, isGenerating);
  }

  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === "light" || mode === "dark") {
      root.setAttribute("data-theme", mode);
      return;
    }
    root.removeAttribute("data-theme");
  }

  function renderMessages(session, dict, isGenerating) {
    const messages = session?.messages || [];
    els.messages.innerHTML = "";

    if (!messages.length) {
      const div = document.createElement("div");
      div.className = "empty";
      div.textContent = dict.noMessages;
      els.messages.appendChild(div);
      return;
    }

    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      if (!msg || typeof msg !== "object") {
        continue;
      }
      const div = document.createElement("div");
      const isSnippet = msg?.meta === "snippet";
      const isPending = isPendingMessage(msg);
      div.className = `msg ${isSnippet ? "snippet" : msg.role === "user" ? "user" : "assistant"}`;

      const content = document.createElement("div");
      content.className = "msg-content";
      if (isPending) {
        content.classList.add("pending");
        if (msg.content) {
          const text = document.createElement("span");
          text.className = "pending-text";
          text.textContent = msg.content;
          content.appendChild(text);
        }
        const dots = document.createElement("span");
        dots.className = "pending-dots";
        dots.innerHTML = "<span></span><span></span><span></span>";
        content.appendChild(dots);
      } else {
        content.textContent = msg.content;
      }
      div.appendChild(content);

      if (!isPending && !isSnippet) {
        const actions = document.createElement("div");
        actions.className = "msg-actions";

        if (msg.role === "user") {
          const editBtn = createIconButton(icons.ICON_EDIT, dict.edit, async () => {
            await onEditMessage(i);
          });
          const resendBtn = createIconButton(icons.ICON_RESEND, dict.resend, async () => {
            await onResendMessage(i);
          });
          actions.appendChild(editBtn);
          actions.appendChild(resendBtn);
        }

        const copyBtn = createIconButton(icons.ICON_COPY, dict.copy, async () => {
          await onCopyMessage(msg.content, i);
        });

        const deleteBtn = createIconButton(icons.ICON_DELETE, dict.delete, async () => {
          await onDeleteMessage(i);
        });

        actions.appendChild(copyBtn);
        actions.appendChild(deleteBtn);
        div.appendChild(actions);
      }

      els.messages.appendChild(div);
    }

    els.messages.scrollTop = els.messages.scrollHeight;
    setSendButtonMode(dict, isGenerating);
  }

  function renderSnippets(session) {
    const snippets = session?.snippets || [];
    els.snippetList.innerHTML = "";
    for (let i = 0; i < snippets.length; i += 1) {
      const snippet = snippets[i];
      const chip = document.createElement("div");
      chip.className = "snippet-chip";

      const text = document.createElement("span");
      text.className = "snippet-text";
      text.title = snippet;
      text.textContent = snippet;

      const removeBtn = document.createElement("button");
      removeBtn.className = "snippet-remove";
      removeBtn.type = "button";
      removeBtn.textContent = "x";
      removeBtn.addEventListener("click", async () => {
        await onRemoveSnippet(i, snippet);
      });

      chip.appendChild(text);
      chip.appendChild(removeBtn);
      els.snippetList.appendChild(chip);
    }
  }

  return {
    setSendButtonMode,
    setEditingMode,
    applyText,
    applyTheme,
    renderMessages,
    renderSnippets
  };
}

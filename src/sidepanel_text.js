export const SUMMARY_SOURCE_CHAR_LIMIT = 4200;
export const SUMMARY_OUTPUT_CHAR_LIMIT = 520;

export function buildFallbackSummary(condensedText, maxChars = SUMMARY_OUTPUT_CHAR_LIMIT) {
  const sentences = (condensedText || "")
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!sentences.length) {
    return "";
  }

  const lines = [];
  let total = 0;
  for (let i = 0; i < sentences.length && lines.length < 5; i += 1) {
    const sentence = sentences[i].slice(0, 130);
    const line = `- ${sentence}`;
    if (total + line.length + 1 > maxChars) {
      break;
    }
    lines.push(line);
    total += line.length + 1;
  }

  return lines.join("\n");
}

export function detectSensitiveData(text) {
  const value = String(text || "");
  if (!value.trim()) {
    return false;
  }

  const patterns = [
    /\b\d{13,19}\b/,
    /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/,
    /\b[A-Z][12]\d{8}\b/i,
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}\b/,
    /\b(sk-[a-z0-9]{12,}|password|passwd|api[_-]?key|secret|token|private key|信用卡|卡號|身份证|身分證|密碼)\b/i
  ];
  return patterns.some((p) => p.test(value));
}

export function condensePageText(rawText, maxChars = SUMMARY_SOURCE_CHAR_LIMIT) {
  const normalized = (rawText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }

  const sentences = normalized.split(/(?<=[.!?。！？])\s+/).map((s) => s.trim());
  const selected = [];
  const seen = new Set();
  let total = 0;

  for (const sentence of sentences) {
    if (!sentence || sentence.length < 20) {
      continue;
    }
    const key = sentence.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const capped = sentence.slice(0, 220);
    if (total + capped.length + 1 > maxChars) {
      break;
    }
    selected.push(capped);
    total += capped.length + 1;
  }

  if (!selected.length) {
    return normalized.slice(0, maxChars);
  }
  return selected.join("\n");
}

export function historyToText(messages, selectedTextHistoryLabel) {
  if (!messages.length) {
    return "";
  }
  return messages
    .map((m) => {
      if (m.meta === "snippet") {
        return `${selectedTextHistoryLabel} ${m.content}`;
      }
      return `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`;
    })
    .join("\n");
}

export function snippetsToText(
  snippets,
  maxCharsPerSnippet = Number.MAX_SAFE_INTEGER,
  maxTotalChars = Number.MAX_SAFE_INTEGER
) {
  if (!snippets.length) {
    return "";
  }

  const lines = [];
  let total = 0;
  for (let i = 0; i < snippets.length; i += 1) {
    const raw = snippets[i];
    const trimmed = raw.slice(0, maxCharsPerSnippet);
    const line = `[${i + 1}] ${trimmed}`;
    if (total + line.length > maxTotalChars) {
      break;
    }
    lines.push(line);
    total += line.length;
  }
  return lines.join("\n");
}

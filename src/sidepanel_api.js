const ERROR_DETAIL_CHAR_LIMIT = 500;

export function sanitizeErrorDetail(detail) {
  return String(detail || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ERROR_DETAIL_CHAR_LIMIT);
}

export function extractAssistantText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item?.text === "string") {
          return item.text;
        }
        return "";
      })
      .filter(Boolean);
    if (textParts.length) {
      return textParts.join("\n");
    }
  }

  const alt = data?.output_text;
  if (typeof alt === "string" && alt.trim()) {
    return alt;
  }

  const choiceText = data?.choices?.[0]?.text;
  if (typeof choiceText === "string" && choiceText.trim()) {
    return choiceText;
  }

  const refusal = data?.choices?.[0]?.message?.refusal;
  if (typeof refusal === "string" && refusal.trim()) {
    return refusal;
  }

  const reasoningContent = data?.choices?.[0]?.message?.reasoning_content;
  if (typeof reasoningContent === "string" && reasoningContent.trim()) {
    return reasoningContent;
  }

  const responsesApiOutput = data?.output?.[0]?.content;
  if (Array.isArray(responsesApiOutput)) {
    const textParts = responsesApiOutput
      .map((item) => {
        if (typeof item?.text === "string") {
          return item.text;
        }
        if (typeof item?.output_text === "string") {
          return item.output_text;
        }
        return "";
      })
      .filter(Boolean);
    if (textParts.length) {
      return textParts.join("\n");
    }
  }

  const geminiLike = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(geminiLike)) {
    const textParts = geminiLike
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean);
    if (textParts.length) {
      return textParts.join("\n");
    }
  }

  return "";
}

export function buildRawPreview(data) {
  try {
    return JSON.stringify(data).slice(0, 400);
  } catch {
    return "[unserializable response]";
  }
}

async function callChatCompletions(endpoint, apiKey, body, signal) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const errorText = sanitizeErrorDetail(await res.text());
    throw new Error(`API ${res.status}: ${errorText}`);
  }

  return res.json();
}

function extractStreamDelta(data) {
  const delta = data?.choices?.[0]?.delta;
  if (typeof delta?.content === "string") {
    return delta.content;
  }

  if (Array.isArray(delta?.content)) {
    return delta.content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item?.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("");
  }

  if (typeof delta?.reasoning_content === "string") {
    return delta.reasoning_content;
  }

  const text = data?.choices?.[0]?.text;
  if (typeof text === "string") {
    return text;
  }

  return "";
}

async function streamChatCompletions(endpoint, apiKey, body, signal, onDelta) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal
  });

  if (!res.ok) {
    const errorText = sanitizeErrorDetail(await res.text());
    throw new Error(`API ${res.status}: ${errorText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !res.body) {
    return res.json();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamedText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const lines = event
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"));

      for (const line of lines) {
        const dataText = line.slice(5).trim();
        if (!dataText || dataText === "[DONE]") {
          continue;
        }

        let data;
        try {
          data = JSON.parse(dataText);
        } catch {
          continue;
        }

        if (data?.error) {
          const msg = sanitizeErrorDetail(
            data?.error?.message || JSON.stringify(data.error)
          );
          throw new Error(`API error payload: ${msg}`);
        }

        const chunk = extractStreamDelta(data);
        if (chunk) {
          streamedText += chunk;
          onDelta(streamedText);
        }
      }
    }
  }

  return {
    choices: [
      {
        message: {
          content: streamedText
        }
      }
    ]
  };
}

export async function requestChatCompletionsWithFallback(
  endpoint,
  apiKey,
  body,
  signal,
  onDelta
) {
  const streamed = await streamChatCompletions(endpoint, apiKey, body, signal, onDelta);
  const streamedText = extractAssistantText(streamed);
  if (streamedText) {
    return streamed;
  }
  return callChatCompletions(endpoint, apiKey, body, signal);
}

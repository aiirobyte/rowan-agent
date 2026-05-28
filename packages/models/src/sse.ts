export interface ServerSentEvent {
  event: string | null;
  data: string;
}

interface SseDecoderState {
  event: string | null;
  data: string[];
}

function flushSseEvent(state: SseDecoderState): ServerSentEvent | null {
  if (!state.event && state.data.length === 0) {
    return null;
  }

  const event: ServerSentEvent = {
    event: state.event,
    data: state.data.join("\n"),
  };
  state.event = null;
  state.data = [];
  return event;
}

function decodeSseLine(line: string, state: SseDecoderState): ServerSentEvent | null {
  if (line === "") {
    return flushSseEvent(state);
  }

  if (line.startsWith(":")) {
    return null;
  }

  const delimiterIndex = line.indexOf(":");
  const fieldName = delimiterIndex === -1 ? line : line.slice(0, delimiterIndex);
  let value = delimiterIndex === -1 ? "" : line.slice(delimiterIndex + 1);
  if (value.startsWith(" ")) {
    value = value.slice(1);
  }

  if (fieldName === "event") {
    state.event = value;
  } else if (fieldName === "data") {
    state.data.push(value);
  }

  return null;
}

function nextLineBreakIndex(text: string): number {
  const cr = text.indexOf("\r");
  const lf = text.indexOf("\n");
  if (cr === -1) return lf;
  if (lf === -1) return cr;
  return Math.min(cr, lf);
}

function consumeLine(text: string): { line: string; rest: string } | null {
  const index = nextLineBreakIndex(text);
  if (index === -1) return null;

  let nextIndex = index + 1;
  if (text[index] === "\r" && text[nextIndex] === "\n") {
    nextIndex += 1;
  }

  return {
    line: text.slice(0, index),
    rest: text.slice(nextIndex),
  };
}

export async function* iterateSseMessages(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const state: SseDecoderState = { event: null, data: [] };
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error("Request was aborted");
      }

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let consumed = consumeLine(buffer);
      while (consumed) {
        buffer = consumed.rest;
        const event = decodeSseLine(consumed.line, state);
        if (event) yield event;
        consumed = consumeLine(buffer);
      }
    }

    // Flush remaining buffer
    buffer += decoder.decode();
    let consumed = consumeLine(buffer);
    while (consumed) {
      buffer = consumed.rest;
      const event = decodeSseLine(consumed.line, state);
      if (event) yield event;
      consumed = consumeLine(buffer);
    }

    if (buffer.length > 0) {
      const event = decodeSseLine(buffer, state);
      if (event) yield event;
    }

    const trailingEvent = flushSseEvent(state);
    if (trailingEvent) yield trailingEvent;
  } finally {
    reader.releaseLock();
  }
}

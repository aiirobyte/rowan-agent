export class JsonExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonExtractionError";
  }
}

type Candidate = {
  source: string;
  text: string;
};

function preview(text: string): string {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function tryParse(candidate: Candidate): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(candidate.text) };
  } catch (error) {
    return {
      ok: false,
      error: new JsonExtractionError(
        `Invalid JSON in ${candidate.source}: ${error instanceof Error ? error.message : "parse failed"}.`,
      ),
    };
  }
}

function findJsonFences(text: string): Candidate[] {
  const candidates: Candidate[] = [];
  const fencePattern = /```[ \t]*json[^\r\n]*\r?\n?([\s\S]*?)```/gi;

  for (const match of text.matchAll(fencePattern)) {
    const body = match[1]?.trim();
    if (body) {
      candidates.push({ source: "json fenced block", text: body });
    }
  }

  return candidates;
}

function findBalancedCandidate(text: string, start: number): string | undefined {
  const open = text[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : undefined;
  if (!close) {
    return undefined;
  }

  const stack: string[] = [close];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.length === 0 || stack[stack.length - 1] !== char) {
        return undefined;
      }

      stack.pop();
      if (stack.length === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function findBalancedJsonCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = [];

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char !== "{" && char !== "[") {
      continue;
    }

    const candidate = findBalancedCandidate(text, index);
    if (candidate) {
      candidates.push({ source: "balanced JSON fragment", text: candidate });
    }
  }

  return candidates;
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new JsonExtractionError("Cannot extract JSON from an empty string.");
  }

  const completeResponse = tryParse({ source: "complete response", text: trimmed });
  if (completeResponse.ok) {
    return completeResponse.value;
  }

  const candidates: Candidate[] = [...findJsonFences(text), ...findBalancedJsonCandidates(text)];

  let firstParseError: Error | undefined;

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed.ok) {
      return parsed.value;
    }

    firstParseError ??= parsed.error;
  }

  if (firstParseError) {
    throw new JsonExtractionError(
      `${firstParseError.message} Response preview: ${preview(text)}`,
    );
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    throw new JsonExtractionError(
      `${completeResponse.error.message} Response preview: ${preview(text)}`,
    );
  }

  throw new JsonExtractionError(`No JSON object or array found in response: ${preview(text)}`);
}

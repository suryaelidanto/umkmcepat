// AI SDK's `FetchFunction` is `typeof globalThis.fetch` (see
// @ai-sdk/provider-utils). Inlined to avoid adding a direct dependency on
// @ai-sdk/provider-utils.
type FetchFunction = typeof globalThis.fetch;

// 9Router (decolua/9router) is a self-hosted OpenAI-compatible proxy that
// fronts a combo of upstream models. For non-streaming chat completions it
// returns HTTP 200 with `Content-Type: text/event-stream` and a body that is
// a single valid JSON object (possibly with leading whitespace) followed by
// a trailing SSE `data: [DONE]` sentinel, e.g. `<whitespace>{...}\ndata: [DONE]`.
// The Vercel AI SDK rejects this shape with `Invalid JSON response` because
// it sees the trailing non-JSON bytes. This wrapper detects the specific
// shape via balanced-brace parsing, strips the trailing sentinel, and
// rewrites Content-Type to `application/json`. All other responses pass
// through unchanged so genuine SSE streams, valid JSON, and error responses
// stay byte-identical.

// Find the end of the first balanced JSON object starting at `start`.
// Returns the index just past the matching `}`, or -1 if unbalanced.
function findBalancedJsonObjectEnd(text: string, start: number): number {
  if (text[start] !== "{") {
    return -1;
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return -1;
}

// Detects a single JSON object followed by optional stray `}`, whitespace,
// `data:[DONE]`, and optional trailing whitespace. Returns the index where
// the JSON object ends (just past the matching `}`), or -1 if not matched.
function detectNineRouterDefect(body: string): number {
  // Skip leading whitespace.
  const start = body.search(/\S/);
  if (start === -1) {
    return -1;
  }
  const objEnd = findBalancedJsonObjectEnd(body, start);
  if (objEnd === -1) {
    return -1;
  }
  // Allow 0+ stray `}` after the balanced object.
  let i = objEnd;
  while (i < body.length && body[i] === "}") {
    i++;
  }
  // Then require `data: [DONE]` (any whitespace between data: and [DONE]).
  const tail = body.slice(i);
  if (!/^\s*data:\s*\[DONE\]\s*$/.test(tail)) {
    return -1;
  }
  return objEnd;
}

function isNineRouterTextEventStream(value: string | null) {
  return value != null && value.toLowerCase().includes("text/event-stream");
}

export const nineRouterFetch: FetchFunction = async (input, init) => {
  const response = await globalThis.fetch(input, init);

  if (!isNineRouterTextEventStream(response.headers.get("content-type"))) {
    return response;
  }

  const body = await response.text();

  const objEnd = detectNineRouterDefect(body);
  if (objEnd === -1) {
    // Genuine SSE stream or otherwise non-matching body — return a fresh
    // Response so the caller can still read the buffered text.
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  // Trim leading whitespace so the JSON starts at the first `{`.
  const firstNonWs = body.search(/\S/);
  const jsonText = body.slice(firstNonWs, objEnd);

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json");

  return new Response(jsonText, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

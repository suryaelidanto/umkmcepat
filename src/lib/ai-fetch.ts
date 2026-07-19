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

function isRequestStreaming(init?: RequestInit): boolean {
  if (!init || !init.body) {
    return false;
  }
  try {
    let bodyText = "";
    if (typeof init.body === "string") {
      bodyText = init.body;
    } else if (
      init.body instanceof ArrayBuffer ||
      ArrayBuffer.isView(init.body)
    ) {
      bodyText = new TextDecoder().decode(init.body);
    } else {
      bodyText = String(init.body);
    }
    if (bodyText.trim().startsWith("{")) {
      const parsed = JSON.parse(bodyText);
      return parsed.stream === true;
    }
  } catch {
    return String(init.body).includes('"stream":true');
  }
  return false;
}

interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: unknown;
}

function reconstructChatCompletionFromSse(sseText: string): string {
  const lines = sseText.split(/\r?\n/);
  let id = "";
  let created = 0;
  let model = "";
  const choicesMap = new Map<
    number,
    {
      index: number;
      message: {
        role: string;
        content: string;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function: {
            name: string;
            arguments: string;
          };
        }>;
      };
      finish_reason: string | null;
    }
  >();
  let usage: unknown = undefined;

  for (const line of lines) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const dataStr = line.slice(5).trim();
    if (dataStr === "[DONE]") {
      continue;
    }
    try {
      const chunk = JSON.parse(dataStr) as ChatCompletionChunk;
      if (!chunk.id) {
        continue;
      }
      id = chunk.id;
      created = chunk.created;
      model = chunk.model;
      if (chunk.usage) {
        usage = chunk.usage;
      }
      if (chunk.choices && Array.isArray(chunk.choices)) {
        for (const choiceChunk of chunk.choices) {
          const idx = choiceChunk.index ?? 0;
          if (!choicesMap.has(idx)) {
            choicesMap.set(idx, {
              index: idx,
              message: { role: "assistant", content: "" },
              finish_reason: null,
            });
          }
          const existing = choicesMap.get(idx)!;
          if (choiceChunk.finish_reason) {
            existing.finish_reason = choiceChunk.finish_reason;
          }
          const delta = choiceChunk.delta;
          if (delta) {
            if (delta.role) {
              existing.message.role = delta.role;
            }
            if (delta.content) {
              existing.message.content += delta.content;
            }
            if (delta.tool_calls) {
              if (!existing.message.tool_calls) {
                existing.message.tool_calls = [];
              }
              for (const tc of delta.tool_calls) {
                const tcIdx = tc.index ?? 0;
                let existingTc = existing.message.tool_calls[tcIdx];
                if (!existingTc) {
                  existingTc = {
                    id: tc.id,
                    type: tc.type || "function",
                    function: { name: tc.function?.name || "", arguments: "" },
                  };
                  existing.message.tool_calls[tcIdx] = existingTc;
                }
                if (tc.id) {
                  existingTc.id = tc.id;
                }
                if (tc.type) {
                  existingTc.type = tc.type;
                }
                if (tc.function) {
                  if (tc.function.name) {
                    existingTc.function.name = tc.function.name;
                  }
                  if (tc.function.arguments) {
                    existingTc.function.arguments += tc.function.arguments;
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const choices = Array.from(choicesMap.values()).map((choice) => {
    if (choice.message.tool_calls) {
      choice.message.tool_calls = choice.message.tool_calls.filter(Boolean);
      if (choice.message.tool_calls.length === 0) {
        delete choice.message.tool_calls;
      }
    }
    return choice;
  });

  // ponytail: fallback values if SSE chunk stream did not contain any valid choices or data
  return JSON.stringify({
    id: id || "dummy-id",
    object: "chat.completion",
    created: created || Math.floor(Date.now() / 1000),
    model: model || "unknown-model",
    choices,
    ...(usage ? { usage } : {}),
  });
}

export const nineRouterFetch: FetchFunction = async (input, init) => {
  const response = await globalThis.fetch(input, init);

  if (!isNineRouterTextEventStream(response.headers.get("content-type"))) {
    return response;
  }

  const body = await response.text();

  const objEnd = detectNineRouterDefect(body);
  if (objEnd === -1) {
    if (!isRequestStreaming(init) && body.includes("data: {")) {
      const jsonText = reconstructChatCompletionFromSse(body);
      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json");
      return new Response(jsonText, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
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

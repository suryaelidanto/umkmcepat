import { afterEach, describe, expect, it, vi } from "vitest";

import { nineRouterFetch } from "./ai-fetch";

function makeResponse(
  body: string,
  init: ResponseInit & { contentType: string },
) {
  const headers = new Headers(init.headers);
  headers.set("content-type", init.contentType);
  return new Response(body, { ...init, headers });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nineRouterFetch", () => {
  it("repairs the 9Router malformed-SSE-with-valid-JSON bug", async () => {
    const validJson = JSON.stringify({
      id: "chatcmpl-1",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hello" },
          finish_reason: "stop",
        },
      ],
    });
    const malformedBody = `${validJson}}data: [DONE]`;

    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeResponse(malformedBody, {
        status: 200,
        statusText: "OK",
        contentType: "text/event-stream; charset=utf-8",
      }),
    );

    const result = await nineRouterFetch(
      "https://example.com/v1/chat/completions",
      {
        method: "POST",
      },
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("application/json");
    const parsed = await result.json();
    expect(parsed).toEqual(JSON.parse(validJson));
  });

  it("repairs when the trailing JSON has a closing brace glued to the sentinel", async () => {
    // The defect sometimes has an extra `}` glued between the JSON close
    // and `data: [DONE]` (e.g. when 9Router wraps the JSON in a partial SSE
    // envelope). Verify the wrapper still recovers the JSON.
    const validJson = '{"id":"x","object":"chat.completion"}';
    const malformedBody = `${validJson}}}data: [DONE]\n`;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeResponse(malformedBody, {
        status: 200,
        contentType: "text/event-stream",
      }),
    );

    const result = await nineRouterFetch("https://example.com", {});
    expect(result.headers.get("content-type")).toBe("application/json");
    expect(await result.json()).toEqual(JSON.parse(validJson));
  });

  it("passes through genuine multi-event SSE streams unchanged", async () => {
    const genuine = [
      'data: {"id":"1","object":"chat.completion.chunk"}',
      "",
      'data: {"id":"2","object":"chat.completion.chunk"}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeResponse(genuine, {
        status: 200,
        contentType: "text/event-stream",
      }),
    );

    const result = await nineRouterFetch("https://example.com", {});
    expect(result.headers.get("content-type")).toBe("text/event-stream");
    expect(await result.text()).toBe(genuine);
  });

  it("passes through an already-correct application/json response unchanged", async () => {
    const valid = '{"id":"x"}';
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeResponse(valid, {
        status: 200,
        contentType: "application/json",
      }),
    );

    const result = await nineRouterFetch("https://example.com", {});
    expect(result.headers.get("content-type")).toBe("application/json");
    expect(await result.text()).toBe(valid);
  });

  it("passes through error responses unchanged (non-2xx)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeResponse("upstream error", {
        status: 502,
        statusText: "Bad Gateway",
        contentType: "application/json",
      }),
    );

    const result = await nineRouterFetch("https://example.com", {});
    expect(result.status).toBe(502);
    expect(result.statusText).toBe("Bad Gateway");
    expect(result.headers.get("content-type")).toBe("application/json");
    expect(await result.text()).toBe("upstream error");
  });

  it("passes through an empty body unchanged", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeResponse("", {
        status: 200,
        contentType: "text/event-stream",
      }),
    );

    const result = await nineRouterFetch("https://example.com", {});
    expect(result.headers.get("content-type")).toBe("text/event-stream");
    expect(await result.text()).toBe("");
  });

  it("passes through text/event-stream bodies that are not the 9Router defect", async () => {
    // Garbage that looks like SSE framing but is not a JSON object followed by
    // data:[DONE] — must NOT be silently re-tagged.
    const garbage = "data: not-json\n\ndata: [DONE]\n";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeResponse(garbage, {
        status: 200,
        contentType: "text/event-stream",
      }),
    );

    const result = await nineRouterFetch("https://example.com", {});
    expect(result.headers.get("content-type")).toBe("text/event-stream");
    expect(await result.text()).toBe(garbage);
  });

  it("preserves response headers other than content-type on the repair path", async () => {
    const validJson = '{"id":"x"}';
    const headers = new Headers({
      "x-request-id": "abc-123",
      "x-ratelimit-remaining": "42",
      "content-type": "text/event-stream; charset=utf-8",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(`${validJson}data: [DONE]`, { status: 200, headers }),
    );

    const result = await nineRouterFetch("https://example.com", {});
    expect(result.headers.get("content-type")).toBe("application/json");
    expect(result.headers.get("x-request-id")).toBe("abc-123");
    expect(result.headers.get("x-ratelimit-remaining")).toBe("42");
  });

  it("repairs the real 9Router shape: leading whitespace + nested JSON + trailing data:[DONE]", async () => {
    // This is the exact body shape 9Router produces in production:
    //   - leading whitespace (newlines and spaces) before the JSON
    //   - a JSON object with nested objects inside (so a non-greedy regex
    //     would match too early)
    //   - followed by `data: [DONE]\n\n`
    // The wrapper must extract the full balanced JSON, not the first `}`.
    const validJson = JSON.stringify({
      id: "gen-1",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "pong" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        prompt_tokens_details: { cached_tokens: 8 },
      },
    });
    const realBody = `\n         \n\n         \n${validJson}data: [DONE]\n\n`;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeResponse(realBody, {
        status: 200,
        contentType: "text/event-stream",
      }),
    );

    const result = await nineRouterFetch("https://example.com", {});
    expect(result.headers.get("content-type")).toBe("application/json");
    const parsed = await result.json();
    expect(parsed).toEqual(JSON.parse(validJson));
    // The captured JSON must include the full nested object, not stop at
    // the first inner `}`.
    expect(parsed.usage.prompt_tokens_details.cached_tokens).toBe(8);
  });

  it("handles JSON containing escaped quotes inside strings without miscounting braces", async () => {
    // A model that returns a JSON message containing escaped quotes must
    // not confuse the brace balancer.
    const validJson = JSON.stringify({
      id: "x",
      message: { content: 'He said "hi" to {friend}' },
    });
    const body = `${validJson}data: [DONE]`;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeResponse(body, {
        status: 200,
        contentType: "text/event-stream",
      }),
    );

    const result = await nineRouterFetch("https://example.com", {});
    expect(result.headers.get("content-type")).toBe("application/json");
    const parsed = await result.json();
    expect(parsed.message.content).toBe('He said "hi" to {friend}');
  });
});

import { describe, expect, it } from "vitest";

import { BoundedJsonError, readBoundedJson } from "@/lib/bounded-json";

describe("bounded JSON request reader", () => {
  it("parses JSON within the byte budget", async () => {
    const request = new Request("http://localhost/test", {
      body: JSON.stringify({ message: "kopi" }),
      method: "POST",
    });

    await expect(readBoundedJson(request, { maxBytes: 64 })).resolves.toEqual({
      message: "kopi",
    });
  });

  it("rejects declared and streamed bodies over budget", async () => {
    const declared = new Request("http://localhost/test", {
      body: "{}",
      headers: { "Content-Length": "1000" },
      method: "POST",
    });
    const streamed = new Request("http://localhost/test", {
      body: JSON.stringify({ value: "x".repeat(80) }),
      method: "POST",
    });

    await expect(readBoundedJson(declared, { maxBytes: 64 })).rejects.toEqual(
      expect.objectContaining<Partial<BoundedJsonError>>({
        code: "request_body_too_large",
      }),
    );
    await expect(readBoundedJson(streamed, { maxBytes: 64 })).rejects.toEqual(
      expect.objectContaining<Partial<BoundedJsonError>>({
        code: "request_body_too_large",
      }),
    );
  });

  it("classifies malformed JSON without exposing parser internals", async () => {
    const request = new Request("http://localhost/test", {
      body: "{broken",
      method: "POST",
    });

    await expect(readBoundedJson(request, { maxBytes: 64 })).rejects.toEqual(
      expect.objectContaining<Partial<BoundedJsonError>>({
        code: "request_body_invalid_json",
      }),
    );
  });
});

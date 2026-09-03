import { describe, expect, it } from "vitest";

import {
  createRejectedPathResponse,
  resolveRejectedRequestPath,
} from "./malformed-path";

describe("rejected request paths", () => {
  it("detects malformed percent encoding before URL normalization", () => {
    expect(resolveRejectedRequestPath("/p/warung/%E0%A4%A?ref=check")).toEqual({
      origin: "http://localhost",
      pathname: "/p/warung/%E0%A4%A",
    });
  });

  it("rejects encoded dot segments instead of allowing URL normalization", () => {
    expect(
      resolveRejectedRequestPath(
        "/p/buatin-web-jualan-beras-lt1u0g/%2e%2e/secret",
      ),
    ).toEqual({
      origin: "http://localhost",
      pathname: "/p/buatin-web-jualan-beras-lt1u0g/%2e%2e/secret",
    });
  });

  it("rejects double-encoded dot segments", () => {
    expect(resolveRejectedRequestPath("/p/warung/%252e%252e/secret")).not.toBe(
      null,
    );
  });

  it("rejects dot traversal hidden behind an encoded path separator", () => {
    expect(
      resolveRejectedRequestPath("/p/warung/%2e%2e%2fsecret"),
    ).not.toBeNull();
  });

  it("rejects dot traversal hidden behind an encoded backslash separator", () => {
    expect(
      resolveRejectedRequestPath("/p/warung/%2e%2e%5csecret"),
    ).not.toBeNull();
  });

  it("rejects dot traversal after more than two decoding layers", () => {
    expect(
      resolveRejectedRequestPath("/p/warung/%25252e%25252e%25252fsecret"),
    ).not.toBeNull();
  });

  it("rejects malformed encoding revealed by a later decoding layer", () => {
    expect(
      resolveRejectedRequestPath("/p/warung/%25E0%25A4%25A"),
    ).not.toBeNull();
  });

  it("rejects a NUL byte revealed by a later decoding layer", () => {
    expect(resolveRejectedRequestPath("/p/warung/%2500")).not.toBeNull();
  });

  it("passes ordinary encoded paths through", () => {
    expect(resolveRejectedRequestPath("/p/warung/a%2Fb?ref=check")).toBeNull();
  });

  it("returns a not-found response with security headers", async () => {
    const response = createRejectedPathResponse({
      origin: "http://localhost",
      pathname: "/api/projects/project/preview/%E0%A4%A",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox allow-scripts",
    );
    expect(await response.text()).toBe("Not Found");
  });
});

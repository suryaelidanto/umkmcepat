import { describe, expect, it } from "vitest";

import {
  isPrivateHost,
  sanitizeSearchResult,
  truncateResult,
} from "@/lib/websearch";

describe("websearch guards", () => {
  describe("isPrivateHost", () => {
    it("blocks loopback addresses", () => {
      expect(isPrivateHost("127.0.0.1")).toBe(true);
      expect(isPrivateHost("127.1.2.3")).toBe(true);
      expect(isPrivateHost("localhost")).toBe(true);
      expect(isPrivateHost("::1")).toBe(true);
    });

    it("blocks private RFC1918 ranges", () => {
      expect(isPrivateHost("10.0.0.1")).toBe(true);
      expect(isPrivateHost("172.16.0.1")).toBe(true);
      expect(isPrivateHost("192.168.1.1")).toBe(true);
    });

    it("blocks link-local and metadata endpoints", () => {
      expect(isPrivateHost("169.254.169.254")).toBe(true); // cloud metadata
      expect(isPrivateHost("169.254.0.1")).toBe(true);
    });

    it("blocks internal hostnames", () => {
      expect(isPrivateHost("0.0.0.0")).toBe(true);
      expect(isPrivateHost("metadata.google.internal")).toBe(true);
    });

    it("allows public hosts", () => {
      expect(isPrivateHost("example.com")).toBe(false);
      expect(isPrivateHost("1.1.1.1")).toBe(false);
      expect(isPrivateHost("8.8.8.8")).toBe(false);
    });

    it("rejects malformed/empty input as private (fail-closed)", () => {
      expect(isPrivateHost("")).toBe(true);
      expect(isPrivateHost("not a host !!!")).toBe(true);
    });
  });

  describe("sanitizeSearchResult", () => {
    it("strips script, style, and iframe tags and their content", () => {
      const input =
        "<p>hello</p><script>alert(1)</script><style>body{}</style>" +
        '<iframe src="evil"></iframe><p>world</p>';
      const out = sanitizeSearchResult(input);
      expect(out).not.toContain("<script");
      expect(out).not.toContain("<style");
      expect(out).not.toContain("<iframe");
      expect(out).not.toContain("alert(1)");
      expect(out).not.toContain("body{}");
      expect(out).toContain("hello");
      expect(out).toContain("world");
    });

    it("strips remaining HTML tags to plain text", () => {
      const out = sanitizeSearchResult("<a href='x'>link</a><b>bold</b>");
      expect(out).toContain("link");
      expect(out).toContain("bold");
      expect(out).not.toContain("<");
    });

    it("collapses whitespace", () => {
      const out = sanitizeSearchResult("a\n\n\n   b");
      expect(out).toBe("a b");
    });

    it("handles plain text unchanged (modulo whitespace)", () => {
      expect(sanitizeSearchResult("plain text here")).toBe("plain text here");
    });
  });

  describe("truncateResult", () => {
    it("returns short strings unchanged", () => {
      expect(truncateResult("short", 100)).toBe("short");
    });

    it("truncates long strings with a marker", () => {
      const long = "x".repeat(200);
      const out = truncateResult(long, 50);
      expect(out.length).toBeLessThanOrEqual(50);
      expect(out).toContain("[truncated]");
    });

    it("handles zero/negative limits gracefully", () => {
      // A non-positive limit should still return something safe, not throw.
      const out = truncateResult("hello", 0);
      expect(typeof out).toBe("string");
    });
  });
});

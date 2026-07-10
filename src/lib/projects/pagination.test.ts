import { describe, expect, it } from "vitest";

import {
  decodeProjectCursor,
  encodeProjectCursor,
} from "@/lib/projects/pagination";

describe("project pagination cursor", () => {
  it("round-trips the deterministic updatedAt and id keyset", () => {
    const updatedAt = new Date("2026-07-10T01:02:03.000Z");
    const cursor = encodeProjectCursor({ id: "project_1", updatedAt });

    expect(cursor).not.toContain("project_1");
    expect(decodeProjectCursor(cursor)).toEqual({
      id: "project_1",
      updatedAt,
    });
  });

  it("rejects malformed or oversized cursor input", () => {
    expect(decodeProjectCursor("not-a-cursor")).toBeNull();
    expect(decodeProjectCursor("x".repeat(1_000))).toBeNull();
  });
});

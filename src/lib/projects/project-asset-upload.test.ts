import { describe, expect, it } from "vitest";

import { contentTypeFromRef } from "@/lib/projects/project-asset-upload";

describe("contentTypeFromRef", () => {
  it("derives from the byte-detected extension, ignoring client claims", () => {
    expect(contentTypeFromRef("project-asset:local:p1/u/logo/abc.png")).toBe(
      "image/png",
    );
    expect(contentTypeFromRef("project-asset:local:p1/u/logo/abc.jpeg")).toBe(
      "image/jpeg",
    );
    expect(contentTypeFromRef("project-asset:local:p1/u/logo/abc.jpg")).toBe(
      "image/jpeg",
    );
    expect(contentTypeFromRef("project-asset:local:p1/u/logo/abc.webp")).toBe(
      "image/webp",
    );
  });

  it("falls back to octet-stream for unknown/no extension", () => {
    expect(contentTypeFromRef("project-asset:local:p1/u/logo/abc")).toBe(
      "application/octet-stream",
    );
    expect(contentTypeFromRef("project-asset:local:p1/u/logo/abc.exe")).toBe(
      "application/octet-stream",
    );
    expect(contentTypeFromRef("")).toBe("application/octet-stream");
  });
});

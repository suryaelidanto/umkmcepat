import { describe, expect, it } from "vitest";

import {
  MAX_PROJECT_ASSET_BYTES,
  MAX_PROJECT_ASSETS,
  MAX_TURN_IMAGES,
  contentTypeFromRef,
  getProjectAssetUrl,
  isAllowedAssetPurpose,
} from "@/lib/projects/project-asset-upload";

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

describe("asset quotas and purpose validation", () => {
  it("builds the owner-scoped asset route returned after upload", () => {
    expect(getProjectAssetUrl("project/1", "asset/1")).toBe(
      "/api/projects/project%2F1/asset/asset%2F1",
    );
  });

  it("defines reasonable anti-abuse quota constants", () => {
    expect(MAX_PROJECT_ASSETS).toBe(10);
    expect(MAX_PROJECT_ASSET_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_TURN_IMAGES).toBe(6);
  });

  it("allows only approved asset purposes", () => {
    expect(isAllowedAssetPurpose("business-image")).toBe(true);
    expect(isAllowedAssetPurpose("logo")).toBe(true);
    expect(isAllowedAssetPurpose("reference")).toBe(true);
    expect(isAllowedAssetPurpose("malicious")).toBe(false);
    expect(isAllowedAssetPurpose("")).toBe(false);
  });
});

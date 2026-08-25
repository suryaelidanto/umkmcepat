import { describe, expect, it } from "vitest";

import {
  contentTypeFromExt,
  detectImageFormat,
  validateImageUploadBuffer,
} from "./format";

describe("detectImageFormat", () => {
  const bytesOf = (...bytes: number[]) => Buffer.from(bytes);

  it("detects PNG by 8-byte signature", () => {
    const png = bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(detectImageFormat(png)).toBe("png");
    expect(contentTypeFromExt("png")).toBe("image/png");
  });

  it("detects JPEG by 3-byte signature", () => {
    const jpeg = bytesOf(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
    expect(detectImageFormat(jpeg)).toBe("jpeg");
    expect(contentTypeFromExt("jpg")).toBe("image/jpeg");
    expect(contentTypeFromExt("jpeg")).toBe("image/jpeg");
  });

  it("detects WEBP by RIFF/WEBP markers", () => {
    const webp = bytesOf(
      0x52,
      0x49,
      0x46,
      0x46,
      0x00,
      0x00,
      0x00,
      0x00,
      0x57,
      0x45,
      0x42,
      0x50,
    );
    expect(detectImageFormat(webp)).toBe("webp");
    expect(contentTypeFromExt("webp")).toBe("image/webp");
  });

  it("strictly rejects GIF and other non-standard files", () => {
    const gif = Buffer.from("GIF89a...");
    expect(detectImageFormat(gif)).toBeNull();

    const txt = Buffer.from("hello world this is plain text");
    expect(detectImageFormat(txt)).toBeNull();
  });

  it("validates upload buffer size and format", () => {
    const validPng = bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(validateImageUploadBuffer(validPng)).toEqual({
      ok: true,
      format: "png",
      contentType: "image/png",
    });

    const empty = Buffer.alloc(0);
    expect(validateImageUploadBuffer(empty).ok).toBe(false);
  });
});

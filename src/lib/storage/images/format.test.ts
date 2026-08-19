import { describe, expect, it } from "vitest";

import {
  contentTypeFromExt,
  detectImageFormat,
  EXT_CONTENT_TYPE,
} from "@/lib/storage/images/format";

function bytesOf(...values: number[]): Buffer {
  return Buffer.from(values);
}

describe("detectImageFormat", () => {
  it("detects PNG by 8-byte signature", () => {
    const png = bytesOf(
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0x00,
      0x00,
      0x00,
      0x0d,
    );
    expect(detectImageFormat(png)).toBe("png");
  });

  it("detects JPEG by 3-byte signature", () => {
    const jpeg = bytesOf(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
    expect(detectImageFormat(jpeg)).toBe("jpeg");
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
  });

  it("detects GIF87a", () => {
    const gif = bytesOf(0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x00, 0x00);
    expect(detectImageFormat(gif)).toBe("gif");
  });

  it("detects GIF89a", () => {
    const gif = bytesOf(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00);
    expect(detectImageFormat(gif)).toBe("gif");
  });

  it("returns null for a buffer shorter than 12 bytes", () => {
    expect(detectImageFormat(bytesOf(0x89, 0x50))).toBeNull();
  });

  it("returns null for a random buffer that is not a known image format", () => {
    const txt = bytesOf(
      0x48,
      0x65,
      0x6c,
      0x6c,
      0x6f,
      0x20,
      0x57,
      0x6f,
      0x72,
      0x6c,
      0x64,
      0x21,
    );
    expect(detectImageFormat(txt)).toBeNull();
  });
});

describe("contentTypeFromExt", () => {
  it("maps jpg/jpeg to image/jpeg", () => {
    expect(contentTypeFromExt("jpg")).toBe("image/jpeg");
    expect(contentTypeFromExt("jpeg")).toBe("image/jpeg");
  });

  it("maps png, webp, gif to their content types", () => {
    expect(contentTypeFromExt("png")).toBe("image/png");
    expect(contentTypeFromExt("webp")).toBe("image/webp");
    expect(contentTypeFromExt("gif")).toBe("image/gif");
  });

  it("falls back to application/octet-stream for unknown extensions", () => {
    expect(contentTypeFromExt("bin")).toBe("application/octet-stream");
    expect(contentTypeFromExt("")).toBe("application/octet-stream");
  });
});

describe("EXT_CONTENT_TYPE", () => {
  it("has entries for all four formats", () => {
    expect(EXT_CONTENT_TYPE.png).toBe("image/png");
    expect(EXT_CONTENT_TYPE.jpeg).toBe("image/jpeg");
    expect(EXT_CONTENT_TYPE.webp).toBe("image/webp");
    expect(EXT_CONTENT_TYPE.gif).toBe("image/gif");
  });
});

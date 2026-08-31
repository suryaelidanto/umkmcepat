import { describe, expect, it } from "vitest";

import {
  imageUploadAnswerText,
  isImageUploadBoilerplateText,
} from "./image-upload-copy";

describe("image upload boilerplate copy", () => {
  it("builds the fixed answer text for one and many images", () => {
    expect(imageUploadAnswerText(1)).toBe("1 gambar diunggah.");
    expect(imageUploadAnswerText(6)).toBe("6 gambar diunggah.");
  });

  it("recognizes the exact client-generated boilerplate", () => {
    expect(isImageUploadBoilerplateText("1 gambar diunggah.")).toBe(true);
    expect(isImageUploadBoilerplateText("3 gambar diunggah.")).toBe(true);
  });

  it("rejects owner prose that merely looks similar", () => {
    expect(isImageUploadBoilerplateText("1 gambar diunggah")).toBe(false);
    expect(isImageUploadBoilerplateText(" 1 gambar diunggah.")).toBe(false);
    expect(
      isImageUploadBoilerplateText("1 gambar diunggah. tolong baguskan"),
    ).toBe(false);
    expect(isImageUploadBoilerplateText("")).toBe(false);
    expect(isImageUploadBoilerplateText("bengkel saya buka jam 8")).toBe(false);
  });
});

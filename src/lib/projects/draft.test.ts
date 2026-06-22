import { describe, expect, it } from "vitest";

import { createProjectDraft, parseProjectDraft } from "./draft";

describe("project draft", () => {
  it("creates one local-storage draft payload", () => {
    expect(createProjectDraft("  Saya jual bakso  ", "build", 123)).toEqual({
      prompt: "Saya jual bakso",
      mode: "build",
      savedAt: 123,
      continueAfterLogin: false,
    });
  });

  it("keeps auto-continue intent in one draft payload", () => {
    expect(createProjectDraft("Usaha kopi", "discuss", 123, true)).toEqual({
      prompt: "Usaha kopi",
      mode: "discuss",
      savedAt: 123,
      continueAfterLogin: true,
    });
  });

  it("skips empty prompt drafts", () => {
    expect(createProjectDraft("   ", "discuss", 123)).toBeNull();
  });

  it("parses valid drafts and normalizes invalid modes", () => {
    expect(
      parseProjectDraft(
        JSON.stringify({
          prompt: " Usaha laundry ",
          mode: "unknown",
          savedAt: 7,
        }),
      ),
    ).toEqual({
      prompt: "Usaha laundry",
      mode: "discuss",
      savedAt: 7,
      continueAfterLogin: false,
    });
  });

  it("rejects broken or empty drafts", () => {
    expect(parseProjectDraft("not-json")).toBeNull();
    expect(parseProjectDraft(JSON.stringify({ prompt: " " }))).toBeNull();
  });
});

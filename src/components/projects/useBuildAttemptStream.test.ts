import { describe, expect, it } from "vitest";

import { parseBuildStreamEvent } from "./useBuildAttemptStream";

describe("parseBuildStreamEvent", () => {
  it("adds the named SSE event type to parsed payloads", () => {
    expect(parseBuildStreamEvent("progress", '{"label":"spec"}')).toEqual({
      type: "progress",
      label: "spec",
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseBuildStreamEvent("done", "not json")).toBeNull();
  });
});

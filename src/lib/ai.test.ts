import { describe, expect, it } from "vitest";

import { getAiTelemetry } from "./ai";

describe("getAiTelemetry", () => {
  it("keeps user prompts and model outputs out of telemetry", () => {
    expect(getAiTelemetry("project-guided-discuss")).toMatchObject({
      functionId: "project-guided-discuss",
      recordInputs: false,
      recordOutputs: false,
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  enforceGeneratedWritePolicy,
  type WritePolicyInput,
} from "./generated-write-policy";
import { buildAllowList } from "./topology-compiler";

function plan() {
  return {
    schemaVersion: 1,
    revision: 1,
    contractHash: "c",
    contentHash: "",
    appKind: "marketing_site",
    pages: [
      {
        id: "home",
        path: "/",
        title: "Home",
        purpose: "Landing",
        visitorJobIds: ["order"],
        requiredFactIds: ["contact-primary"],
      },
    ],
    navigation: [],
    capabilities: ["static_content", "whatsapp_cta"],
  } as const;
}

function input(over: Partial<WritePolicyInput> = {}): WritePolicyInput {
  return {
    engine: "contract-v1",
    plan: plan() as never,
    filePath: "src/generated/site-shell.tsx",
    content: "<main><h1>Halo</h1></main>",
    ...over,
  };
}

describe("enforceGeneratedWritePolicy", () => {
  it("rejects a write outside the allow-list for contract-v1", () => {
    const result = enforceGeneratedWritePolicy(
      input({ filePath: "src/router.tsx" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes("allow-list"))).toBe(true);
    }
  });

  it("rejects a high-risk literal in generated content", () => {
    const result = enforceGeneratedWritePolicy(
      input({ content: "Hubungi 08123456789." }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes("high-risk"))).toBe(true);
    }
  });

  it("allows a clean write on an allowed path for contract-v1", () => {
    const result = enforceGeneratedWritePolicy(input());
    expect(result.ok).toBe(true);
  });

  it("accepts a plan-derived allow-list path", () => {
    const allow = buildAllowList(plan() as never);
    expect(allow).toContain("src/generated/site-shell.tsx");
  });
});

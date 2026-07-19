import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getGeneratedPublicUrl,
  resolveGeneratedPublicRequest,
} from "@/lib/generated-public-origin";

describe("generated public origin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unsafe production origin configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");

    vi.stubEnv("GENERATED_PUBLIC_ORIGIN", "http://sites.example.com");
    expect(() => getGeneratedPublicUrl("site")).toThrow(
      "GENERATED_PUBLIC_ORIGIN must use HTTPS in production.",
    );

    vi.stubEnv("GENERATED_PUBLIC_ORIGIN", "https://app.example.com");
    expect(() => getGeneratedPublicUrl("site")).toThrow(
      "GENERATED_PUBLIC_ORIGIN must differ from the control-plane origin.",
    );
  });

  it("appends trailing slash for base site URLs", () => {
    vi.stubEnv("GENERATED_PUBLIC_ORIGIN", "https://sites.example.net");
    expect(getGeneratedPublicUrl("warung")).toBe(
      "https://sites.example.net/p/warung/",
    );
  });

  it("redirects control-plane requests and serves only the generated host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("GENERATED_PUBLIC_ORIGIN", "https://sites.example.net");

    expect(
      resolveGeneratedPublicRequest(
        new Request(
          "https://app.example.com/p/warung/assets/app.js?token=secret",
        ),
        "warung",
        ["assets", "app.js"],
      ),
    ).toEqual({
      action: "redirect",
      location: "https://sites.example.net/p/warung/assets/app.js",
    });
    expect(
      resolveGeneratedPublicRequest(
        new Request("https://sites.example.net/p/warung/assets/app.js"),
        "warung",
        ["assets", "app.js"],
      ),
    ).toEqual({ action: "serve" });
  });

  it("keeps disabled public execution fail closed", () => {
    vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "false");

    expect(
      resolveGeneratedPublicRequest(
        new Request("http://localhost:3000/p/warung"),
        "warung",
        [],
      ),
    ).toEqual({ action: "disabled" });
  });
});

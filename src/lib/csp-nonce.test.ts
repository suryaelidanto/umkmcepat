import { AsyncLocalStorage } from "node:async_hooks";

import { describe, expect, it } from "vitest";

// Initialize the global store for unit testing context
globalThis.__nonceStore = new AsyncLocalStorage<string>();

import { generateNonce, getNonce, getNonceStore } from "./csp-nonce";

describe("csp-nonce", () => {
  it("generates a cryptographically secure random alphanumeric base64-encoded string", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[a-zA-Z0-9]+$/);
    expect(nonce.length).toBeGreaterThanOrEqual(16);

    const another = generateNonce();
    expect(nonce).not.toBe(another);
  });

  it("context-plumbs the nonce via AsyncLocalStorage", async () => {
    const nonce = "test-nonce-context-123";
    expect(getNonce()).toBeUndefined();

    await getNonceStore().run(nonce, async () => {
      expect(getNonce()).toBe(nonce);
    });

    expect(getNonce()).toBeUndefined();
  });
});

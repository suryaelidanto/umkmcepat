import { AsyncLocalStorage } from "node:async_hooks";

import { describe, expect, it } from "vitest";

// Initialize the global store for unit testing context
globalThis.__nonceStore = new AsyncLocalStorage<string>();

import {
  generateNonce,
  getNonce,
  getNonceStore,
  resolveNonce,
} from "./csp-nonce";

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

  it("uses the document nonce when the client router has no SSR nonce", () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        querySelector: (selector: string) =>
          selector === 'meta[property="csp-nonce"]'
            ? { getAttribute: () => "document-nonce-123" }
            : null,
      },
    });

    try {
      expect(resolveNonce()).toBe("document-nonce-123");
      expect(resolveNonce("router-nonce-123")).toBe("document-nonce-123");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
    }
  });
});

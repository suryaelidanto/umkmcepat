// Client-safe wrapper for server-side CSP Nonce.
// The AsyncLocalStorage store is initialized on the server startup (server.ts)
// or test startup (csp-nonce.test.ts) to keep browser bundles clean of node:* imports.

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  var __nonceStore: any;
}

export function getNonceStore() {
  if (typeof window !== "undefined") {
    throw new Error("Nonce store is only available on the server side");
  }
  return globalThis.__nonceStore;
}

export function getNonce(): string | undefined {
  if (typeof window !== "undefined") {
    // In the browser, read the nonce from the meta tag injected by TanStack Start
    const meta = document.querySelector('meta[property="csp-nonce"]');
    return meta?.getAttribute("content") || undefined;
  }
  return globalThis.__nonceStore?.getStore();
}

export function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "");
}

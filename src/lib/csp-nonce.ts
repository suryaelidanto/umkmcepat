// Client-safe wrapper for server-side CSP Nonce.

declare global {
  var __nonceStore:
    | {
        getStore: () => string | undefined;
        run: <R>(store: string, callback: () => R) => R;
      }
    | undefined;
}

export function getNonceStore() {
  if (typeof window !== "undefined") {
    throw new Error("Nonce store is only available on the server side");
  }
  const store = globalThis.__nonceStore;
  if (!store) {
    throw new Error("Nonce store is not initialized");
  }
  return store;
}

export function getNonce(): string | undefined {
  if (typeof window !== "undefined") {
    // In the browser, read the nonce from the meta tag injected by TanStack Start
    const meta = document.querySelector('meta[property="csp-nonce"]');
    return meta?.getAttribute("content") || undefined;
  }
  return globalThis.__nonceStore?.getStore();
}

export function resolveNonce(routerNonce?: string): string | undefined {
  if (typeof window !== "undefined") {
    return getNonce() ?? routerNonce;
  }
  return routerNonce;
}

export function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "");
}

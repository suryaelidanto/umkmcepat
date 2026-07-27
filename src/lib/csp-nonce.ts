import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

export const nonceStore = new AsyncLocalStorage<string>();

export function getNonceStore() {
  return nonceStore;
}

export function getNonce() {
  return nonceStore.getStore();
}

export function generateNonce() {
  return randomBytes(16)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "");
}

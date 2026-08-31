import { AsyncLocalStorage } from "node:async_hooks";

import { Auth } from "@auth/core";
import { redirect } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

import type { Session } from "@auth/core/types";

import { authConfig } from "@/lib/auth/auth-config";
import { prisma } from "@/lib/prisma";

declare global {
  var __authStore: AsyncLocalStorage<Map<string, unknown>> | undefined;
}

// Per-request scope for memoizing session resolution. Mirrors the CSP nonce
export function getAuthStore(): AsyncLocalStorage<Map<string, unknown>> {
  if (typeof window !== "undefined") {
    throw new Error("Auth store is only available on the server side");
  }
  return (globalThis.__authStore ??= new AsyncLocalStorage<
    Map<string, unknown>
  >());
}

// Handles every /api/auth/* request (sign-in, callback, sign-out, csrf,
export async function handleAuthRequest(request: Request): Promise<Response> {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto || forwardedHost) {
    const url = new URL(request.url);
    const proto = forwardedProto || url.protocol.replace(":", "");
    const host = forwardedHost || url.host;
    const targetUrl = new URL(url.pathname + url.search, `${proto}://${host}`);

    if (targetUrl.toString() !== request.url) {
      try {
        return await Auth(
          new Request(targetUrl.toString(), request),
          authConfig,
        );
      } catch (error) {
        const { devLog } = await import("@/lib/dev-log");
        devLog("auth", "handleAuthRequest-forwarded-error", {
          error: error instanceof Error ? error.message : String(error),
          stack:
            error instanceof Error ? error.stack?.slice(0, 800) : undefined,
          url: targetUrl.toString(),
        });
        throw error;
      }
    }
  }

  try {
    return await Auth(request, authConfig);
  } catch (error) {
    const { devLog } = await import("@/lib/dev-log");
    devLog("auth", "handleAuthRequest-error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
      url: request.url,
      method: request.method,
    });
    throw error;
  }
}

// Reads the current session for the in-flight request. Preserves the previous
export async function auth(): Promise<Session | null> {
  const { session, banned } = await getAuthState();
  if (banned) {
    return null;
  }
  return session;
}

export type AuthState = {
  session: Session | null;
  banned: boolean;
};

// Resolves the session cookie (without applying the ban filter) and reports
export async function getAuthState(): Promise<AuthState> {
  const store = getAuthStore().getStore();
  if (store) {
    const cached = store.get("authState") as AuthState | undefined;
    if (cached !== undefined) {
      return cached;
    }
    const state = await resolveAuthState();
    store.set("authState", state);
    return state;
  }
  return resolveAuthState();
}

async function resolveAuthState(): Promise<AuthState> {
  const request = getRequest();
  if (!request) {
    return { session: null, banned: false };
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  const reqUrl = new URL(request.url);
  const proto =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : reqUrl.protocol.replace(":", "");
  const host = forwardedHost || reqUrl.host;

  // Reconstruct headers to preserve cookies and proxy/TLS contexts.
  const headers = new Headers(request.headers);
  headers.delete("content-type");
  headers.delete("content-length");
  headers.delete("transfer-encoding");

  if (forwardedProto) {
    headers.set("x-forwarded-proto", forwardedProto);
  }
  if (forwardedHost) {
    headers.set("x-forwarded-host", forwardedHost);
  }

  // Construct the target URL using the public base origin so Auth.js is run
  const publicBaseUrl = `${proto}://${host}`;
  const actionUrl = new URL(
    authConfig.basePath + "/session",
    publicBaseUrl,
  ).toString();

  const response = await Auth(
    new Request(actionUrl, {
      method: "GET",
      headers,
    }),
    authConfig,
  );

  const { status = 200 } = response;
  const data = (await response.json()) as Session | Record<string, never>;

  if (!data || !Object.keys(data).length) {
    return { session: null, banned: false };
  }

  if (status !== 200) {
    return { session: null, banned: false };
  }

  const session = data as Session;
  if (!session.user?.id) {
    return { session: null, banned: false };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { bannedAt: true },
    });

    if (!user) {
      return { session: null, banned: false };
    }

    return { session, banned: Boolean(user.bannedAt) };
  } catch (error) {
    console.warn(
      "[auth] banned check failed - refusing the session until DB is up:",
      error instanceof Error ? error.message : error,
    );
    return { session: null, banned: false };
  }
}

// Defense-in-depth for routes that read User rows directly. auth() already
export async function requireNotBanned(session: Session | null) {
  if (!session?.user?.id) {
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { bannedAt: true },
    });
    if (!user) {
      throw new Error("Account status could not be verified.");
    }
    if (user.bannedAt) {
      throw redirect({ to: "/blocked" });
    }
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.warn(
      "[auth] account status check failed - refusing the request until DB is up:",
      error instanceof Error ? error.message : error,
    );
    throw new Error("Account status could not be verified.");
  }
}

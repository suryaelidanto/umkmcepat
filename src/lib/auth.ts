import { Auth, createActionURL } from "@auth/core";
import { getRequest } from "@tanstack/react-start/server";

import type { Session } from "@auth/core/types";

import { authConfig } from "@/lib/auth-config";

// Handles every /api/auth/* request (sign-in, callback, sign-out, csrf,
// session, providers) via Auth.js Core. Mounted from the auth catch-all
// server route.
export function handleAuthRequest(request: Request): Promise<Response> {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto || forwardedHost) {
    const url = new URL(request.url);
    const proto = forwardedProto || url.protocol.replace(":", "");
    const host = forwardedHost || url.host;
    const targetUrl = new URL(url.pathname + url.search, `${proto}://${host}`);

    if (targetUrl.toString() !== request.url) {
      return Auth(new Request(targetUrl.toString(), request), authConfig);
    }
  }

  return Auth(request, authConfig);
}

// Reads the current session for the in-flight request. Preserves the previous
// `await auth()` call signature so every existing call site is unchanged: the
// request is pulled from TanStack Start's server context instead of being
// passed in. Returns null when there is no valid session.
export async function auth(): Promise<Session | null> {
  const request = getRequest();

  if (!request) {
    return null;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : new URL(request.url).protocol.replace(":", "");

  const url = createActionURL(
    "session",
    proto,
    request.headers,
    process.env,
    authConfig.basePath,
  );

  const response = await Auth(
    new Request(url, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    }),
    authConfig,
  );

  const { status = 200 } = response;
  const data = (await response.json()) as Session | Record<string, never>;

  if (!data || !Object.keys(data).length) {
    return null;
  }

  if (status !== 200) {
    return null;
  }

  return data as Session;
}

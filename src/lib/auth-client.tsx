import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Session } from "@auth/core/types";
import type { ReactNode } from "react";

type SessionStatus = "authenticated" | "loading" | "unauthenticated";

type SessionContextValue = {
  data: Session | null;
  status: SessionStatus;
  refresh: () => Promise<void>;
  update: (data?: Record<string, unknown>) => Promise<Session | null>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function fetchSession(): Promise<Session | null> {
  const response = await fetch("/api/auth/session", {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Session | Record<string, never>;

  if (!data || !Object.keys(data).length) {
    return null;
  }

  return data as Session;
}

// Drop-in replacement for next-auth/react SessionProvider. Fetches the session
// from Auth.js Core's /api/auth/session endpoint and exposes it to useSession.
export function SessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session?: Session | null;
}) {
  const [data, setData] = useState<Session | null>(session ?? null);
  const [status, setStatus] = useState<SessionStatus>(
    session === undefined
      ? "loading"
      : session
        ? "authenticated"
        : "unauthenticated",
  );

  const refresh = useCallback(async () => {
    const next = await fetchSession();
    setData(next);
    setStatus(next ? "authenticated" : "unauthenticated");
  }, []);

  // Mirrors next-auth/react useSession().update: POSTs the patch to Auth.js
  // Core's session endpoint (which re-runs the jwt callback with
  // trigger:"update"), then reflects the refreshed session locally.
  const update = useCallback(async (patch?: Record<string, unknown>) => {
    const csrfToken = await getCsrfToken();
    const body = new URLSearchParams({ csrfToken });
    if (patch) {
      body.set("data", JSON.stringify(patch));
    }

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    let next: Session | null = null;
    if (response.ok) {
      const parsed = (await response.json().catch(() => null)) as
        Session | Record<string, never> | null;
      next = parsed && Object.keys(parsed).length ? (parsed as Session) : null;
    }

    if (!next) {
      next = await fetchSession();
    }

    setData(next);
    setStatus(next ? "authenticated" : "unauthenticated");
    return next;
  }, []);

  useEffect(() => {
    if (session === undefined) {
      void refresh();
    }
  }, [refresh, session]);

  const value = useMemo<SessionContextValue>(
    () => ({ data, refresh, status, update }),
    [data, refresh, status, update],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    return {
      data: null,
      status: "unauthenticated" as SessionStatus,
      update: async () => null,
    };
  }

  return {
    data: context.data,
    status: context.status,
    update: context.update,
  };
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    headers: { accept: "application/json" },
  });
  const data = (await response.json()) as { csrfToken?: string };
  return data.csrfToken ?? "";
}

// Mirrors next-auth/react signIn("google", { callbackUrl }). Auth.js Core's
// sign-in endpoint expects a POST with a CSRF token and redirects the browser
// through the OAuth flow.
export async function signIn(
  provider: string,
  options?: { callbackUrl?: string },
) {
  const callbackUrl = options?.callbackUrl ?? window.location.href;
  const csrfToken = await getCsrfToken();

  const form = document.createElement("form");
  form.method = "post";
  form.action = `/api/auth/signin/${provider}`;

  const fields: Record<string, string> = { callbackUrl, csrfToken };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }

  document.body.append(form);
  form.submit();
}

// Mirrors next-auth/react signOut({ callbackUrl }).
export async function signOut(options?: { callbackUrl?: string }) {
  const callbackUrl = options?.callbackUrl ?? window.location.href;
  const csrfToken = await getCsrfToken();

  const form = document.createElement("form");
  form.method = "post";
  form.action = "/api/auth/signout";

  const fields: Record<string, string> = { callbackUrl, csrfToken };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }

  document.body.append(form);
  form.submit();
}

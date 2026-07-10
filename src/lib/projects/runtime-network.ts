import { getEnv } from "@/lib/config";

export type RuntimeFetchKind = "health" | "proxy";

type RuntimeFetchPolicy = {
  defaultMs: number;
  env: string;
  maxMs: number;
  minMs: number;
};

const RUNTIME_FETCH_POLICIES = {
  health: {
    defaultMs: 2_000,
    env: "PROJECT_RUNTIME_HEALTH_TIMEOUT_MS",
    maxMs: 5_000,
    minMs: 500,
  },
  proxy: {
    defaultMs: 15_000,
    env: "PROJECT_RUNTIME_PROXY_TIMEOUT_MS",
    maxMs: 30_000,
    minMs: 1_000,
  },
} satisfies Record<RuntimeFetchKind, RuntimeFetchPolicy>;

export function getRuntimeFetchTimeoutMs(kind: RuntimeFetchKind) {
  const policy = RUNTIME_FETCH_POLICIES[kind];
  const parsed = Number(getEnv(policy.env));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return policy.defaultMs;
  }

  return Math.min(policy.maxMs, Math.max(policy.minMs, Math.round(parsed)));
}

export async function fetchRuntime(
  input: RequestInfo | URL,
  {
    kind,
    signal,
  }: {
    kind: RuntimeFetchKind;
    signal?: AbortSignal;
  },
) {
  const controller = new AbortController();
  const timeoutMs = getRuntimeFetchTimeoutMs(kind);
  const abortFromCaller = () =>
    controller.abort(signal?.reason ?? new Error("Runtime request canceled."));

  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException(
        `Runtime ${kind} request timed out after ${timeoutMs}ms.`,
        "TimeoutError",
      ),
    );
  }, timeoutMs);

  try {
    return await fetch(input, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

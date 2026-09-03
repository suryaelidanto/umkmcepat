import { definePlugin } from "nitro";

import {
  createRejectedPathResponse,
  resolveRejectedRequestPath,
} from "./malformed-path";

interface FetchApplication {
  fetch: (request: Request) => Response | Promise<Response>;
}

export function installMalformedPathGuard(application: FetchApplication) {
  const fetch = application.fetch;

  application.fetch = (request) => {
    const rejectedPath = resolveRejectedRequestPath(
      getRawRequestTarget(request),
    );

    if (!rejectedPath) {
      return fetch(request);
    }

    return createRejectedPathResponse(rejectedPath);
  };
}

function getRawRequestTarget(request: Request) {
  const runtime = (request as Request & { runtime?: unknown }).runtime;
  if (
    !isRecord(runtime) ||
    !isRecord(runtime.node) ||
    !isRecord(runtime.node.req)
  ) {
    return request.url;
  }

  return typeof runtime.node.req.url === "string"
    ? runtime.node.req.url
    : request.url;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default definePlugin((nitroApp) => {
  installMalformedPathGuard(nitroApp);
});

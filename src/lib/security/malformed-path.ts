import {
  applySecurityHeaders,
  isMalformedPathEncoding,
} from "../security-headers";

const MAX_PATH_DECODING_DEPTH = 8;

export interface RejectedRequestPath {
  origin: string;
  pathname: string;
}

export function resolveRejectedRequestPath(requestTarget: string) {
  const pathname = extractRawPathname(requestTarget);

  if (!pathname) {
    return { origin: "", pathname: "/" } satisfies RejectedRequestPath;
  }

  const origin = resolveRequestOrigin(requestTarget);

  if (
    isMalformedPathEncoding(pathname) ||
    containsUnsafeDecodedPath(pathname)
  ) {
    return { origin, pathname } satisfies RejectedRequestPath;
  }

  return null;
}

export function createRejectedPathResponse({
  origin,
  pathname,
}: RejectedRequestPath) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Robots-Tag": "noindex",
  });

  applySecurityHeaders(headers, {
    generatedOrigin: isGeneratedPublicOrigin(origin),
    pathname,
  });

  return new Response("Not Found", { status: 404, headers });
}

function extractRawPathname(requestTarget: string) {
  const targetWithoutQuery = requestTarget.split(/[?#]/u, 1)[0];

  if (targetWithoutQuery.startsWith("/")) {
    return targetWithoutQuery || "/";
  }

  const schemeSeparator = targetWithoutQuery.indexOf("://");

  if (schemeSeparator < 1) {
    return null;
  }

  const pathStart = targetWithoutQuery.indexOf("/", schemeSeparator + 3);
  return pathStart === -1 ? "/" : targetWithoutQuery.slice(pathStart);
}

function resolveRequestOrigin(requestTarget: string) {
  try {
    return new URL(requestTarget, "http://localhost").origin;
  } catch {
    return "";
  }
}

function containsUnsafeDecodedPath(pathname: string) {
  let decoded = pathname;

  for (let depth = 0; depth < MAX_PATH_DECODING_DEPTH; depth += 1) {
    if (
      decoded.includes("\u0000") ||
      decoded.split(/[\\/]/u).some(isDotSegment)
    ) {
      return true;
    }

    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return true;
    }

    if (next === decoded) {
      return false;
    }

    decoded = next;
  }

  return true;
}

function isDotSegment(segment: string) {
  return segment === "." || segment === "..";
}

function isGeneratedPublicOrigin(origin: string) {
  const configuredOrigin = process.env.GENERATED_PUBLIC_ORIGIN?.trim();

  if (!configuredOrigin) {
    return false;
  }

  try {
    return new URL(configuredOrigin).origin === origin;
  } catch {
    return false;
  }
}

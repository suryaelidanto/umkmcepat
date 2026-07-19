import { getEnv, isGeneratedPublicExecutionEnabled } from "@/lib/config";

export type GeneratedPublicRequestResolution =
  | { action: "disabled" }
  | { action: "redirect"; location: string }
  | { action: "serve" };

export function getGeneratedPublicUrl(
  slug: string,
  pathSegments: string[] = [],
) {
  const publicPath = createGeneratedPublicPath(slug, pathSegments);
  const origin = getGeneratedPublicOrigin();

  return origin ? new URL(publicPath, origin).toString() : publicPath;
}

export function resolveGeneratedPublicRequest(
  request: Request,
  slug: string,
  pathSegments: string[],
): GeneratedPublicRequestResolution {
  if (!isGeneratedPublicExecutionEnabled()) {
    return { action: "disabled" };
  }

  const origin = getGeneratedPublicOrigin();

  if (!origin) {
    return { action: "serve" };
  }

  if (new URL(request.url).origin === origin) {
    return { action: "serve" };
  }

  return {
    action: "redirect",
    location: new URL(
      createGeneratedPublicPath(slug, pathSegments),
      origin,
    ).toString(),
  };
}

function getGeneratedPublicOrigin() {
  const raw = getEnv("GENERATED_PUBLIC_ORIGIN").trim();

  if (!raw) {
    if (
      process.env.NODE_ENV === "production" &&
      isGeneratedPublicExecutionEnabled()
    ) {
      throw new Error(
        "GENERATED_PUBLIC_ORIGIN is required when public execution is enabled in production.",
      );
    }

    return null;
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("GENERATED_PUBLIC_ORIGIN must be a valid absolute URL.");
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(
      "GENERATED_PUBLIC_ORIGIN cannot include credentials, a path, query, or fragment.",
    );
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("GENERATED_PUBLIC_ORIGIN must use HTTPS in production.");
  }

  const controlPlaneRaw =
    getEnv("NEXT_PUBLIC_APP_URL") || getEnv("NEXTAUTH_URL");

  if (controlPlaneRaw) {
    let controlPlaneOrigin: string;

    try {
      controlPlaneOrigin = new URL(controlPlaneRaw).origin;
    } catch {
      throw new Error("Control-plane public URL must be a valid absolute URL.");
    }

    if (controlPlaneOrigin === url.origin) {
      throw new Error(
        "GENERATED_PUBLIC_ORIGIN must differ from the control-plane origin.",
      );
    }
  }

  return url.origin;
}

function createGeneratedPublicPath(slug: string, pathSegments: string[]) {
  return `/p/${encodePathSegment(slug, "slug")}${
    pathSegments.length
      ? `/${pathSegments
          .map((segment) => encodePathSegment(segment, "path"))
          .join("/")}`
      : "/"
  }`;
}

function encodePathSegment(value: string, kind: "path" | "slug") {
  if (
    !value ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new Error(`Generated public ${kind} segment is invalid.`);
  }

  return encodeURIComponent(value);
}

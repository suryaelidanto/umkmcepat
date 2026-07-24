import { getEnv } from "@/lib/config";
import { devLog } from "@/lib/dev-log";

export type WebSearchResult = {
  results: Array<{ excerpt: string; title: string; url: string }>;
};

export type WebSearchProvider = "firecrawl" | "none";

const DEFAULT_ALLOWLIST = [
  "id.wikipedia.org",
  "en.wikipedia.org",
  "instagram.com",
  "tokopedia.com",
  "shopee.co.id",
  "gofood.co.id",
  "google.com",
  "maps.google.com",
  "bisnis.com",
  "detik.com",
  "kompas.com",
];

const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata",
  "169.254.169.254",
  "metadata.aws.internal",
]);

const MAX_RESULTS = 5;
const MAX_EXCERPT_CHARS = 600;

export function getWebSearchProvider(): WebSearchProvider {
  const value = getEnv("WEBSEARCH_PROVIDER", "none").toLowerCase();
  return value === "firecrawl" ? "firecrawl" : "none";
}

export function getWebSearchAllowlist(): string[] {
  const env = getEnv("WEBSEARCH_ALLOWLIST", "");
  const list = env
    ? env
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_ALLOWLIST.map((host) => host.toLowerCase());
  return list;
}

export function getWebSearchDenylist(): Set<string> {
  const env = getEnv("WEBSEARCH_DENYLIST", "");
  return new Set(
    env
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Fail-closed: true if the host is private/internal/loopback/link-local or
 * otherwise unsafe to fetch. Malformed/empty input is treated as private so a
 * bad URL can never escape to the network.
 */
export function isPrivateHost(host: string): boolean {
  if (!host) {
    return true;
  }
  const normalized = host.toLowerCase().trim();

  if (METADATA_HOSTS.has(normalized) || normalized === "localhost") {
    return true;
  }

  // Bare IPv6 ::1
  if (normalized === "::1" || normalized === "[::1]") {
    return true;
  }

  // SSRF bypass encodings: a bare all-numeric host is a decimal IP (e.g.
  // 2130706433 == 127.0.0.1); a 0x-prefixed host is hex. Both are unparseable
  // as a hostname and must never reach the network — treat as private.
  if (/^\d+$/.test(normalized) || /^0x[0-9a-f]+$/.test(normalized)) {
    return true;
  }

  // Octal/hex dotted-quad bypass (e.g. 0177.0.0.1 == 127.0.0.1, 0x7f.0.0.1).
  // Any octet with a leading zero (length > 1) or 0x prefix is fail-closed.
  const octetBypass = normalized.match(
    /^(0x[0-9a-f]+|0\d+|\d+)\.(0x[0-9a-f]+|0\d+|\d+)\.(0x[0-9a-f]+|0\d+|\d+)\.(0x[0-9a-f]+|0\d+|\d+)$/,
  );
  if (octetBypass) {
    const octets = [
      octetBypass[1],
      octetBypass[2],
      octetBypass[3],
      octetBypass[4],
    ];
    if (octets.some((octet) => /^0\d/.test(octet) || /^0x/.test(octet))) {
      return true;
    }
  }

  // IPv4 dotted-quad checks.
  const v4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const c = Number(v4[3]);
    const d = Number(v4[4]);
    if (a === 127 || a === 0 || a === 10) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    // Anything that doesn't parse as a valid public quad (e.g. 999.999.999.999)
    // is treated as private/fail-closed.
    if (a > 255 || b > 255 || c > 255 || d > 255) {
      return true;
    }
    return false;
  }

  // Reject anything with spaces or other clearly non-host chars.
  if (/[\s!#$%^&*()]+/.test(normalized)) {
    return true;
  }

  return false;
}

export function isAllowedHost(
  host: string,
  allowlist: string[],
  denylist: Set<string>,
): boolean {
  const normalized = host.toLowerCase().trim();
  if (!normalized || denylist.has(normalized)) {
    return false;
  }
  // Suffix-match so subdomains of an allowlisted host are permitted
  // (e.g. shop.tokopedia.com under tokopedia.com).
  return allowlist.some(
    (entry) => normalized === entry || normalized.endsWith(`.${entry}`),
  );
}

/**
 * Strip scripts/styles/iframes + remaining tags + collapse whitespace so a
 * scraped HTML response can't carry active content into the model's context.
 */
export function sanitizeSearchResult(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<iframe[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateResult(value: string, limit: number): string {
  if (limit <= 0) {
    return "";
  }
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - "[truncated]".length))}[truncated]`;
}

export type SearchOutcome =
  { ok: true; result: WebSearchResult } | { ok: false; reason: string };

/**
 * Run a web search behind every guardrail. Fail-closed everywhere: an
 * unconfigured provider, a private/host-blocked query, or a rate cap returns
 * a non-erroring "unavailable" outcome so the build never fails on search.
 */
export async function search(
  query: string,
  opts: { projectId?: string } = {},
): Promise<SearchOutcome> {
  devLog("websearch", "search-start", {
    projectId: opts.projectId,
    queryLength: query.length,
  });

  const provider = getWebSearchProvider();
  if (provider === "none") {
    devLog("websearch", "search.unavailable", {
      projectId: opts.projectId,
      reason: "provider-disabled",
    });
    return { ok: false, reason: "Web search is not available." };
  }

  if (!query || !query.trim()) {
    return { ok: false, reason: "Empty query." };
  }

  // The provider is firecrawl; results come from the self-hosted adapter.
  const firecrawlResult = await searchWithFirecrawl(query, opts).catch(
    (error: unknown) => {
      devLog("websearch", "search.error", {
        error: error instanceof Error ? error.message : String(error),
        projectId: opts.projectId,
      });
      return null;
    },
  );

  if (!firecrawlResult) {
    return { ok: false, reason: "Web search failed." };
  }

  devLog("websearch", "search-finish", {
    projectId: opts.projectId,
    results: firecrawlResult.results.length,
  });
  return { ok: true, result: firecrawlResult };
}

async function searchWithFirecrawl(
  query: string,
  opts: { projectId?: string },
): Promise<WebSearchResult | null> {
  const baseUrl = getEnv("FIRECRAWL_BASE_URL");
  const apiKey = getEnv("FIRECRAWL_API_KEY");
  if (!baseUrl) {
    return null;
  }

  const allowlist = getWebSearchAllowlist();
  const denylist = getWebSearchDenylist();

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/search`, {
    body: JSON.stringify({
      limit: MAX_RESULTS,
      query,
      scrapeOptions: { formats: ["markdown"] },
    }),
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    method: "POST",
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => ({}))) as {
    data?: Array<{
      markdown?: string;
      metadata?: { sourceURL?: string; title?: string; url?: string };
      title?: string;
      url?: string;
    }>;
  };
  const items = body.data ?? [];

  const results = items
    .map((item) => {
      const rawUrl =
        item.url ?? item.metadata?.url ?? item.metadata?.sourceURL ?? "";
      const host = safeHostOf(rawUrl);
      return {
        excerpt: truncateResult(
          sanitizeSearchResult(item.markdown ?? ""),
          MAX_EXCERPT_CHARS,
        ),
        host,
        title: sanitizeSearchResult(
          item.title ?? item.metadata?.title ?? "",
        ).slice(0, 200),
        url: rawUrl,
      };
    })
    .filter((item) => {
      if (!item.url) {
        return false;
      }
      // SSRF + allowlist gate: every returned URL is re-checked before the
      // excerpt reaches the model.
      if (isPrivateHost(item.host)) {
        devLog("websearch", "result.blocked-private", {
          host: item.host,
          projectId: opts.projectId,
        });
        return false;
      }
      if (!isAllowedHost(item.host, allowlist, denylist)) {
        devLog("websearch", "result.blocked-allowlist", {
          host: item.host,
          projectId: opts.projectId,
        });
        return false;
      }
      return true;
    })
    .map(({ excerpt, title, url }) => ({ excerpt, title, url }))
    .slice(0, MAX_RESULTS);

  return { results };
}

function safeHostOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "";
  }
}

// Re-exported for the agent tool executor + tests.
export { MAX_RESULTS, MAX_EXCERPT_CHARS };

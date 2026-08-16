import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTRIBUTORS_CACHE_TTL_MS,
  getCommunityContributors,
} from "@/lib/community-contributors";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const statsContributors = [
  {
    total: 10,
    author: {
      login: "suryaelidanto",
      avatar_url: "https://avatars.example/u/1?v=4",
      html_url: "https://github.com/suryaelidanto",
    },
    weeks: [{ w: 1_750_000_000, a: 3, d: 1, c: 2 }],
  },
];

const fallbackContributors = [
  {
    login: "suryaelidanto",
    contributions: 5,
    avatar_url: "https://avatars.example/u/1?v=4",
    html_url: "https://github.com/suryaelidanto",
  },
];

const statsContributorsWithBots = [
  {
    total: 100,
    author: {
      login: "blacksmith-sh[bot]",
      type: "Bot",
      avatar_url: "https://avatars.example/bot/blacksmith?v=4",
      html_url: "https://github.com/apps/blacksmith-sh",
    },
    weeks: [{ w: 1_750_000_000, a: 0, d: 0, c: 100 }],
  },
  {
    total: 90,
    author: {
      login: "github-actions[bot]",
      avatar_url: "https://avatars.example/bot/actions?v=4",
      html_url: "https://github.com/apps/github-actions",
    },
    weeks: [{ w: 1_750_000_000, a: 0, d: 0, c: 90 }],
  },
  {
    total: 80,
    author: {
      login: "automation-account",
      type: "Bot",
      avatar_url: "https://avatars.example/bot/automation?v=4",
      html_url: "https://github.com/automation-account",
    },
    weeks: [{ w: 1_750_000_000, a: 0, d: 0, c: 80 }],
  },
  {
    total: 70,
    author: {
      login: "Claude",
      avatar_url: "https://avatars.example/bot/claude?v=4",
      html_url: "https://github.com/claude",
    },
    weeks: [{ w: 1_750_000_000, a: 0, d: 0, c: 70 }],
  },
  {
    total: 1,
    author: {
      login: "suryaelidanto",
      avatar_url: "https://avatars.example/u/1?v=4",
      html_url: "https://github.com/suryaelidanto",
    },
    weeks: [{ w: 1_750_000_000, a: 1, d: 0, c: 1 }],
  },
];

const fallbackContributorsWithBots = [
  {
    login: "blacksmith-sh[bot]",
    type: "Bot",
    contributions: 100,
    avatar_url: "https://avatars.example/bot/blacksmith?v=4",
    html_url: "https://github.com/apps/blacksmith-sh",
  },
  {
    login: "github-actions[bot]",
    contributions: 90,
    avatar_url: "https://avatars.example/bot/actions?v=4",
    html_url: "https://github.com/apps/github-actions",
  },
  {
    login: "automation-account",
    type: "Bot",
    contributions: 80,
    avatar_url: "https://avatars.example/bot/automation?v=4",
    html_url: "https://github.com/automation-account",
  },
  {
    login: "Claude",
    contributions: 70,
    avatar_url: "https://avatars.example/bot/claude?v=4",
    html_url: "https://github.com/claude",
  },
  {
    login: "suryaelidanto",
    contributions: 1,
    avatar_url: "https://avatars.example/u/1?v=4",
    html_url: "https://github.com/suryaelidanto",
  },
];

describe("getCommunityContributors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns cards from /stats/contributors with a timeout signal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(statsContributors));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCommunityContributors();

    expect(result).toHaveLength(1);
    expect(result[0].login).toBe("suryaelidanto");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("filters named and API-declared bots from stats contributors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(statsContributorsWithBots)),
    );

    const result = await getCommunityContributors();

    expect(result.map((contributor) => contributor.login)).toEqual([
      "suryaelidanto",
    ]);
  });

  it("falls back to /contributors when stats returns 202", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 202))
      .mockResolvedValueOnce(jsonResponse(fallbackContributors));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCommunityContributors();

    expect(result).toHaveLength(1);
    expect(result[0].totalCommits).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("filters named and API-declared bots from fallback contributors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 202))
      .mockResolvedValueOnce(jsonResponse(fallbackContributorsWithBots));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCommunityContributors();

    expect(result.map((contributor) => contributor.login)).toEqual([
      "suryaelidanto",
    ]);
  });

  it("returns [] when GitHub fails or times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );

    const result = await getCommunityContributors();

    expect(result).toEqual([]);
  });
});

describe("getCommunityContributorsCached", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // The module holds a module-level TTL cache; load a fresh instance per test
  // so cache state never leaks between tests.
  async function loadFreshModule() {
    vi.resetModules();
    return await import("@/lib/community-contributors");
  }

  it("serves the second call from cache without refetching", async () => {
    const { getCommunityContributorsCached } = await loadFreshModule();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(statsContributors));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getCommunityContributorsCached();
    const second = await getCommunityContributorsCached();

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL elapses", async () => {
    vi.useFakeTimers();
    const { getCommunityContributorsCached } = await loadFreshModule();
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse(statsContributors));
    vi.stubGlobal("fetch", fetchMock);

    await getCommunityContributorsCached();
    vi.advanceTimersByTime(CONTRIBUTORS_CACHE_TTL_MS + 1_000);
    await getCommunityContributorsCached();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

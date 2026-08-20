type GithubStatsContributor = {
  total: number;
  author: {
    login: string;
    type?: string;
    avatar_url: string;
    html_url: string;
  };
  weeks: Array<{
    w: number;
    a: number;
    d: number;
    c: number;
  }>;
};

type GithubContributor = {
  login: string;
  type?: string;
  contributions: number;
  avatar_url: string;
  html_url: string;
};

export type ContributionWeek = {
  label: string;
  monthLabel: string;
  commits: number;
  additions: number;
  deletions: number;
};

export type ContributorCard = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  totalCommits: number;
  recentCommits: number;
  recentAdditions: number;
  recentDeletions: number;
  weeks?: ContributionWeek[];
};

const STATS_URL =
  "https://api.github.com/repos/suryaelidanto/umkmcepat/stats/contributors";
const CONTRIBUTORS_URL =
  "https://api.github.com/repos/suryaelidanto/umkmcepat/contributors";
const RECENT_WEEK_COUNT = 12;
const FETCH_TIMEOUT_MS = 2_000;
export const CONTRIBUTORS_CACHE_TTL_MS = 15 * 60_000;

let contributorsCache: { at: number; value: ContributorCard[] } | null = null;
let contributorsInFlight: Promise<ContributorCard[]> | null = null;

function getGithubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "umkmcepat.com",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
}

function formatWeek(timestamp: number) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp * 1000));
}

function formatMonth(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function formatCompact(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString("id-ID", {
      maximumFractionDigits: 1,
    })}k`;
  }

  return value.toLocaleString("id-ID");
}

function isBotContributor(login: string, type?: string) {
  const normalizedLogin = login.trim().toLowerCase();
  return (
    normalizedLogin === "claude" ||
    type?.trim().toLowerCase() === "bot" ||
    normalizedLogin.endsWith("[bot]")
  );
}

async function getTopContributors(): Promise<ContributorCard[]> {
  try {
    // GitHub computes /stats/contributors lazily and often returns 202 with an
    const response = await fetch(STATS_URL, {
      headers: getGithubHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 202 || !response.ok) {
      return [];
    }
    const body = (await response.json()) as GithubStatsContributor[];
    const stats = Array.isArray(body) ? body : [];

    if (stats.length === 0) {
      return [];
    }

    return stats
      .filter(
        (contributor) =>
          !isBotContributor(contributor.author.login, contributor.author.type),
      )
      .map((contributor) => {
        const weeks = contributor.weeks
          .slice(-RECENT_WEEK_COUNT)
          .map((week) => ({
            label: formatWeek(week.w),
            monthLabel: formatMonth(week.w),
            commits: week.c,
            additions: week.a,
            deletions: week.d,
          }));
        const recentCommits = weeks.reduce(
          (total, week) => total + week.commits,
          0,
        );
        const recentAdditions = weeks.reduce(
          (total, week) => total + week.additions,
          0,
        );
        const recentDeletions = weeks.reduce(
          (total, week) => total + week.deletions,
          0,
        );

        return {
          login: contributor.author.login,
          avatarUrl: `${contributor.author.avatar_url}&s=104`,
          profileUrl: contributor.author.html_url,
          totalCommits: contributor.total,
          recentCommits,
          recentAdditions,
          recentDeletions,
          weeks,
        };
      })
      .sort(
        (left, right) =>
          right.recentCommits - left.recentCommits ||
          right.totalCommits - left.totalCommits,
      )
      .slice(0, 3);
  } catch {
    return [];
  }
}

// Fallback when /stats/contributors is stuck on GitHub's lazy 202: the plain
async function getContributorsFallback(): Promise<ContributorCard[]> {
  try {
    const response = await fetch(CONTRIBUTORS_URL, {
      headers: getGithubHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as GithubContributor[];
    if (!Array.isArray(body)) {
      return [];
    }
    return body
      .filter(
        (contributor) => !isBotContributor(contributor.login, contributor.type),
      )
      .map((contributor) => ({
        login: contributor.login,
        avatarUrl: `${contributor.avatar_url}&s=104`,
        profileUrl: contributor.html_url,
        totalCommits: contributor.contributions,
        recentCommits: contributor.contributions,
        recentAdditions: 0,
        recentDeletions: 0,
      }))
      .sort((left, right) => right.totalCommits - left.totalCommits)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function getCommunityContributors(): Promise<ContributorCard[]> {
  const stats = await getTopContributors();
  return stats.length > 0 ? stats : getContributorsFallback();
}

// TTL cache with single-flight: concurrent callers share one GitHub fetch and
export function getCommunityContributorsCached(): Promise<ContributorCard[]> {
  const now = Date.now();
  if (
    contributorsCache &&
    now - contributorsCache.at < CONTRIBUTORS_CACHE_TTL_MS
  ) {
    return Promise.resolve(contributorsCache.value);
  }
  if (!contributorsInFlight) {
    contributorsInFlight = getCommunityContributors()
      .then((value) => {
        contributorsCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        contributorsInFlight = null;
      });
  }
  return contributorsInFlight;
}

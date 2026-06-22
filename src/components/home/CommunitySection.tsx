import Image from "next/image";

import { SponsorTable } from "@/components/home/SponsorTable";

type GithubStatsContributor = {
  total: number;
  author: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  weeks: Array<{
    w: number;
    c: number;
  }>;
};

type ContributionWeek = {
  label: string;
  commits: number;
};

type ContributorCard = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  totalCommits: number;
  recentCommits: number;
  weeks: ContributionWeek[];
};

const STATS_URL =
  "https://api.github.com/repos/suryaelidanto/umkmcepat/stats/contributors";
const ALL_CONTRIBUTORS_URL =
  "https://github.com/suryaelidanto/umkmcepat/graphs/contributors";
const REPOSITORY_URL = "https://github.com/suryaelidanto/umkmcepat";
const RECENT_WEEK_COUNT = 12;

const sponsors = [
  {
    name: "Ogya",
    href: "https://zenhosta.com/",
    source: "Zenhosta",
    date: "17 Juni 2026",
    support: "Domain",
    value: "Rp250.000",
  },
];

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

async function getTopContributors(): Promise<ContributorCard[]> {
  try {
    const response = await fetch(STATS_URL, {
      headers: getGithubHeaders(),
      next: { revalidate: 60 * 60 * 6 },
    });

    if (!response.ok) {
      return [];
    }

    const stats = (await response.json()) as GithubStatsContributor[];

    return stats
      .map((contributor) => {
        const weeks = contributor.weeks
          .slice(-RECENT_WEEK_COUNT)
          .map((week) => ({ label: formatWeek(week.w), commits: week.c }));
        const recentCommits = weeks.reduce(
          (total, week) => total + week.commits,
          0,
        );

        return {
          login: contributor.author.login,
          avatarUrl: contributor.author.avatar_url,
          profileUrl: contributor.author.html_url,
          totalCommits: contributor.total,
          recentCommits,
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

function ContributionChart({
  weeks,
  maxCommits,
}: {
  weeks: ContributionWeek[];
  maxCommits: number;
}) {
  const width = 320;
  const height = 112;
  const padding = 12;
  const gap = 6;
  const barWidth =
    (width - padding * 2 - gap * (weeks.length - 1)) / weeks.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Grafik commit 12 minggu terakhir"
      className="mt-spacing-6 h-28 w-full overflow-visible rounded-[20px] border border-surface-warm-white/10 bg-[#101010] p-spacing-4"
    >
      {[0, 0.33, 0.66, 1].map((line) => (
        <line
          key={line}
          x1={padding}
          x2={width - padding}
          y1={padding + line * (height - padding * 2)}
          y2={padding + line * (height - padding * 2)}
          stroke="rgba(252,251,248,0.12)"
          strokeDasharray={line === 1 ? undefined : "4 6"}
        />
      ))}
      {weeks.map((week, index) => {
        const barHeight = maxCommits
          ? Math.max(
              (week.commits / maxCommits) * (height - padding * 2),
              week.commits ? 10 : 4,
            )
          : 4;
        const x = padding + index * (barWidth + gap);
        const y = height - padding - barHeight;

        return (
          <g key={`${week.label}-${week.commits}`} className="group/bar">
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="4"
              fill={week.commits ? "#4f7fff" : "rgba(252,251,248,0.08)"}
              className="transition group-hover/bar:fill-[#78a0ff]"
            />
            <title>{`${week.label}: ${week.commits} commit`}</title>
          </g>
        );
      })}
    </svg>
  );
}

export async function CommunitySection() {
  const contributors = await getTopContributors();
  const maxCommits = Math.max(
    1,
    ...contributors.flatMap((contributor) =>
      contributor.weeks.map((week) => week.commits),
    ),
  );

  return (
    <section className="bg-[#151515] px-4 py-spacing-14 sm:px-spacing-9 lg:px-spacing-10">
      <div className="mx-auto max-w-6xl space-y-spacing-14">
        <div>
          <div className="flex flex-col gap-spacing-5 text-left sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.05em] text-surface-warm-white sm:text-4xl">
                Top contributor
              </h2>
              <p className="mt-spacing-3 text-sm text-surface-warm-white/58">
                Data aktivitas dari GitHub.
              </p>
            </div>
            <div className="flex flex-wrap gap-spacing-3">
              <a
                href={ALL_CONTRIBUTORS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center justify-center rounded-radius-lg border border-surface-warm-white/14 bg-surface-warm-white/8 px-spacing-6 py-spacing-4 text-sm font-semibold text-surface-warm-white transition hover:bg-surface-warm-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white/70"
              >
                Lihat semua kontributor
              </a>
              <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center justify-center rounded-radius-lg border border-surface-warm-white/14 bg-surface-warm-white px-spacing-6 py-spacing-4 text-sm font-semibold text-foreground-primary transition hover:bg-surface-warm-white/86 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white/70"
              >
                Buka GitHub
              </a>
            </div>
          </div>

          {contributors.length ? (
            <div className="mt-spacing-8 grid gap-spacing-5 md:grid-cols-3">
              {contributors.map((contributor, index) => (
                <article
                  key={contributor.login}
                  className="group rounded-[30px] border border-surface-warm-white/12 bg-[#242422] p-spacing-6 text-left shadow-[0_24px_80px_rgba(0,0,0,0.14)] transition hover:bg-[#282826]"
                >
                  <div className="flex items-start justify-between gap-spacing-5">
                    <div className="flex min-w-0 items-center gap-spacing-4">
                      <Image
                        src={contributor.avatarUrl}
                        alt={`Foto profil ${contributor.login}`}
                        width={52}
                        height={52}
                        className="size-[52px] rounded-2xl border border-surface-warm-white/12 bg-surface-warm-white/10"
                        unoptimized
                      />
                      <div className="min-w-0">
                        <a
                          href={contributor.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-lg font-semibold text-surface-warm-white underline decoration-surface-warm-white/24 underline-offset-4 transition hover:decoration-surface-warm-white"
                        >
                          {contributor.login}
                        </a>
                        <p className="mt-spacing-1 text-sm text-surface-warm-white/52">
                          {contributor.totalCommits.toLocaleString("id-ID")}{" "}
                          commit
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-surface-warm-white/10 bg-[#151515] px-spacing-3 py-spacing-2 text-xs font-semibold text-surface-warm-white/72">
                      #{index + 1}
                    </span>
                  </div>

                  <ContributionChart
                    weeks={contributor.weeks}
                    maxCommits={maxCommits}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-spacing-8 rounded-[28px] border border-dashed border-surface-warm-white/14 bg-[#1f1f1d] p-spacing-7 text-sm leading-6 text-surface-warm-white/58">
              Data kontributor belum bisa dibaca. Tambahkan GITHUB_TOKEN di env
              server untuk menaikkan batas akses GitHub API.
            </div>
          )}
        </div>

        <div className="text-left">
          <div className="flex flex-col gap-spacing-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.05em] text-surface-warm-white sm:text-4xl">
                Sponsor
              </h2>
              <p className="mt-spacing-3 text-sm text-surface-warm-white/58">
                Dukungan yang membantu UMKM Cepat jalan.
              </p>
            </div>
            <button
              type="button"
              disabled
              className="w-fit rounded-radius-lg border border-surface-warm-white/14 bg-surface-warm-white/8 px-spacing-6 py-spacing-4 text-sm font-semibold text-surface-warm-white/44"
            >
              Ikut sponsor
            </button>
          </div>

          <SponsorTable sponsors={sponsors} />
        </div>
      </div>
    </section>
  );
}

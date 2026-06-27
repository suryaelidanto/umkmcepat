import Image from "next/image";

import { ScrollReveal } from "@/components/home/ScrollReveal";
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
    a: number;
    d: number;
    c: number;
  }>;
};

type ContributionWeek = {
  label: string;
  monthLabel: string;
  commits: number;
  additions: number;
  deletions: number;
};

type ContributorCard = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  totalCommits: number;
  recentCommits: number;
  recentAdditions: number;
  recentDeletions: number;
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
    donorName: "Ogya",
    brandName: "Zenhosta",
    brandUrl: "https://zenhosta.com/",
    date: "17 Juni 2026",
    support: "Domain",
    value: "Rp250.000",
  },
];

const faqs = [
  {
    question: "Apakah UMKM Cepat benar-benar gratis?",
    answer:
      "Iya. Tujuan awalnya membantu usaha kecil mulai punya website tanpa biaya development.",
  },
  {
    question: "Website saya dibuat oleh AI saja?",
    answer:
      "AI membantu membuat awal website. Kamu tetap bisa mengubah isi, arah, dan hasil akhirnya.",
  },
  {
    question: "Apa data usaha saya aman?",
    answer:
      "Kami hanya meminta informasi yang kamu tulis untuk membuat website. Jangan masukkan password, nomor kartu, atau data rahasia.",
  },
  {
    question: "Siapa yang mengembangkan UMKM Cepat?",
    answer:
      "UMKM Cepat dikembangkan sebagai proyek open source. Daftar kontributor membantu kamu melihat siapa saja yang ikut merawat produk ini.",
  },
  {
    question: "Bagaimana agar hasilnya maksimal?",
    answer:
      "Mulai dari mode Diskusi untuk mematangkan kebutuhan. Kalau arahnya sudah jelas, lanjutkan dengan mode Buat.",
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

function formatMonth(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function formatCompact(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString("id-ID", {
      maximumFractionDigits: 1,
    })}k`;
  }

  return value.toLocaleString("id-ID");
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

function ContributionChart({
  weeks,
  maxCommits,
}: {
  weeks: ContributionWeek[];
  maxCommits: number;
}) {
  const yLabels = [40, 20, 0];

  return (
    <div className="mt-spacing-5 rounded-[14px] border border-surface-warm-white/12 bg-[#0f1218] px-spacing-4 pb-spacing-5 pt-spacing-4">
      <div className="grid grid-cols-[1fr_34px] gap-spacing-3">
        <div className="relative h-28">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-surface-warm-white/12" />
          <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-surface-warm-white/12" />
          <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-surface-warm-white/12" />
          <div className="absolute inset-x-0 bottom-0 border-t border-surface-warm-white/24" />
          <div className="absolute inset-y-0 left-1/4 border-l border-dashed border-surface-warm-white/10" />
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-surface-warm-white/10" />
          <div className="absolute inset-y-0 left-3/4 border-l border-dashed border-surface-warm-white/10" />

          <div className="relative flex h-full items-end gap-spacing-2">
            {weeks.map((week) => {
              const height = maxCommits
                ? Math.max(
                    (week.commits / maxCommits) * 100,
                    week.commits ? 8 : 3,
                  )
                : 3;

              return (
                <div
                  key={`${week.label}-${week.commits}`}
                  className="group/bar relative flex h-full min-w-0 flex-1 items-end"
                >
                  <div
                    className="w-full rounded-t-[3px] bg-[#0d6efd] transition group-hover/bar:bg-[#58a6ff]"
                    style={{ height: `${height}%` }}
                  />
                  <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-10 w-36 -translate-x-1/2 rounded-radius-md bg-surface-warm-white px-spacing-4 py-spacing-3 text-xs text-foreground-primary opacity-0 shadow-[0_12px_34px_rgba(0,0,0,0.28)] transition group-hover/bar:opacity-100">
                    <p className="font-semibold">{week.label}</p>
                    <p className="mt-spacing-1">{week.commits} commit</p>
                    <p className="mt-spacing-1 text-[#0d6efd]">
                      {formatCompact(week.additions)} ++
                    </p>
                    <p className="text-[#ff4d4f]">
                      {formatCompact(week.deletions)} --
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex h-28 flex-col items-start justify-between text-xs text-surface-warm-white/62">
          {yLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>

      <div className="mt-spacing-4 grid grid-cols-3 pl-spacing-4 pr-12 text-xs text-surface-warm-white/50">
        <span>{weeks[0]?.monthLabel}</span>
        <span className="text-center">{weeks[4]?.monthLabel}</span>
        <span className="text-right">{weeks[8]?.monthLabel}</span>
      </div>
    </div>
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
        <ScrollReveal>
          <div>
            <div className="flex flex-col gap-spacing-5 text-left sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.05em] text-surface-warm-white sm:text-4xl">
                  Top kontributor proyek
                </h2>
                <p className="mt-spacing-3 text-sm text-surface-warm-white/58">
                  Dikerjakan terbuka di Github, jadi perkembangannya bisa ikut
                  dilihat.
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
                  Buka Github
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
                          className="size-[52px] rounded-full border border-surface-warm-white/12 bg-surface-warm-white/10"
                          unoptimized
                        />
                        <div className="min-w-0">
                          <a
                            href={contributor.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-lg font-semibold text-[#58a6ff] transition hover:underline"
                          >
                            {contributor.login}
                          </a>
                          <p className="mt-spacing-1 text-xs text-surface-warm-white/58">
                            <span>{contributor.recentCommits} commits</span>
                            <span className="ml-spacing-3 text-[#58a6ff]">
                              {formatCompact(contributor.recentAdditions)} ++
                            </span>
                            <span className="ml-spacing-3 text-[#ff4d4f]">
                              {formatCompact(contributor.recentDeletions)} --
                            </span>
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
                {contributors.length < 3 ? (
                  <a
                    href={REPOSITORY_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-64 flex-col justify-between rounded-[30px] border border-dashed border-surface-warm-white/14 bg-surface-warm-white/[0.035] p-spacing-6 text-left transition hover:bg-surface-warm-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white/70"
                  >
                    <div>
                      <p className="text-lg font-semibold text-surface-warm-white">
                        Ikut bantu proyek ini
                      </p>
                      <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/56">
                        Lihat repo, buka issue, atau kirim pull request kalau
                        ada yang ingin kamu rapikan.
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-surface-warm-white underline decoration-surface-warm-white/24 underline-offset-4">
                      Buka Github
                    </span>
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="mt-spacing-8 rounded-[28px] border border-dashed border-surface-warm-white/14 bg-[#1f1f1d] p-spacing-7 text-sm leading-6 text-surface-warm-white/58">
                Data kontributor belum bisa dibaca. Tambahkan GITHUB_TOKEN di
                env server untuk menaikkan batas akses Github API.
              </div>
            )}
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="text-left">
            <div className="flex flex-col gap-spacing-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.05em] text-surface-warm-white sm:text-4xl">
                  Sponsor
                </h2>
                <p className="mt-spacing-3 text-sm text-surface-warm-white/58">
                  Terima kasih sudah bantu UMKM Cepat tetap 100% gratis.
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
        </ScrollReveal>

        <ScrollReveal>
          <div className="text-left">
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-surface-warm-white sm:text-4xl">
              Pertanyaan yang sering muncul
            </h2>
            <div className="mt-spacing-8 divide-y divide-surface-warm-white/10 overflow-hidden rounded-[24px] border border-surface-warm-white/10 bg-[#1f1f1d]">
              {faqs.map((faq) => (
                <details key={faq.question} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-spacing-6 px-spacing-6 py-spacing-5 text-base font-semibold text-surface-warm-white outline-none transition hover:bg-surface-warm-white/[0.04] focus-visible:bg-surface-warm-white/[0.04] [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-surface-warm-white/12 text-surface-warm-white/62 transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="px-spacing-6 pb-spacing-6 text-sm leading-6 text-surface-warm-white/58">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

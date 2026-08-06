import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { ScrollReveal } from "@/components/home/ScrollReveal";
import { SponsorTable } from "@/components/home/SponsorTable";
import { Image } from "@/components/ui/image";
import {
  type ContributionWeek,
  type ContributorCard,
  formatCompact,
} from "@/lib/community-contributors";
import { fetchJson } from "@/lib/query-client";

const ALL_CONTRIBUTORS_URL =
  "https://github.com/suryaelidanto/umkmcepat/graphs/contributors";
const REPOSITORY_URL = "https://github.com/suryaelidanto/umkmcepat";

const CONTRIBUTOR_QUERY_OPTIONS = {
  staleTime: 15 * 60_000,
  gcTime: 15 * 60_000,
  refetchOnWindowFocus: false,
} as const;

function useCommunityContributors() {
  return useQuery({
    queryKey: ["community", "contributors"],
    queryFn: () => fetchJson<ContributorCard[]>("/api/community/contributors"),
    enabled: typeof window !== "undefined",
    ...CONTRIBUTOR_QUERY_OPTIONS,
  });
}

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
      "Iya, semua fitur bisa kamu pakai tanpa biaya. Cukup daftar dan mulai buat websitemu.",
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

function MiniChart({
  weeks,
  maxCommits,
}: {
  weeks: ContributionWeek[];
  maxCommits: number;
}) {
  return (
    <div className="mt-spacing-5 flex h-16 items-end gap-spacing-1.5">
      {weeks.map((week) => {
        const height = maxCommits
          ? Math.max((week.commits / maxCommits) * 100, week.commits ? 8 : 3)
          : 3;
        return (
          <div
            key={`${week.label}-${week.commits}`}
            className="group/bar relative flex h-full min-w-0 flex-1 items-end"
          >
            <div
              className="w-full rounded-t-[2px] bg-github-blue-deep transition-transform duration-150 group-hover/bar:scale-x-125 group-hover/bar:bg-github-blue"
              style={{ height: `${height}%` }}
            />
            <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 w-32 -translate-x-1/2 scale-95 rounded-md border border-white/10 bg-[#1c1c1a] px-spacing-3 py-spacing-2 text-xs text-surface-warm-white opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.45)] transition duration-150 group-hover/bar:scale-100 group-hover/bar:opacity-100">
              <p className="font-semibold">{week.label}</p>
              <p className="mt-spacing-1 text-surface-warm-white/68">
                {week.commits} commit
              </p>
              <p className="mt-spacing-1">
                <span className="text-github-blue">+{week.additions}</span>
                <span className="ml-spacing-2 text-github-red">
                  -{week.deletions}
                </span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContributorSkeleton() {
  return (
    <div className="mt-spacing-8 divide-y divide-white/[0.07] border-t border-white/[0.07]">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="flex flex-col gap-spacing-5 py-spacing-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-spacing-4">
            <span className="w-5 shrink-0" />
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-white/10" />
            <div className="min-w-0 space-y-spacing-2">
              <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
            </div>
          </div>
          <div className="h-16 w-full animate-pulse rounded bg-white/10 sm:w-48" />
        </div>
      ))}
    </div>
  );
}

export function CommunitySection() {
  const contributorsQuery = useCommunityContributors();
  const contributors = contributorsQuery.data ?? [];
  const maxCommits = Math.max(
    1,
    ...contributors.flatMap((contributor) =>
      (contributor.weeks ?? []).map((week) => week.commits),
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
                  className="inline-flex w-fit items-center justify-center rounded-md border border-white/14 bg-transparent px-spacing-6 py-spacing-4 text-sm font-semibold text-surface-warm-white transition hover:bg-white/[0.06]"
                >
                  Lihat semua kontributor
                </a>
                <a
                  href={REPOSITORY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center justify-center rounded-md bg-white px-spacing-6 py-spacing-4 text-sm font-semibold text-[#141413] transition hover:bg-white/90"
                >
                  Buka Github
                </a>
              </div>
            </div>

            {contributorsQuery.isPending ? (
              <ContributorSkeleton />
            ) : contributors.length ? (
              <div className="mt-spacing-8 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                {contributors.map((contributor, index) => (
                  <div
                    key={contributor.login}
                    className="flex flex-col gap-spacing-5 py-spacing-6 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-spacing-4">
                      <span className="w-5 shrink-0 text-sm text-surface-warm-white/40">
                        #{index + 1}
                      </span>
                      <Image
                        src={contributor.avatarUrl}
                        alt={`Foto profil ${contributor.login}`}
                        width={40}
                        height={40}
                        className="size-10 shrink-0 rounded-full"
                        unoptimized
                      />
                      <div className="min-w-0">
                        <a
                          href={contributor.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-base font-semibold text-surface-warm-white transition hover:underline"
                        >
                          {contributor.login}
                        </a>
                        <p className="mt-spacing-1 text-xs text-surface-warm-white/50">
                          <span>{contributor.recentCommits} commits</span>
                          {contributor.weeks ? (
                            <>
                              <span className="ml-spacing-3 text-github-blue">
                                +{formatCompact(contributor.recentAdditions)}
                              </span>
                              <span className="ml-spacing-2 text-github-red">
                                -{formatCompact(contributor.recentDeletions)}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {contributor.weeks ? (
                      <div className="w-full sm:w-48">
                        <MiniChart
                          weeks={contributor.weeks}
                          maxCommits={maxCommits}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="text-left">
            <div className="flex flex-col gap-spacing-5 text-left sm:flex-row sm:items-end sm:justify-between">
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
                className="w-fit rounded-md border border-white/14 bg-transparent px-spacing-6 py-spacing-4 text-sm font-semibold text-surface-warm-white/44"
              >
                Ikut sponsor
              </button>
            </div>

            <SponsorTable sponsors={sponsors} flat />
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="text-left">
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-surface-warm-white sm:text-4xl">
              Pertanyaan yang sering muncul
            </h2>
            <div className="mt-spacing-8 divide-y divide-white/[0.07] border-t border-white/[0.07]">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group grid grid-rows-[auto_0fr] transition-[grid-template-rows] duration-300 ease-out open:grid-rows-[auto_1fr]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-spacing-6 py-spacing-5 text-base font-semibold text-surface-warm-white outline-none transition [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <span className="relative grid size-6 shrink-0 place-items-center text-surface-warm-white/50">
                      <Plus className="absolute size-4 transition-all duration-300 ease-out group-open:rotate-90 group-open:opacity-0" />
                      <X className="absolute size-4 -rotate-90 opacity-0 transition-all duration-300 ease-out group-open:rotate-0 group-open:opacity-100" />
                    </span>
                  </summary>
                  <div className="overflow-hidden">
                    <p className="pb-spacing-6 text-sm leading-6 text-surface-warm-white/68">
                      {faq.answer}
                    </p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

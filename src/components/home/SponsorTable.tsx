"use client";

import { useMemo, useState } from "react";

type Sponsor = {
  donorName: string;
  brandName: string;
  brandUrl?: string;
  date: string;
  support: string;
  value: string;
};

const PAGE_SIZE = 10;

export function SponsorTable({ sponsors }: { sponsors: Sponsor[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(sponsors.length / PAGE_SIZE));
  const visibleSponsors = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sponsors.slice(start, start + PAGE_SIZE);
  }, [page, sponsors]);
  const start = sponsors.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(page * PAGE_SIZE, sponsors.length);

  return (
    <div className="mt-spacing-8 overflow-hidden rounded-[22px] border border-surface-warm-white/10">
      <table className="w-full text-sm">
        <thead className="bg-surface-warm-white/[0.055] text-left text-surface-warm-white/50">
          <tr>
            <th className="px-spacing-5 py-spacing-4 font-medium">Tanggal</th>
            <th className="px-spacing-5 py-spacing-4 font-medium">Donatur</th>
            <th className="px-spacing-5 py-spacing-4 font-medium">Sumber</th>
            <th className="px-spacing-5 py-spacing-4 font-medium">Dukungan</th>
            <th className="px-spacing-5 py-spacing-4 text-right font-medium">
              Nilai
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-warm-white/10">
          {visibleSponsors.map((sponsor) => (
            <tr key={`${sponsor.donorName}-${sponsor.date}`}>
              <td className="px-spacing-5 py-spacing-5 text-surface-warm-white/58">
                {sponsor.date}
              </td>
              <td className="px-spacing-5 py-spacing-5">
                <p className="font-semibold text-surface-warm-white">
                  {sponsor.donorName}
                </p>
              </td>
              <td className="px-spacing-5 py-spacing-5">
                {sponsor.brandUrl ? (
                  <a
                    href={sponsor.brandUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-surface-warm-white underline decoration-surface-warm-white/24 underline-offset-4 transition hover:decoration-surface-warm-white"
                  >
                    {sponsor.brandName}
                  </a>
                ) : (
                  <span className="font-semibold text-surface-warm-white">
                    {sponsor.brandName}
                  </span>
                )}
              </td>
              <td className="px-spacing-5 py-spacing-5 text-surface-warm-white/70">
                {sponsor.support}
              </td>
              <td className="px-spacing-5 py-spacing-5 text-right font-semibold text-surface-warm-white">
                {sponsor.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pageCount > 1 ? (
        <div className="flex flex-col gap-spacing-4 border-t border-surface-warm-white/10 bg-[#151515] px-spacing-5 py-spacing-4 text-sm text-surface-warm-white/52 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {start}-{end} dari {sponsors.length} sponsor
          </span>
          <div className="flex gap-spacing-3">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-radius-lg border border-surface-warm-white/12 px-spacing-4 py-spacing-2 text-surface-warm-white transition hover:bg-surface-warm-white/8 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={page === pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              className="rounded-radius-lg border border-surface-warm-white/12 px-spacing-4 py-spacing-2 text-surface-warm-white transition hover:bg-surface-warm-white/8 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

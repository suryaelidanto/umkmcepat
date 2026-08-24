"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Folder, Zap } from "lucide-react";
import { useState } from "react";

import { useSession } from "@/lib/auth/auth-client";
import { fetchJson, queryKeys } from "@/lib/query-client";

export type EnergyLedgerEntry = {
  id: string;
  createdAt: string;
  reason: string;
  inputTokens: number;
  outputTokens: number;
  amount: number;
  projectId: string | null;
  projectTitle?: string | null;
  modelId?: string | null;
};

type EnergyLedgerResponse = {
  entries: EnergyLedgerEntry[];
};

type ReasonDetail = {
  label: string;
  description: string;
};

const REASON_DETAILS: Record<string, ReasonDetail> = {
  "build:step": {
    label: "Pembuatan Komponen Website",
    description: "AI menyusun komponen tampilan, tema, dan bagian halaman.",
  },
  "build:spec": {
    label: "Perancangan Arsitektur",
    description: "Menyusun struktur brief dan spesifikasi halaman website.",
  },
  "build:subagent": {
    label: "Penyusunan Desain AI",
    description: "Analisis layout dan penataan elemen visual situs.",
  },
  "build:repair": {
    label: "Penyempurnaan Visual & Kontras",
    description:
      "Memperbaiki kerapian warna dan tombol sesuai standar aksesibilitas.",
  },
  "build:audit": {
    label: "Audit Visual & Aksesibilitas",
    description: "Memeriksa estetika warna, kontras teks, dan ukuran tombol.",
  },
  "build:check_app": {
    label: "Verifikasi Kompilasi Website",
    description:
      "Memastikan semua kode bebas dari error TypeScript dan bundler.",
  },
  "discuss:step": {
    label: "Percakapan & Analisis Brief",
    description: "AI merespons chat dan menyiapkan pertanyaan kebutuhan toko.",
  },
  "discuss:repair": {
    label: "Penataan Opsi Jawaban",
    description: "Menyusun ulang tombol pilihan agar pas dengan jawabanmu.",
  },
  "edit:step": {
    label: "Pembaruan Halaman",
    description: "Menerapkan instruksi perubahan teks atau tata letak.",
  },
  moderation: {
    label: "Pemeriksaan Keamanan",
    description: "Verifikasi keamanan teks dan gambar sebelum diproses.",
  },
};

const COMPONENT_DESCRIPTIONS: Record<string, ReasonDetail> = {
  Hero: {
    label: "Pembuatan Bagian Hero (Headline)",
    description:
      "Menyusun judul utama pembuka toko, slogan, dan tombol ajakan bertindak.",
  },
  Catalog: {
    label: "Penyusunan Katalog Produk & Layanan",
    description:
      "Menyusun daftar menu jualan, harga, foto produk, dan tombol pesan.",
  },
  LocationAndContact: {
    label: "Penyusunan Lokasi & Kontak WhatsApp",
    description:
      "Menyusun peta alamat, jam operasional toko, dan integrasi tombol WhatsApp.",
  },
  QualityUsp: {
    label: "Penyusunan Keunggulan Toko (USP)",
    description:
      "Menyusun poin-poin kelebihan usaha, garansi, dan jaminan mutu.",
  },
  Reviews: {
    label: "Penyusunan Ulasan Pelanggan",
    description: "Menyusun testimoni pembeli dan bukti kepuasan pelanggan.",
  },
  Navbar: {
    label: "Pembuatan Navigasi Atas (Navbar)",
    description: "Menyusun menu navigasi logo dan tautan antar bagian website.",
  },
  Footer: {
    label: "Pembuatan Bagian Penutup (Footer)",
    description:
      "Menyusun informasi hak cipta, tautan cepat, dan kontak penutup.",
  },
};

const STEP_SEQUENCE_FALLBACKS: ReasonDetail[] = [
  {
    label: "Penyusunan Layout & Komponen Utama",
    description:
      "AI menyusun struktur awal, tata letak beranda, dan tajuk utama.",
  },
  {
    label: "Pembuatan Katalog Produk & Layanan",
    description: "AI memprogram daftar menu jualan, foto, dan tombol pesan.",
  },
  {
    label: "Integrasi Tombol WhatsApp & Kontak",
    description:
      "AI menghubungkan alur pemesanan langsung ke nomor WhatsApp tokomu.",
  },
  {
    label: "Penyempurnaan Visual & Desain",
    description:
      "AI memastikan kontras warna tajam dan nyaman dibaca di layar HP.",
  },
  {
    label: "Verifikasi & Penggabungan Kode",
    description:
      "AI menyatukan seluruh bagian website agar siap dijalankan di preview.",
  },
];

const numberFormatter = new Intl.NumberFormat("id-ID");
const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

function getReasonInfo(reason: string, index = 0): ReasonDetail {
  if (REASON_DETAILS[reason]) {
    if (reason === "build:step") {
      const fallback =
        STEP_SEQUENCE_FALLBACKS[index % STEP_SEQUENCE_FALLBACKS.length];
      return fallback ?? REASON_DETAILS[reason]!;
    }
    return REASON_DETAILS[reason]!;
  }

  if (reason.startsWith("build:write:")) {
    const rawName = reason.slice("build:write:".length).replace(/\.tsx?$/, "");
    if (COMPONENT_DESCRIPTIONS[rawName]) {
      return COMPONENT_DESCRIPTIONS[rawName]!;
    }
    const cleanName = rawName.replace(/([A-Z])/g, " $1").trim();
    return {
      label: `Pembuatan Bagian ${cleanName}`,
      description: `AI menulis dan merancang komponen tampilan ${cleanName}.`,
    };
  }

  if (reason.startsWith("build:shadcn:")) {
    const name = reason.slice("build:shadcn:".length);
    return {
      label: `Pemasangan Komponen ${name}`,
      description:
        "Memasang elemen antarmuka interaktif yang rapi dan responsif.",
    };
  }

  if (reason.startsWith("build:skill:")) {
    const name = reason.slice("build:skill:".length);
    return {
      label: `Penerapan Panduan Desain (${name})`,
      description:
        "Menyesuaikan estetika visual dan tipografi standar profesional.",
    };
  }

  return {
    label: reason,
    description: "Operasi AI sistem.",
  };
}

export function EnergyLedger({
  projectId,
  limit = 50,
  entries,
}: {
  projectId?: string;
  limit?: number;
  entries?: EnergyLedgerEntry[];
}) {
  const { data: session, status } = useSession();
  const hasUser = Boolean(session?.user) && status !== "loading";
  const [scope, setScope] = useState<"project" | "all">(
    projectId ? "project" : "all",
  );

  const activeProjectId = scope === "project" ? projectId : undefined;

  const query = useQuery({
    queryKey: activeProjectId
      ? [...queryKeys.energy, "ledger", activeProjectId]
      : [...queryKeys.energy, "ledger"],
    queryFn: () =>
      fetchJson<EnergyLedgerResponse>(
        `/api/user/energy-ledger?limit=${limit}${activeProjectId ? `&projectId=${activeProjectId}` : ""}`,
        { cache: "no-store" },
      ),
    enabled: hasUser && entries === undefined,
  });

  if (entries === undefined && !hasUser) {
    return null;
  }

  const resolvedEntries = entries ?? query.data?.entries ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Scope Filter Tabs */}
      {projectId && entries === undefined ? (
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <button
            type="button"
            onClick={() => setScope("project")}
            className={`cursor-pointer rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
              scope === "project"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Proyek Ini
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`cursor-pointer rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
              scope === "all"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Semua Proyek
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {entries === undefined && query.isPending && !query.data ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <div className="size-2 animate-pulse rounded-full bg-primary" />
            <span>Memuat catatan energi…</span>
          </div>
        ) : null}

        {entries === undefined && query.isError ? (
          <p className="py-6 text-center text-xs text-destructive" role="alert">
            Gagal memuat catatan energi.
          </p>
        ) : null}

        {!query.isPending && resolvedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Zap className="mb-2 size-8 opacity-30 text-amber-500" />
            <p className="text-xs">Belum ada catatan pemakaian energi.</p>
          </div>
        ) : null}

        <ol className="flex flex-col gap-3">
          {resolvedEntries.map((entry, idx) => {
            const info = getReasonInfo(entry.reason, idx);

            return (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-foreground/20 hover:bg-muted/30 dark:border-white/[0.08] dark:bg-[#1a1a18] dark:hover:bg-[#20201d]"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold tracking-tight text-foreground dark:text-surface-warm-white">
                      {info.label}
                    </span>

                    {/* Clickable Project Badge */}
                    {scope === "all" && entry.projectId ? (
                      <a
                        href={`/projects/${entry.projectId}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        title="Buka proyek ini"
                      >
                        <Folder className="size-2.5" />
                        <span className="max-w-[140px] truncate">
                          {entry.projectTitle || "Proyek"}
                        </span>
                        <ArrowUpRight className="size-2.5 opacity-60" />
                      </a>
                    ) : null}
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {info.description}
                  </p>

                  <span className="text-[10px] text-muted-foreground/80 dark:text-surface-warm-white/50">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>

                {/* Energy amount debit */}
                <div className="flex shrink-0 flex-col items-end pl-2">
                  <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                    {formatNumber(entry.amount)}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Energi
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

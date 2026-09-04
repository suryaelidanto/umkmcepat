import { Globe, HeartHandshake } from "lucide-react";

import { ScrollReveal } from "@/components/home/ScrollReveal";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";

const MIN_PUBLISHED_SITES_SHOWN = 10;

const supporter = {
  name: "Zenhosta",
  url: "https://zenhosta.com/",
  logo: "/brand/zenhosta.png",
};

function SupporterChip() {
  return (
    <a
      href={supporter.url}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex h-16 items-center gap-spacing-3 rounded-2xl border border-black/10 bg-white px-spacing-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-black/20 hover:shadow-md dark:border-white/10 dark:bg-[#1c1c1a] dark:hover:border-white/20"
    >
      <Image
        src={supporter.logo}
        alt={supporter.name}
        width={32}
        height={32}
        className="size-8 object-contain"
      />
      <span className="text-lg font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
        {supporter.name}
      </span>
    </a>
  );
}

export function EcosystemSection({
  publishedSiteCount,
}: {
  publishedSiteCount: number;
}) {
  return (
    <section className="bg-[#eceae4] px-4 py-spacing-10 text-[#1c1c1c] dark:bg-[#151515] dark:text-surface-warm-white sm:px-spacing-9 sm:py-spacing-12 lg:px-spacing-10 lg:py-spacing-13">
      <div className="mx-auto max-w-6xl space-y-spacing-8 sm:space-y-spacing-10">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1c1c1c] dark:text-surface-warm-white sm:text-4xl">
              Didukung oleh
            </h2>
            <div className="mt-spacing-5 flex flex-wrap items-center justify-center gap-spacing-3">
              <SupporterChip />
              <Link
                href="/sponsor"
                className="inline-flex h-16 items-center gap-spacing-3 rounded-2xl border border-dashed border-black/20 bg-black/[0.02] px-spacing-6 text-sm font-medium text-[#5f5f5d] transition-all hover:border-accent-orange hover:bg-black/[0.04] hover:text-[#1c1c1c] dark:border-white/20 dark:bg-white/[0.02] dark:text-surface-warm-white/60 dark:hover:border-accent-orange dark:hover:bg-white/[0.05] dark:hover:text-surface-warm-white"
              >
                <HeartHandshake className="size-5 text-accent-orange" />
                <span>Menjadi Sponsor</span>
              </Link>
            </div>
          </div>
        </ScrollReveal>

        {publishedSiteCount >= MIN_PUBLISHED_SITES_SHOWN ? (
          <ScrollReveal>
            <div className="flex justify-center">
              <span className="flex items-center gap-spacing-2.5 rounded-full border border-black/10 bg-[#fcfbf8] px-spacing-5 py-spacing-3 text-sm font-medium text-[#1c1c1c] dark:border-white/10 dark:bg-[#1c1c1a] dark:text-surface-warm-white">
                <Globe className="size-4 text-accent-orange" />
                {publishedSiteCount.toLocaleString("id-ID")} website dibuat
                lewat UMKM Cepat
              </span>
            </div>
          </ScrollReveal>
        ) : null}
      </div>
    </section>
  );
}

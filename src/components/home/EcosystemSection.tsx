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
      className="group inline-flex h-16 items-center gap-spacing-3 rounded-2xl border border-border bg-card px-spacing-6 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-xs"
    >
      <Image
        src={supporter.logo}
        alt={supporter.name}
        width={32}
        height={32}
        className="size-8 object-contain"
      />
      <span className="text-lg font-semibold tracking-tight text-foreground">
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
    <section className="bg-background px-4 py-spacing-12 text-foreground sm:px-spacing-9 sm:py-spacing-13 lg:px-spacing-10 lg:py-spacing-14">
      <div className="mx-auto max-w-6xl space-y-spacing-8 sm:space-y-spacing-10">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
              Didukung oleh
            </h2>
            <div className="mt-spacing-5 flex flex-wrap items-center justify-center gap-spacing-3">
              <SupporterChip />
              <Link
                href="/sponsor"
                className="inline-flex h-16 items-center gap-spacing-3 rounded-2xl border border-dashed border-border bg-muted/30 px-spacing-6 text-sm font-medium text-muted-foreground transition-all hover:border-accent-orange hover:bg-muted/60 hover:text-foreground"
              >
                <HeartHandshake className="size-5 text-accent-orange" />
                <span>Menjadi Sponsor</span>
              </Link>
            </div>
          </div>
        </ScrollReveal>

        {publishedSiteCount >= MIN_PUBLISHED_SITES_SHOWN ? (
          <ScrollReveal delay={0.12}>
            <div className="flex justify-center">
              <span className="flex items-center gap-spacing-2.5 rounded-full border border-border bg-card px-spacing-5 py-spacing-3 text-sm font-medium text-foreground shadow-2xs">
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

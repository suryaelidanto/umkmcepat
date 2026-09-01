import { Globe } from "lucide-react";

import { ScrollReveal } from "@/components/home/ScrollReveal";
import { Image } from "@/components/ui/image";

const MIN_PUBLISHED_SITES_SHOWN = 10;

const supporter = {
  name: "Zenhosta",
  url: "https://zenhosta.com/",
  logo: "/brand/zenhosta.png",
};

const techLogos = [
  {
    name: "React",
    light: "/brand/tech/react.svg",
    dark: "/brand/tech/react-dark.svg",
    url: "https://react.dev/",
  },
  {
    name: "Tailwind CSS",
    light: "/brand/tech/tailwindcss.svg",
    dark: "/brand/tech/tailwindcss.svg",
    url: "https://tailwindcss.com/",
  },
  {
    name: "shadcn/ui",
    light: "/brand/tech/shadcn-ui.svg",
    dark: "/brand/tech/shadcn-ui-dark.svg",
    url: "https://ui.shadcn.com/",
  },
  {
    name: "TanStack",
    light: "/brand/tech/tanstack.svg",
    dark: "/brand/tech/tanstack.svg",
    url: "https://tanstack.com/",
  },
  {
    name: "Vite",
    light: "/brand/tech/vite.svg",
    dark: "/brand/tech/vite.svg",
    url: "https://vite.dev/",
  },
  {
    name: "Cloudflare",
    light: "/brand/tech/cloudflare.svg",
    dark: "/brand/tech/cloudflare.svg",
    url: "https://www.cloudflare.com/",
  },
  {
    name: "PostgreSQL",
    light: "/brand/tech/postgresql.svg",
    dark: "/brand/tech/postgresql.svg",
    url: "https://www.postgresql.org/",
  },
  {
    name: "Redis",
    light: "/brand/tech/redis.svg",
    dark: "/brand/tech/redis.svg",
    url: "https://redis.io/",
  },
  {
    name: "Docker",
    light: "/brand/tech/docker.svg",
    dark: "/brand/tech/docker.svg",
    url: "https://www.docker.com/",
  },
];

function SupporterChip() {
  return (
    <a
      href={supporter.url}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-spacing-4 rounded-2xl border border-black/10 bg-white p-spacing-4 px-spacing-7 py-spacing-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-black/20 hover:shadow-md dark:border-white/10 dark:bg-[#1c1c1a] dark:hover:border-white/20"
    >
      <Image
        src={supporter.logo}
        alt={supporter.name}
        width={36}
        height={36}
        className="size-9 object-contain"
      />
      <span className="text-xl font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
        {supporter.name}
      </span>
    </a>
  );
}

function TechMarqueeItem({
  tech,
  hidden = false,
}: {
  tech: (typeof techLogos)[number];
  hidden?: boolean;
}) {
  return (
    <a
      href={tech.url}
      target="_blank"
      rel="noreferrer"
      aria-hidden={hidden ? "true" : undefined}
      tabIndex={hidden ? -1 : undefined}
      className="flex shrink-0 items-center gap-spacing-3 rounded-xl border border-black/5 bg-white/70 px-4 py-2.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-black/15 hover:bg-white hover:shadow-xs dark:border-white/5 dark:bg-white/[0.04] dark:hover:border-white/15 dark:hover:bg-white/[0.08]"
    >
      <Image
        src={tech.light}
        alt=""
        width={24}
        height={24}
        className="size-6 object-contain dark:hidden"
      />
      <Image
        src={tech.dark}
        alt={tech.name}
        width={24}
        height={24}
        className="hidden size-6 object-contain dark:block"
      />
      <span className="text-sm font-semibold tracking-tight text-[#1c1c1c] dark:text-surface-warm-white">
        {tech.name}
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
    <section className="bg-[#eceae4] px-4 py-spacing-10 text-[#1c1c1c] dark:bg-[#151515] dark:text-surface-warm-white sm:px-spacing-9 sm:py-spacing-12 lg:px-spacing-10">
      <div className="mx-auto max-w-6xl space-y-spacing-10 sm:space-y-spacing-12">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1c1c1c] dark:text-surface-warm-white sm:text-4xl">
              Didukung oleh
            </h2>
            <div className="mt-spacing-5 flex justify-center">
              <SupporterChip />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="text-center">
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#1c1c1c] dark:text-surface-warm-white sm:text-2xl">
              Dibangun &amp; dijalankan dengan teknologi terbuka
            </h3>

            {/* Infinite Horizontal Carousel on 1 single line with edge fade mask */}
            <div className="logo-marquee-mask relative mt-spacing-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
              <div className="logo-marquee-track flex w-max items-center gap-spacing-5 py-spacing-1.5">
                {techLogos.map((tech) => (
                  <TechMarqueeItem key={`tech-${tech.name}`} tech={tech} />
                ))}
                {techLogos.map((tech) => (
                  <TechMarqueeItem
                    key={`tech-clone-${tech.name}`}
                    tech={tech}
                    hidden
                  />
                ))}
              </div>
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

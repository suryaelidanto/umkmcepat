import { Button } from "@/components/ui/button";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

type ProjectSitePreviewProps = {
  siteSchema: ProjectSiteSchema;
  viewport: "desktop" | "mobile";
};

export function ProjectSitePreview({
  siteSchema,
  viewport,
}: ProjectSitePreviewProps) {
  const theme = siteSchema.theme;
  const isMobile = viewport === "mobile";

  return (
    <div
      className={`${viewport === "mobile" ? "max-w-[390px]" : "max-w-5xl"} w-full overflow-hidden rounded-[28px] shadow-[0_18px_48px_rgba(28,28,28,0.16)]`}
      style={{ backgroundColor: theme.background, color: theme.foreground }}
    >
      <div className="flex items-center justify-between border-b px-spacing-8 py-spacing-5 text-sm">
        <span className="font-semibold tracking-[-0.03em]">
          {siteSchema.businessName}
        </span>
        <span style={{ color: theme.muted }}>{siteSchema.audience}</span>
      </div>

      <section
        className={`grid gap-spacing-10 ${isMobile ? "p-spacing-7" : "p-spacing-8 md:grid-cols-[1.08fr_0.92fr] md:p-spacing-12"}`}
      >
        <div>
          <p
            className="text-sm font-medium uppercase tracking-[0.16em]"
            style={{ color: theme.accent }}
          >
            {siteSchema.eyebrow}
          </p>
          <h2
            className={`mt-spacing-7 font-semibold leading-[0.92] tracking-[-0.07em] ${isMobile ? "text-5xl" : "text-[clamp(2.45rem,5vw,4.8rem)]"}`}
          >
            {siteSchema.headline}
          </h2>
          <p
            className="mt-spacing-7 max-w-xl text-lg leading-8"
            style={{ color: theme.muted }}
          >
            {siteSchema.subheadline}
          </p>
          <div className="mt-spacing-9 flex flex-wrap gap-spacing-4">
            <Button
              className="rounded-radius-lg px-spacing-9 text-surface-warm-white"
              style={{ backgroundColor: theme.foreground }}
            >
              {siteSchema.primaryCta}
            </Button>
            <Button
              variant="outline"
              className="rounded-radius-lg border-foreground-primary/15 bg-transparent px-spacing-9"
            >
              {siteSchema.secondaryCta}
            </Button>
          </div>
        </div>

        <div
          className="relative min-h-80 overflow-hidden rounded-[32px] border p-spacing-7"
          style={{ borderColor: `${theme.foreground}20` }}
        >
          <div
            className="absolute inset-0 opacity-95"
            style={{
              background: `radial-gradient(circle at 28% 24%, ${theme.accent}, transparent 30%), radial-gradient(circle at 78% 20%, ${theme.foreground}, transparent 28%), linear-gradient(145deg, ${theme.background}, ${theme.foreground})`,
            }}
          />
          <div className="relative flex h-full min-h-64 flex-col justify-between rounded-[24px] bg-white/86 p-spacing-6 backdrop-blur-sm">
            <div>
              <p className="text-sm" style={{ color: theme.muted }}>
                Penawaran utama
              </p>
              <p className="mt-spacing-4 text-2xl font-semibold tracking-[-0.05em]">
                {siteSchema.offer}
              </p>
            </div>
            <div className="grid gap-spacing-3 text-sm">
              {siteSchema.trustPoints.map((point) => (
                <div key={point} className="flex items-center gap-spacing-3">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: theme.accent }}
                    aria-hidden="true"
                  />
                  {point}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className={`border-t py-spacing-10 ${isMobile ? "px-spacing-7" : "px-spacing-8 md:px-spacing-12"}`}
      >
        <div
          className={`grid gap-spacing-5 ${isMobile ? "" : "md:grid-cols-2"}`}
        >
          {siteSchema.sections.map((section, index) => (
            <article
              key={`${section.title}-${index}`}
              className="rounded-[22px] border bg-white/64 p-spacing-7"
              style={{ borderColor: `${theme.foreground}14` }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-[0.14em]"
                style={{ color: theme.accent }}
              >
                0{index + 1}
              </p>
              <h3 className="mt-spacing-4 text-xl font-semibold tracking-[-0.04em]">
                {section.title}
              </h3>
              <p
                className="mt-spacing-4 leading-7"
                style={{ color: theme.muted }}
              >
                {section.body}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

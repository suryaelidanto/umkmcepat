import { isSectionVisible } from "./sections";

import { Button } from "@/components/ui/button";
import { type ProjectBrief } from "@/lib/projects/brief";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

type ProjectSitePreviewProps = {
  siteSchema: ProjectSiteSchema;
  viewport: "desktop" | "mobile";
  /**
   * When provided, the renderer draws the new soft-field sections (USP, since,
   * payment methods, delivery area, secondary CTA, current promo,
   * testimonials, certifications, multi-product list, contact/hours) gated
   * on each field being non-empty. Without a brief the legacy
   * `siteSchema`-driven layout is used (Storybook preview path).
   */
  brief?: ProjectBrief | null;
};

export function ProjectSitePreview({
  siteSchema,
  viewport,
  brief,
}: ProjectSitePreviewProps) {
  const theme = siteSchema.theme;
  const isMobile = viewport === "mobile";
  const useBrief = brief !== undefined && brief !== null;

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
            {useBrief && brief.secondaryCta ? (
              <Button
                variant="outline"
                className="rounded-radius-lg border-foreground-primary/15 bg-transparent px-spacing-9"
              >
                {brief.secondaryCta.label}
              </Button>
            ) : siteSchema.secondaryCta ? (
              <Button
                variant="outline"
                className="rounded-radius-lg border-foreground-primary/15 bg-transparent px-spacing-9"
              >
                {siteSchema.secondaryCta}
              </Button>
            ) : null}
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

      {useBrief ? (
        <BriefSections brief={brief} theme={theme} isMobile={isMobile} />
      ) : null}
    </div>
  );
}

type BriefSectionsProps = {
  brief: ProjectBrief;
  theme: ProjectSiteSchema["theme"];
  isMobile: boolean;
};

function BriefSections({ brief, theme, isMobile }: BriefSectionsProps) {
  const outerPad = isMobile
    ? "px-spacing-7 py-spacing-8"
    : "px-spacing-8 py-spacing-10 md:px-spacing-12";
  return (
    <div className={`flex flex-col gap-spacing-10 border-t ${outerPad}`}>
      {isSectionVisible(brief, "products") ? (
        <section data-testid="section-products" aria-label="Produk dan layanan">
          <h3 className="text-xl font-semibold tracking-[-0.04em]">
            Produk dan layanan
          </h3>
          <ul className="mt-spacing-5 grid gap-spacing-4 sm:grid-cols-2">
            {brief.productOrService?.map((item) => (
              <li
                key={item.name}
                className="rounded-[18px] border bg-white/64 p-spacing-6"
                style={{ borderColor: `${theme.foreground}14` }}
              >
                <p className="text-base font-semibold tracking-[-0.03em]">
                  {item.name}
                </p>
                {item.description ? (
                  <p
                    className="mt-spacing-3 text-sm leading-6"
                    style={{ color: theme.muted }}
                  >
                    {item.description}
                  </p>
                ) : null}
                {item.priceRange ? (
                  <p
                    className="mt-spacing-3 text-sm font-medium"
                    style={{ color: theme.accent }}
                  >
                    {item.priceRange}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isSectionVisible(brief, "usp") ? (
        <section data-testid="section-usp" aria-label="Keunggulan utama">
          <h3 className="text-xl font-semibold tracking-[-0.04em]">
            Keunggulan utama
          </h3>
          <ul className="mt-spacing-5 grid gap-spacing-3">
            {brief.usp?.map((point) => (
              <li
                key={point}
                className="flex items-start gap-spacing-3 text-sm"
              >
                <span
                  className="mt-2 size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: theme.accent }}
                  aria-hidden="true"
                />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isSectionVisible(brief, "currentPromo") ? (
        <section
          data-testid="section-current-promo"
          aria-label="Promo saat ini"
          className="rounded-[18px] border p-spacing-6 text-sm"
          style={{
            borderColor: `${theme.accent}55`,
            backgroundColor: `${theme.accent}10`,
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: theme.accent }}
          >
            Promo saat ini
          </p>
          <p className="mt-spacing-3 text-base font-medium leading-7">
            {brief.currentPromo}
          </p>
        </section>
      ) : null}

      <div className={`grid gap-spacing-8 ${isMobile ? "" : "md:grid-cols-2"}`}>
        {isSectionVisible(brief, "since") ? (
          <section data-testid="section-since" aria-label="Berdiri sejak">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">
              Berdiri sejak
            </h3>
            <p
              className="mt-spacing-3 text-2xl font-semibold tracking-[-0.04em]"
              style={{ color: theme.accent }}
            >
              {brief.since}
            </p>
          </section>
        ) : null}

        {isSectionVisible(brief, "deliveryArea") ? (
          <section
            data-testid="section-delivery-area"
            aria-label="Area layanan"
          >
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">
              Area layanan
            </h3>
            <p className="mt-spacing-3 text-base leading-7">
              {brief.deliveryArea}
            </p>
          </section>
        ) : null}

        {isSectionVisible(brief, "hours") ? (
          <section data-testid="section-hours" aria-label="Jam buka">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">
              Jam buka
            </h3>
            <ul className="mt-spacing-3 grid gap-spacing-2 text-sm">
              {brief.hours?.map((row) => (
                <li
                  key={`${row.dayRange}-${row.open}-${row.close}`}
                  className="flex justify-between gap-spacing-4"
                >
                  <span>{row.dayRange}</span>
                  <span style={{ color: theme.muted }}>
                    {row.open} - {row.close}
                    {row.note ? ` (${row.note})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isSectionVisible(brief, "contact") ? (
          <section data-testid="section-contact" aria-label="Kontak">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">
              Hubungi kami
            </h3>
            <p className="mt-spacing-3 text-base leading-7">
              {brief.contact?.label ?? channelLabel(brief.contact?.channel)}
            </p>
            <p className="mt-spacing-2 text-sm" style={{ color: theme.muted }}>
              {brief.contact?.value}
            </p>
          </section>
        ) : null}
      </div>

      {isSectionVisible(brief, "paymentMethods") ? (
        <section
          data-testid="section-payment-methods"
          aria-label="Metode pembayaran"
        >
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">
            Metode pembayaran
          </h3>
          <ul className="mt-spacing-4 flex flex-wrap gap-spacing-3">
            {brief.paymentMethods?.map((method) => (
              <li
                key={method.method}
                className="rounded-full border px-spacing-6 py-spacing-3 text-sm"
                style={{ borderColor: `${theme.foreground}22` }}
              >
                {paymentMethodLabel(method.method)}
                {method.detail ? ` - ${method.detail}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isSectionVisible(brief, "testimonials") ? (
        <section
          data-testid="section-testimonials"
          aria-label="Testimoni pelanggan"
        >
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">
            Testimoni pelanggan
          </h3>
          <ul
            className={`mt-spacing-5 grid gap-spacing-5 ${isMobile ? "" : "md:grid-cols-2"}`}
          >
            {brief.testimonials?.map((testimonial) => (
              <li
                key={`${testimonial.author}-${testimonial.quote}`}
                className="rounded-[18px] border bg-white/64 p-spacing-6"
                style={{ borderColor: `${theme.foreground}14` }}
              >
                {typeof testimonial.rating === "number" ? (
                  <p
                    className="text-sm font-semibold"
                    style={{ color: theme.accent }}
                  >
                    {"★".repeat(testimonial.rating)}
                    <span style={{ color: `${theme.accent}55` }}>
                      {"★".repeat(5 - testimonial.rating)}
                    </span>
                  </p>
                ) : null}
                <p className="mt-spacing-3 text-sm leading-7">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <p
                  className="mt-spacing-4 text-xs font-medium uppercase tracking-[0.12em]"
                  style={{ color: theme.muted }}
                >
                  {testimonial.author}
                  {testimonial.context ? ` - ${testimonial.context}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isSectionVisible(brief, "certifications") ? (
        <section data-testid="section-certifications" aria-label="Sertifikasi">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">
            Sertifikasi
          </h3>
          <ul className="mt-spacing-4 flex flex-wrap gap-spacing-3">
            {brief.certifications?.map((cert) => (
              <li
                key={cert.name}
                className="rounded-[14px] border px-spacing-5 py-spacing-3 text-sm"
                style={{ borderColor: `${theme.foreground}22` }}
              >
                <span className="font-semibold">{cert.name}</span>
                {cert.issuer ? (
                  <span style={{ color: theme.muted }}> - {cert.issuer}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function channelLabel(channel: string | undefined): string {
  switch (channel) {
    case "whatsapp":
      return "WhatsApp";
    case "phone":
      return "Telepon";
    case "instagram":
      return "Instagram";
    case "maps":
      return "Google Maps";
    case "other":
      return "Kontak lain";
    default:
      return "Kontak";
  }
}

function paymentMethodLabel(method: string): string {
  switch (method) {
    case "cash":
      return "Tunai";
    case "transfer":
      return "Transfer bank";
    case "qris":
      return "QRIS";
    case "ewallet":
      return "E-wallet";
    case "cod":
      return "Bayar di tempat";
    default:
      return method;
  }
}

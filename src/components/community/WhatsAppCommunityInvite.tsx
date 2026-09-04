import { ScrollReveal } from "@/components/home/ScrollReveal";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";

export const WHATSAPP_UMKM_GROUP_URL =
  "https://chat.whatsapp.com/BzxjAg9SMfQK7dUHmUKxbg";

const content = {
  homepage: {
    body: "Wadah ngobrol pelaku UMKM di UMKM Cepat.",
    heading: "Komunitas UMKM Cepat",
  },
  waitlist: {
    heading: "Sambil menunggu, gabung obrolannya",
  },
} as const;

export function WhatsAppCommunityInvite({
  variant,
}: {
  variant: keyof typeof content;
}) {
  const isHomepage = variant === "homepage";

  if (!isHomepage) {
    return (
      <div className="flex w-full flex-col items-center gap-3 text-center">
        <p className="text-sm leading-6 text-[#5f5f5d] dark:text-surface-warm-white/70">
          {content.waitlist.heading}
        </p>
        <Button
          asChild
          className="bg-[#1c1c1c] text-white hover:bg-[#1c1c1c]/90 dark:bg-surface-warm-white dark:text-[#141413] dark:hover:bg-surface-warm-white/90"
        >
          <Link
            href={WHATSAPP_UMKM_GROUP_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            Join WhatsApp
          </Link>
        </Button>
      </div>
    );
  }

  const invitation = content.homepage;
  const invitationContent = (
    <div className="mx-auto max-w-6xl">
      <ScrollReveal yOffset={18}>
        <div className="flex flex-col items-start justify-between gap-spacing-7 rounded-radius-2xl border border-black/10 bg-black/[0.02] px-spacing-7 py-spacing-7 transition-colors dark:border-surface-warm-white/12 dark:bg-surface-warm-white/[0.04] sm:flex-row sm:items-center sm:px-spacing-9 sm:py-spacing-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#1c1c1c] dark:text-surface-warm-white sm:text-3xl">
              {invitation.heading}
            </h2>
            <p className="mt-spacing-3 text-sm leading-6 text-[#5f5f5d] dark:text-surface-warm-white/68">
              {invitation.body}
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="border-black/15 bg-black/[0.04] text-[#1c1c1c] hover:bg-black/[0.08] dark:border-surface-warm-white/18 dark:bg-transparent dark:text-surface-warm-white dark:hover:bg-surface-warm-white/[0.07]"
          >
            <Link
              href={WHATSAPP_UMKM_GROUP_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Join WhatsApp
            </Link>
          </Button>
        </div>
      </ScrollReveal>
    </div>
  );

  return (
    <section
      aria-label="Grup diskusi UMKM"
      className="bg-[#eceae4] px-4 py-spacing-12 dark:bg-[#151515] sm:px-spacing-9 sm:py-spacing-13 lg:px-spacing-10 lg:py-spacing-14"
    >
      {invitationContent}
    </section>
  );
}

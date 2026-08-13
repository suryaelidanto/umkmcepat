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
        <p className="text-sm leading-6 text-surface-warm-white/70">
          {content.waitlist.heading}
        </p>
        <Button
          asChild
          className="bg-surface-warm-white text-[#141413] hover:bg-surface-warm-white/90"
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
      <div className="flex flex-col items-start justify-between gap-spacing-7 rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/[0.04] px-spacing-7 py-spacing-8 sm:flex-row sm:items-center sm:px-spacing-9">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-surface-warm-white sm:text-3xl">
            {invitation.heading}
          </h2>
          <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/68">
            {invitation.body}
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          className="border-surface-warm-white/18 bg-transparent text-surface-warm-white hover:bg-surface-warm-white/[0.07]"
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
    </div>
  );

  if (!isHomepage) {
    return invitationContent;
  }

  return (
    <section
      aria-label="Grup diskusi UMKM"
      className="bg-[#151515] px-4 pb-spacing-14 sm:px-spacing-9 lg:px-spacing-10"
    >
      {invitationContent}
    </section>
  );
}

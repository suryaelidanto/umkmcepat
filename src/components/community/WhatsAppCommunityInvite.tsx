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
    body: "Kamu bisa bertanya dan kenalan dengan pelaku UMKM lainnya.",
    heading: "Sambil menunggu, gabung obrolannya",
  },
} as const;

export function WhatsAppCommunityInvite({
  variant,
}: {
  variant: keyof typeof content;
}) {
  const invitation = content[variant];
  const isHomepage = variant === "homepage";
  const invitationContent = (
    <div className={isHomepage ? "mx-auto max-w-6xl" : "w-full"}>
      <div
        className={
          isHomepage
            ? "flex flex-col items-start justify-between gap-spacing-7 rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/[0.04] px-spacing-7 py-spacing-8 sm:flex-row sm:items-center sm:px-spacing-9"
            : "flex flex-col items-center gap-spacing-4 border-y border-surface-warm-white/10 py-spacing-7 text-center"
        }
      >
        <div className={isHomepage ? "max-w-2xl" : "max-w-md"}>
          <h2
            className={
              isHomepage
                ? "text-2xl font-semibold tracking-[-0.04em] text-surface-warm-white sm:text-3xl"
                : "text-xl font-semibold tracking-tight text-surface-warm-white"
            }
          >
            {invitation.heading}
          </h2>
          <p className="mt-spacing-3 text-sm leading-6 text-surface-warm-white/68">
            {invitation.body}
          </p>
        </div>

        <Button
          asChild
          variant={isHomepage ? "outline" : "default"}
          className={
            isHomepage
              ? "border-surface-warm-white/18 bg-transparent text-surface-warm-white hover:bg-surface-warm-white/[0.07]"
              : "bg-surface-warm-white text-[#141413] hover:bg-surface-warm-white/90"
          }
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

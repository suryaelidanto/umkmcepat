import { ScrollReveal } from "@/components/home/ScrollReveal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
        <p className="text-sm leading-6 text-muted-foreground">
          {content.waitlist.heading}
        </p>
        <Button
          asChild
          className="bg-primary text-primary-foreground hover:bg-primary/90"
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
        <Card
          variant="muted"
          className="flex flex-col items-start justify-between gap-spacing-7 p-spacing-7 sm:flex-row sm:items-center sm:px-spacing-9 sm:py-spacing-8"
        >
          <CardContent className="max-w-2xl p-0">
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
              {invitation.heading}
            </h2>
            <p className="mt-spacing-3 text-sm leading-6 text-muted-foreground">
              {invitation.body}
            </p>
          </CardContent>
          <Button
            asChild
            variant="outline"
            className="shrink-0 rounded-radius-lg border-border bg-card text-foreground hover:bg-muted"
          >
            <Link
              href={WHATSAPP_UMKM_GROUP_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Join WhatsApp
            </Link>
          </Button>
        </Card>
      </ScrollReveal>
    </div>
  );

  return (
    <section
      aria-label="Grup diskusi UMKM"
      className="bg-background px-4 py-spacing-12 text-foreground sm:px-spacing-9 sm:py-spacing-13 lg:px-spacing-10 lg:py-spacing-14"
    >
      {invitationContent}
    </section>
  );
}

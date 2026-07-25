import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/waitlist";

export type OwnEntry = {
  businessName: string;
  businessType: string | null;
  imageRef: string | null;
  phone: string | null;
  status: string;
  story: string;
};

export async function getOwnWaitlistEntry(
  email: string,
): Promise<OwnEntry | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  const entry = await prisma.waitlistEntry.findUnique({
    select: {
      businessName: true,
      businessType: true,
      imageRef: true,
      phone: true,
      status: true,
      story: true,
    },
    where: { email: normalized },
  });
  return entry ?? null;
}

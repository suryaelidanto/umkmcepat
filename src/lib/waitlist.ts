import { getEnv } from "@/lib/config";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";

const MIN_STORY_LENGTH = 80;

export type WaitlistStatus = "pending" | "approved" | "rejected" | "waitlisted";

export function normalizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  // Pragmatic email check: local@domain with a dot in the domain.
  const match = trimmed.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  return match ? trimmed : null;
}

export function validateWaitlistStory(
  story: string,
): { ok: true; story: string } | { ok: false; reason: string } {
  const trimmed = story.trim();
  if (trimmed.length < MIN_STORY_LENGTH) {
    return {
      ok: false,
      reason: `Cerita usaha terlalu pendek (minimal ${MIN_STORY_LENGTH} karakter).`,
    };
  }
  return { ok: true, story: trimmed };
}

export function isAdminEmail(email: string): boolean {
  const raw = getEnv("ADMIN_EMAILS", "");
  if (!raw || !email) {
    return false;
  }
  const allowlist = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}

export type WaitlistSubmission = {
  businessName: string;
  businessType?: string | null;
  email: string;
  imageRef?: string | null;
  phone?: string | null;
  story: string;
};

export async function submitWaitlist(
  input: WaitlistSubmission,
): Promise<{ id: string; status: WaitlistStatus }> {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("Email tidak valid.");
  }
  const story = validateWaitlistStory(input.story);
  if (!story.ok) {
    throw new Error(story.reason);
  }
  if (!input.businessName.trim()) {
    throw new Error("Nama usaha tidak boleh kosong.");
  }

  // Idempotent on email: re-submit updates the entry rather than duping.
  const entry = await prisma.waitlistEntry.upsert({
    create: {
      businessName: input.businessName.trim().slice(0, 160),
      businessType: input.businessType?.trim().slice(0, 120) || null,
      email,
      imageRef: input.imageRef ?? null,
      phone: input.phone?.trim().slice(0, 40) || null,
      status: "pending",
      story: story.story,
      submittedAt: new Date(),
    },
    update: {
      businessName: input.businessName.trim().slice(0, 160),
      businessType: input.businessType?.trim().slice(0, 120) || null,
      imageRef: input.imageRef ?? null,
      phone: input.phone?.trim().slice(0, 40) || null,
      story: story.story,
      // Re-submitting after rejection resets to pending for re-review.
      status: "pending",
      submittedAt: new Date(),
    },
    where: { email },
    select: { id: true, status: true },
  });

  devLog("waitlist", "submit", {
    entryId: entry.id,
    hasImage: Boolean(input.imageRef),
    status: entry.status,
  });

  return { id: entry.id, status: entry.status as WaitlistStatus };
}

export async function isWaitlistApproved(
  email: string,
): Promise<WaitlistStatus | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  const entry = await prisma.waitlistEntry.findUnique({
    where: { email: normalized },
    select: { status: true },
  });
  if (!entry) {
    return null;
  }
  return entry.status as WaitlistStatus;
}

export async function listPendingWaitlist() {
  return prisma.waitlistEntry.findMany({
    orderBy: { submittedAt: "asc" },
    select: {
      businessName: true,
      businessType: true,
      email: true,
      id: true,
      imageRef: true,
      phone: true,
      status: true,
      story: true,
      submittedAt: true,
    },
    where: { status: "pending" },
  });
}

export async function approveWaitlistEntry(
  entryId: string,
  reviewerId: string,
): Promise<void> {
  await prisma.waitlistEntry.update({
    data: {
      reviewedAt: new Date(),
      reviewerId,
      status: "approved",
    },
    where: { id: entryId },
  });
  devLog("waitlist", "approve", { entryId, reviewerId });
}

export async function rejectWaitlistEntry(
  entryId: string,
  reviewerId: string,
  reason: string,
): Promise<void> {
  await prisma.waitlistEntry.update({
    data: {
      rejectionReason: reason.slice(0, 1000),
      reviewedAt: new Date(),
      reviewerId,
      status: "rejected",
    },
    where: { id: entryId },
  });
  devLog("waitlist", "reject", { entryId, reviewerId });
}

/**
 * When a user signs up, link their account to an approved waitlist entry whose
 * email matches. This is what lets an approved applicant through the gate.
 */
export async function linkApprovedWaitlistOnSignup(
  userId: string,
  email: string,
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return;
  }
  await prisma.waitlistEntry.updateMany({
    data: { linkedUserId: userId },
    where: { email: normalized, status: "approved" },
  });
}

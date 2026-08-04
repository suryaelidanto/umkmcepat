// src/lib/projects/brief-admission.ts
// Deterministic brief-completeness gate for the batched writer. Runs BEFORE
// any AI call: a failed gate costs zero energy and returns an Indonesian
// user-facing reason. This is the fast sibling of discuss-readiness.ts —
// the batched prompt can't ask follow-up questions mid-stream, so anything
// the writer needs must be present in the brief up front.
//
// Blocks on the same structural fields discuss-readiness treats as
// blockers, plus the fields the writer prompt specifically consumes.
import { z } from "zod";

import type { ProjectBrief } from "./brief";

const requiredText = z
  .string({ error: "must be a string" })
  .trim()
  .min(1)
  .max(500);

const batchedBriefAdmissionSchema = z.object({
  businessName: requiredText,
  contactOrCta: requiredText,
  offer: requiredText,
  readyForBuild: z.literal(true),
  stylePreference: requiredText,
  targetCustomer: requiredText,
});

export type BatchedBriefAdmissionResult =
  | { ok: true; blockers: []; reason: null }
  | { ok: false; blockers: string[]; reason: string };

const FIELD_LABELS: Record<string, string> = {
  businessName: "nama usaha",
  contactOrCta: "kontak atau CTA (misalnya WhatsApp)",
  offer: "penawaran utama",
  readyForBuild: "kesiapan build",
  stylePreference: "preferensi visual",
  targetCustomer: "target pelanggan",
};

/**
 * Validate a parsed ProjectBrief against what the batched writer needs.
 * Never throws; always returns structured blockers + a single Indonesian
 * user-facing sentence for the UI error path.
 */
export function checkBatchedGenerateAdmission(input: {
  brief: ProjectBrief;
}): BatchedBriefAdmissionResult {
  const parsed = batchedBriefAdmissionSchema.safeParse({
    businessName: input.brief.businessName,
    contactOrCta: input.brief.contactOrCta,
    offer: input.brief.offer,
    readyForBuild: input.brief.readyForBuild,
    stylePreference: input.brief.stylePreference,
    targetCustomer: input.brief.targetCustomer,
  });

  if (parsed.success) {
    return { ok: true, blockers: [], reason: null };
  }

  const blockers = [
    ...new Set(
      parsed.error.issues.map((issue) => String(issue.path[0] ?? "brief")),
    ),
  ];
  const labels = blockers.map(
    (field) => FIELD_LABELS[field] ?? field.replace(/_/g, " "),
  );
  const reason =
    blockers.length === 1
      ? `Brief belum siap: ${labels[0]} masih kosong. Lengkapi diskusi dulu, lalu build ulang.`
      : `Brief belum siap: ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? ", dan lainnya" : ""} masih kosong. Lengkapi diskusi dulu, lalu build ulang.`;

  return { ok: false, blockers, reason };
}

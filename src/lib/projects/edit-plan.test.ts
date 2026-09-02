import { describe, expect, it } from "vitest";

import { classifyEditIntent } from "./edit-intent";
import {
  createEditPlan,
  editPlanSchema,
  type EditPlanOperationKind,
} from "./edit-plan";

const FACT_FINGERPRINT = "a".repeat(64);
const CHECKPOINT = { id: "checkpoint-1", snapshotId: "snapshot-1" };
const EXISTING_FILES = [
  "src/content/site.ts",
  "src/components/site/Header.tsx",
  "src/components/site/Hero.tsx",
  "src/components/site/Services.tsx",
  "src/components/site/Contact.tsx",
  "src/components/site/Footer.tsx",
  "src/routes/index.tsx",
  "src/index.css",
];

function planFor(instruction: string) {
  return createEditPlan({
    existingFiles: EXISTING_FILES,
    instruction,
    intent: classifyEditIntent({
      existingFiles: EXISTING_FILES,
      instruction,
    }),
    latestSuccessfulCheckpoint: CHECKPOINT,
    verifiedFactFingerprint: FACT_FINGERPRINT,
  });
}

describe("edit plan", () => {
  it("validates every executable plan with its fact and checkpoint boundaries", () => {
    const result = planFor(
      "Buat website terasa lebih premium dengan layout baru.",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(editPlanSchema.safeParse(result.plan).success).toBe(true);
      expect(result.plan.verifiedFactFingerprint).toBe(FACT_FINGERPRINT);
      expect(result.plan.latestSuccessfulCheckpoint).toEqual(CHECKPOINT);
    }
  });

  it("keeps surgical plans within two presentation files", () => {
    const result = planFor(
      "Ubah warna utama saja, jangan ubah layout atau isi.",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.magnitude).toBe("surgical");
      expect(result.plan.targetFiles.length).toBeLessThanOrEqual(2);
    }
  });

  it("gives a structural premium plan multiple presentation operations", () => {
    const result = planFor(
      "Buat website terasa lebih premium dengan hierarki, komposisi, dan responsive layout yang lebih matang.",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const presentationKinds = new Set<EditPlanOperationKind>(
        result.plan.operations
          .map((operation) => operation.kind)
          .filter((kind) =>
            ["update_style", "redesign_layout", "responsive_layout"].includes(
              kind,
            ),
          ),
      );
      expect(presentationKinds.size).toBeGreaterThanOrEqual(3);
      expect(result.plan.targetFiles.length).toBeGreaterThan(2);
    }
  });

  it.each([
    ["Tambahkan section FAQ dari jawaban yang saya berikan.", "add_section"],
    ["Hapus section tarif yang tidak ingin saya tampilkan.", "remove_section"],
    ["Pakai foto yang saya unggah sebagai gambar utama.", "update_media"],
  ] as const)("maps %s to one matching operation", (instruction, kind) => {
    const result = planFor(instruction);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.plan.operations.filter((operation) => operation.kind === kind),
      ).toHaveLength(1);
    }
  });

  it("fails closed before execution when clarification or checkpoint proof is missing", () => {
    const ambiguous = createEditPlan({
      existingFiles: EXISTING_FILES,
      instruction: "Tolong bikin lebih bagus.",
      intent: classifyEditIntent({ instruction: "Tolong bikin lebih bagus." }),
      latestSuccessfulCheckpoint: CHECKPOINT,
      verifiedFactFingerprint: FACT_FINGERPRINT,
    });
    const missingCheckpoint = createEditPlan({
      existingFiles: EXISTING_FILES,
      instruction: "Ubah warna utama.",
      intent: classifyEditIntent({
        existingFiles: EXISTING_FILES,
        instruction: "Ubah warna utama.",
      }),
      latestSuccessfulCheckpoint: null,
      verifiedFactFingerprint: FACT_FINGERPRINT,
    });

    expect(ambiguous).toEqual({
      ok: false,
      code: "clarification_required",
    });
    expect(missingCheckpoint).toEqual({
      ok: false,
      code: "checkpoint_required",
    });
  });
});

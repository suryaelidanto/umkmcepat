import { describe, expect, it } from "vitest";

import { planCanonicalBriefMigration } from "./migrate-canonical-briefs";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    prompt: "buat website",
    brief: {
      businessName: "Kopi Sela",
      productOrService: [{ name: "Espresso", isPrimary: true }],
      targetCustomer: "Pekerja remote",
      contact: {
        channel: "whatsapp",
        label: "Pesan",
        value: "08123456789",
      },
      stylePreference: "Hangat",
      umkmType: "jasa_online",
      fieldState: { visuals: "declined" },
    },
    workspaceCard: { type: "build_recommendation", engine: "legacy-v1" },
    activeHandoffId: null,
    handoffs: [{ id: "h-draft", status: "draft" }],
    ...overrides,
  };
}

describe("canonical brief migration planning", () => {
  it("converts V1 to V2 and invalidates stale draft proof", () => {
    const plan = planCanonicalBriefMigration(row());

    expect(plan.pendingWrite).toBe(true);
    expect(plan.brief.version).toBe(2);
    expect("productOrService" in plan.brief).toBe(false);
    expect(plan.workspaceCard).toBeNull();
    expect(plan.supersedeDraftHandoffIds).toEqual(["h-draft"]);
    expect(plan.blockers).toEqual([]);
  });

  it("is idempotent for canonical rows with no stale draft", () => {
    const migrated = planCanonicalBriefMigration(row());
    const rerun = planCanonicalBriefMigration(
      row({
        brief: migrated.brief,
        workspaceCard: migrated.workspaceCard,
        handoffs: [],
      }),
    );

    expect(rerun.pendingWrite).toBe(false);
    expect(rerun.supersedeDraftHandoffIds).toEqual([]);
  });

  it("treats reordered canonical JSONB keys as already migrated", () => {
    const migrated = planCanonicalBriefMigration(row());
    const reordered = {
      provenance: migrated.brief.provenance,
      assets: migrated.brief.assets,
      content: migrated.brief.content,
      fieldState: migrated.brief.fieldState,
      visualDirection: migrated.brief.visualDirection,
      primaryAction: migrated.brief.primaryAction,
      audience: migrated.brief.audience,
      offers: migrated.brief.offers,
      business: migrated.brief.business,
      prompt: migrated.brief.prompt,
      version: migrated.brief.version,
    };
    const rerun = planCanonicalBriefMigration(
      row({ brief: reordered, workspaceCard: null, handoffs: [] }),
    );

    expect(rerun.pendingWrite).toBe(false);
  });

  it("never supersedes accepted historical handoffs", () => {
    const plan = planCanonicalBriefMigration(
      row({
        activeHandoffId: "h-accepted",
        handoffs: [
          { id: "h-accepted", status: "accepted" },
          { id: "h-draft", status: "draft" },
        ],
      }),
    );

    expect(plan.supersedeDraftHandoffIds).toEqual(["h-draft"]);
    expect(plan.activeHandoffId).toBe("h-accepted");
  });

  it("reports ambiguous projects as blocked without inventing facts", () => {
    const plan = planCanonicalBriefMigration(
      row({ brief: { businessName: "HP Surya" }, handoffs: [] }),
    );

    expect(plan.blockers).toContain("offers");
    expect(plan.brief.offers).toEqual([]);
    expect(plan.brief.primaryAction).toBeNull();
  });
});

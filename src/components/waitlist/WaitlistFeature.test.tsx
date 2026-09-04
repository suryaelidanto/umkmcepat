import { describe, expect, it } from "vitest";

import { waitlistSchema, type WaitlistFeatureProps } from "./WaitlistFeature";

describe("WaitlistFeature contracts and invariants", () => {
  it("validates valid waitlist input against waitlistSchema", () => {
    const dummyFile = new File(["dummy"], "photo.png", { type: "image/png" });
    const validData = {
      businessName: "Kopi Nusantara",
      businessType: "Makanan & Minuman",
      storyOffers: "Kopi robusta asli Lampung",
      storySince: "1 - 3 tahun" as const,
      storyGoal: "Ingin memperluas jangkauan pembeli online",
      photo: [dummyFile],
    };

    const parsed = waitlistSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it("fails validation when businessName is too short", () => {
    const invalidData = {
      businessName: "A",
      businessType: "Fashion",
      storyOffers: "Baju batik",
      storySince: "Kurang dari 6 bulan" as const,
      storyGoal: "Website jualan",
      photo: [new File(["dummy"], "photo.png", { type: "image/png" })],
    };

    const parsed = waitlistSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
  });

  it("satisfies WaitlistFeatureProps contract shape", () => {
    const props: WaitlistFeatureProps = {
      initialOwn: null,
      isAdmin: false,
    };
    expect(props.isAdmin).toBe(false);
    expect(props.initialOwn).toBeNull();
  });
});

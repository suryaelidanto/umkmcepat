import { describe, expect, it } from "vitest";

import { createInitialBrief, parseProjectBrief } from "./brief";
import {
  buildImplementationSpecPrompt,
  createFallbackImplementationSpec,
  implementationSpecToSiteSchema,
  parseImplementationSpec,
} from "./implementation-spec";

describe("implementation spec", () => {
  it("accepts AI-decided interactive app structure instead of forcing landing", () => {
    const fallback = createFallbackImplementationSpec(
      createInitialBrief("butuh booking barbershop"),
    );
    const spec = parseImplementationSpec(
      {
        appKind: "interactive_app",
        businessName: "Barber Rapi",
        pages: [
          {
            slug: "/",
            title: "Booking potong rambut tanpa ribet",
            purpose: "Membantu pelanggan memilih layanan dan niat jadwal.",
          },
        ],
        components: [
          {
            name: "BookingIntent",
            purpose: "Form statis pilihan layanan dan waktu.",
          },
          { name: "ServiceMenu", purpose: "Daftar layanan barber." },
        ],
        features: ["booking_intent_form", "service_menu"],
        content: {
          offer: "Potong rambut dan grooming",
          audience: "Pria aktif",
        },
        style: { direction: "Maskulin, rapi, kontras hangat." },
        notes: [],
      },
      fallback,
    );

    expect(spec.appKind).toBe("interactive_app");
    expect(spec.features).toContain("booking_intent_form");
    expect(implementationSpecToSiteSchema(spec).eyebrow).toBe(
      "Aplikasi interaktif",
    );
  });

  it("keeps legacy brief metadata as prompt context without making it the structure", () => {
    const prompt = buildImplementationSpecPrompt(
      parseProjectBrief(
        {
          confidence: 96,
          businessType: "Rental PS",
          offer: "Paket rental PS per jam",
          notes: ["Butuh katalog paket dan aturan booking"],
        },
        "buat app rental ps",
      ),
    );

    expect(prompt).toContain("Rental PS");
    expect(prompt).toContain("AI confidence: 96%");
    expect(prompt).not.toContain("primaryCta");
  });
});

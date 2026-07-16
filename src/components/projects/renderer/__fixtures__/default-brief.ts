import type { ProjectBrief } from "@/lib/projects/brief";

/**
 * Minimal fully-populated `ProjectBrief` for renderer tests. Every soft field
 * is `null` so each test can flip exactly one field on without inheriting
 * noise from a previous case.
 */
export const defaultBrief: ProjectBrief = {
  version: 1,
  prompt: "buatkan website usaha lokal",
  businessName: "Usaha Lokal",
  businessType: "Usaha lokal",
  offer: "Layanan utama usaha",
  targetCustomer: "Pelanggan sekitar",
  contactOrCta: "Hubungi kami",
  stylePreference: "Tampilan bersih",
  notes: [],
  productOrService: null,
  contact: null,
  tagline: null,
  usp: null,
  priceRange: null,
  visuals: null,
  hours: null,
  address: null,
  deliveryArea: null,
  since: null,
  testimonials: null,
  certifications: null,
  paymentMethods: null,
  socialLinks: null,
  currentPromo: null,
  secondaryCta: null,
  readyForBuild: false,
};

import { z } from "zod";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

// Export the category list
export const KATEGORI_USAHA = [
  "Makanan & Minuman",
  "Fashion",
  "Jasa Digital",
  "Jasa Kreatif",
  "Kesehatan & Kecantikan",
  "Edukasi",
  // 'Lainnya' is handled separately in the form/enum logic usually
] as const; // Use 'as const' for stricter typing

// Define social platforms
export const SOCIAL_PLATFORMS = [
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
  "Twitter (X)",
  "LinkedIn",
  "Pinterest",
  "Website",
  "WhatsApp",
  "Telegram",
] as const;

// Base schema without refinement
const baseLandingPageSchema = z.object({
  businessName: z
    .string()
    .min(3, { message: "Nama usaha minimal 3 karakter" })
    .max(50, { message: "Nama usaha maksimal 50 karakter" }),
  category: z.enum([...KATEGORI_USAHA, "Lainnya"], {
    errorMap: () => ({ message: "Pilih category usaha yang valid" }),
  }),
  otherCategory: z.string().nullish(), // Allow string, null, or undefined
  userDescription: z
    .string()
    .max(2000, { message: "Deskripsi maksimal 2000 karakter" })
    .optional()
    .nullable(),
  images: z
    .custom<FileList | undefined>() // Allow undefined initially
    .refine(
      (files) => files === undefined || files.length === 0 || files.length <= 3,
      "Maksimal 3 gambar.",
    )
    .refine(
      (files) =>
        files === undefined ||
        files.length === 0 ||
        Array.from(files).every((file) => file.size <= MAX_FILE_SIZE),
      `Ukuran maks per gambar adalah 5MB.`,
    )
    .refine(
      (files) =>
        files === undefined ||
        files.length === 0 ||
        Array.from(files).every((file) =>
          ACCEPTED_IMAGE_TYPES.includes(file.type),
        ),
      ".jpg, .jpeg, .png, dan .webp saja yang diterima.",
    )
    .optional(),
  whatsappNumber: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => {
        // Allow null, undefined, or empty string
        if (val === null || val === undefined || val === "") {
          return true;
        }
        // If a non-empty string is provided, validate format
        return /^(\+62|62|0)8[1-9][0-9]{7,11}$/.test(val);
      },
      {
        message:
          "Format nomor WhatsApp tidak valid (contoh: 62812...) atau biarkan kosong",
      },
    ),

  // === UPDATED OPTIONAL FIELDS ===
  testimonials: z
    .array(
      z.object({
        name: z
          .string()
          .min(1, { message: "Nama tidak boleh kosong" })
          .max(50, { message: "Nama maksimal 50 karakter" }),
        comment: z
          .string()
          .min(5, { message: "Komentar minimal 5 karakter" })
          .max(200, { message: "Komentar maksimal 200 karakter" }),
      }),
    )
    .max(3, { message: "Maksimal 3 testimoni" })
    .optional(),

  address: z
    .string()
    .max(200, { message: "Alamat maksimal 200 karakter" })
    .optional(),

  socialLinks: z
    .array(
      z.object({
        platform: z.enum(SOCIAL_PLATFORMS, {
          errorMap: () => ({ message: "Pilih platform yang valid" }),
        }),
        url: z
          .string()
          .url({ message: "URL tidak valid" })
          .min(5, { message: "URL minimal 5 karakter" }),
      }),
    )
    .max(3, { message: "Maksimal 3 link sosial media" })
    .optional(),

  // Optional Color Theme (passed as stringified JSON from form)
  colorThemeJson: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) {
          return true;
        } // Optional or null is fine
        try {
          JSON.parse(val);
          return true;
        } catch (e: unknown) {
          console.error("Error parsing color theme JSON:", e);
          return false;
        }
      },
      { message: "Format JSON skema warna tidak valid" },
    ),
});

// Apply refinement to the base schema
export const landingPageSchema = baseLandingPageSchema.refine(
  (data) => {
    // If category is 'Lainnya', otherCategory must be provided
    if (data.category === "Lainnya") {
      return !!data.otherCategory && data.otherCategory.trim().length > 0;
    }
    return true;
  },
  {
    message: "Nama category harus diisi jika memilih 'Lainnya'",
    path: ["otherCategory"], // Point error to the relevant field
  },
);

export type LandingPageSchema = z.infer<typeof landingPageSchema>;

// Export the base schema separately if needed for omit/pick
export const baseLandingPageSchemaForOmit = baseLandingPageSchema;

// Schema for AI Tweak Input
export const tweakSchema = z.object({
  instruction: z
    .string()
    .min(5, { message: "Instruksi minimal 5 karakter" })
    .max(200, { message: "Instruksi maksimal 200 karakter" }),
  slug: z.string(), // Include slug to identify the page to tweak
});

export type TweakSchema = z.infer<typeof tweakSchema>;

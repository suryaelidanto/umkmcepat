import { z } from 'zod';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Export the category list
export const KATEGORI_USAHA = [
    'Makanan & Minuman',
    'Fashion',
    'Jasa Digital',
    'Jasa Kreatif',
    'Kesehatan & Kecantikan',
    'Edukasi',
    // 'Lainnya' is handled separately in the form/enum logic usually
] as const; // Use 'as const' for stricter typing

// Base schema without refinement
const baseLandingPageSchema = z.object({
  namaUsaha: z.string().min(3, { message: 'Nama usaha minimal 3 karakter' }).max(50, { message: 'Nama usaha maksimal 50 karakter' }),
  kategori: z.enum([
    ...KATEGORI_USAHA,
    'Lainnya' // Add 'Lainnya' explicitly here
  ], { errorMap: () => ({ message: 'Pilih kategori usaha yang valid' }) }), // Use the constant here
  kategoriLainnya: z.string().optional(),
  deskripsi_user: z.string().max(500, { message: 'Deskripsi maksimal 500 karakter' }).optional(),
  images: z
    .custom<FileList>()
    .refine((files) => files === undefined || files.length === 0 || files.length <= 3, 'Maksimal 3 gambar.')
    .refine(
      (files) =>
        files === undefined ||
        files.length === 0 ||
        Array.from(files).every((file) => file.size <= MAX_FILE_SIZE),
      `Ukuran maks per gambar adalah 5MB.`
    )
    .refine(
      (files) =>
        files === undefined ||
        files.length === 0 ||
        Array.from(files).every((file) => ACCEPTED_IMAGE_TYPES.includes(file.type)),
      '.jpg, .jpeg, .png, dan .webp saja yang diterima.'
    )
    .optional(),
  whatsapp: z.string()
    .regex(/^(\+62|62|0)8[1-9][0-9]{7,11}$/, { message: 'Format nomor WhatsApp tidak valid (contoh: 62812...) ' })
    .optional()
    .or(z.literal('')), // Allow empty string
});

// Apply refinement to the base schema
export const landingPageSchema = baseLandingPageSchema.refine((data) => {
  // If kategori is 'Lainnya', kategoriLainnya must be provided
  if (data.kategori === 'Lainnya') {
    return !!data.kategoriLainnya && data.kategoriLainnya.trim().length > 0;
  }
  return true;
}, {
  message: 'Nama kategori harus diisi jika memilih \'Lainnya\'',
  path: ['kategoriLainnya'], // Point error to the relevant field
});

export type LandingPageSchema = z.infer<typeof landingPageSchema>;

// Export the base schema separately if needed for omit/pick
export const baseLandingPageSchemaForOmit = baseLandingPageSchema;

// Schema for AI Tweak Input
export const tweakSchema = z.object({
  instruction: z.string().min(5, { message: 'Instruksi minimal 5 karakter' }).max(200, { message: 'Instruksi maksimal 200 karakter' }),
  slug: z.string() // Include slug to identify the page to tweak
});

export type TweakSchema = z.infer<typeof tweakSchema>; 
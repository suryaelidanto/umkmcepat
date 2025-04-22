import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
// Import the base schema for omit
import { generateLandingPageContent } from '@/lib/ai';
import { fileToBuffer, uploadImageToCloudinary } from '@/lib/cloudinary';
import { checkRateLimit } from '@/lib/rate-limit'; // Import rate limit checker
import { generateRandomString, slugify } from '@/lib/utils';
// Import the base schema to apply refinement after omit
import type { ColorThemeJson } from '@/lib/ai'; // Import types
import { auth } from '@/lib/auth'; // Import auth untuk cek sesi
import { baseLandingPageSchemaForOmit } from '@/lib/zod-schemas';

// Define types for testimonials and social links
type Testimonial = {
  name: string;
  comment: string;
}

type SocialLink = {
  platform: string;
  url: string;
}

// Definisikan tema warna default (disamakan dengan di LandingPageDisplay - Attempt 2, careful syntax)
const defaultColorTheme: ColorThemeJson = {
  primary: "hsl(222.2 47.4% 11.2%)",
  "on-primary": "hsl(0 0% 100%)",
  secondary: "hsl(210 40% 96.1%)",
  "on-secondary": "hsl(222.2 47.4% 11.2%)",
  background: "hsl(0 0% 100%)",
  "on-background": "hsl(222.2 47.4% 11.2%)",
  surface: "hsl(0 0% 100%)",
  "on-surface": "hsl(222.2 47.4% 11.2%)",
  accent: "hsl(217.2 91.2% 59.8%)",
  muted: "hsl(210 40% 96.1%)",
  border: "hsl(214.3 31.8% 91.4%)",
  success: "hsl(142.1 70.6% 45.3%)",
  error: "hsl(0 84.2% 60.2%)",
  card: "hsl(0 0% 100%)",
  "on-card": "hsl(222.2 47.4% 11.2%)",
  popover: "hsl(0 0% 100%)",
  "on-popover": "hsl(222.2 47.4% 11.2%)",
  destructive: "hsl(0 84.2% 60.2%)",
  "on-destructive": "hsl(0 0% 100%)",
  input: "hsl(214.3 31.8% 91.4%)",
  ring: "hsl(215 20.2% 65.1%)",
  foreground: "hsl(222.2 47.4% 11.2%)",
  primary_foreground: "hsl(0 0% 100%)",
  secondary_foreground: "hsl(222.2 47.4% 11.2%)",
  muted_foreground: "hsl(215.4 16.3% 46.9%)",
  accent_foreground: "hsl(0 0% 100%)",
  destructive_foreground: "hsl(0 0% 100%)",
  card_foreground: "hsl(222.2 47.4% 11.2%)",
  popover_foreground: "hsl(222.2 47.4% 11.2%)",
};

// POST /api/landing - Create a new landing page
export async function POST(request: Request) {
  try {
    // Apply rate limiting first
    const rateLimitResponse = await checkRateLimit(request, 'ai');
    if (rateLimitResponse) return rateLimitResponse;

    // Cek sesi user (tidak wajib login)
    const session = await auth();
    const userId = session?.user?.id; // Bisa null jika tidak login

    const formData = await request.formData();

    // Extract basic fields AND optional color theme
    const colorThemeJsonString = formData.get('colorThemeJson') as string | null;
    const rawData = {
      namaUsaha: formData.get('namaUsaha'),
      kategori: formData.get('kategori'),
      kategoriLainnya: formData.get('kategoriLainnya'),
      deskripsi_user: formData.get('deskripsi_user'),
      whatsapp: formData.get('whatsapp'),
      colorThemeJson: colorThemeJsonString, // Sertakan untuk validasi Zod
      // Images handled later
    };

    // Validate text fields including colorThemeJson
    const validationSchemaWithColor = baseLandingPageSchemaForOmit
      .omit({ images: true })
      .refine((data) => {
        if (data.kategori === 'Lainnya') {
          return !!data.kategoriLainnya && data.kategoriLainnya.trim().length > 0;
        }
        return true;
      }, {
        message: 'Nama kategori harus diisi jika memilih \'Lainnya\'',
        path: ['kategoriLainnya'],
      });

    // Gunakan skema baru untuk validasi
    const validationResult = validationSchemaWithColor.safeParse(rawData);

    if (!validationResult.success) {
      console.error("Validation Errors:", validationResult.error.flatten());
      return NextResponse.json(
        { message: 'Data tidak valid', errors: validationResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Ambil data yang sudah divalidasi (termasuk colorThemeJson jika ada)
    const { namaUsaha, kategori, deskripsi_user, whatsapp, colorThemeJson } = validationResult.data;
    const finalKategori = kategori === 'Lainnya' ? formData.get('kategoriLainnya') as string : kategori;

    // Tentukan tema warna yang akan disimpan
    let resolvedTheme: ColorThemeJson = defaultColorTheme;
    if (colorThemeJson) {
      try {
        resolvedTheme = JSON.parse(colorThemeJson);
        // TODO: Lakukan validasi lebih ketat di sini bahwa semua key ada dan formatnya benar
      } catch (e) {
        console.error("Failed to parse colorThemeJson, using default:", e);
        // Jika gagal parse (meskipun Zod sudah cek), fallback ke default
        resolvedTheme = defaultColorTheme;
      }
    }

    // Handle Image Uploads to Cloudinary
    const imageFiles = formData.getAll('images') as File[];
    const uploadedImageData: { url: string; publicId: string }[] = [];

    if (imageFiles && imageFiles.length > 0 && imageFiles[0].size > 0) {
      // Validate image count/type/size again on the server (optional but recommended)
      if (imageFiles.length > 3) {
        return NextResponse.json({ message: 'Maksimal 3 gambar' }, { status: 400 });
      }
      // Add more server-side validation if needed (size, type)

      for (const file of imageFiles) {
        try {
          const buffer = await fileToBuffer(file);
          const uniqueFileName = `${slugify(namaUsaha)}-${generateRandomString(4)}-${Date.now()}`;
          // Get both url and publicId
          const { secure_url, public_id } = await uploadImageToCloudinary(buffer, uniqueFileName);
          uploadedImageData.push({ url: secure_url, publicId: public_id });
        } catch (uploadError) {
          console.error("Image upload failed:", uploadError);
          return NextResponse.json({ message: 'Gagal mengupload salah satu gambar.' }, { status: 500 });
        }
      }
    }

    // Generate unique slug
    let pageSlug = slugify(namaUsaha);
    let existingPage = await prisma.landingPage.findUnique({ where: { slug: pageSlug } });
    let attempts = 0;
    while (existingPage && attempts < 5) {
      pageSlug = `${slugify(namaUsaha)}-${generateRandomString(6)}`;
      existingPage = await prisma.landingPage.findUnique({ where: { slug: pageSlug } });
      attempts++;
    }
    if (existingPage) {
      throw new Error("Gagal membuat slug unik setelah beberapa percobaan.");
    }

    // Generate AI Content
    const hasWhatsApp = !!whatsapp && whatsapp.length > 5;
    const aiContent = await generateLandingPageContent(
      namaUsaha,
      finalKategori,
      deskripsi_user || undefined,
      hasWhatsApp
    );

    // If AI provides whatsappNumber, ensure it matches user input if CTA is true
    if (aiContent.whatsappCTA && hasWhatsApp) {
      aiContent.whatsappNumber = whatsapp; // Use user-provided number
    } else if (aiContent.whatsappCTA && !hasWhatsApp) {
      aiContent.whatsappCTA = false; // Correct AI if it hallucinated WA CTA
      delete aiContent.whatsappNumber;
    } else {
      delete aiContent.whatsappNumber; // Remove if CTA is false
    }

    // === Get Optional Fields ===
    const testimonialsString = formData.get('testimonials') as string | null;
    const address = formData.get('address') as string | null;
    const socialLinksString = formData.get('socialLinks') as string | null;

    // Parse JSON strings into arrays
    let testimonials: Testimonial[] = [];
    try {
      testimonials = testimonialsString ? JSON.parse(testimonialsString) : [];
    } catch (e) {
      console.error("Failed to parse testimonials JSON:", e);
      // Handle error, maybe return bad request?
    }

    let socialLinks: SocialLink[] = [];
    try {
      socialLinks = socialLinksString ? JSON.parse(socialLinksString) : [];
    } catch (e) {
      console.error("Failed to parse socialLinks JSON:", e);
      // Handle error
    }

    // Add logging to check the userId value before saving
    console.log(`Attempting to create LandingPage with userId: ${userId ?? 'null'}`); // Log null if userId is undefined

    // Save to Database
    const newLandingPage = await prisma.landingPage.create({
      data: {
        slug: pageSlug,
        namaUsaha: namaUsaha,
        kategori: finalKategori,
        whatsapp: whatsapp || null,
        aiContent: JSON.stringify(aiContent),
        images: uploadedImageData.map(img => img.url),
        imagePublicIds: uploadedImageData.map(img => img.publicId),
        userId: userId, // Simpan userId jika ada, null jika tidak
        isClaimed: !!userId, // isClaimed true HANYA jika user login saat membuat
        tweaksLeft: 5,
        address: address || null,
        testimonials: JSON.stringify(testimonials),
        socialLinks: JSON.stringify(socialLinks),
        colorTheme: JSON.stringify(resolvedTheme),
      },
    });

    console.log("New Landing Page Created:", newLandingPage.id, "Slug:", pageSlug, "UserID:", userId);

    // Return slug ONLY (tanpa edit token)
    return NextResponse.json(
      { slug: pageSlug, message: 'Landing page berhasil dibuat!' },
      { status: 201 }
    );

  } catch (error) {
    console.error("Error creating landing page:", error);
    let message = 'Terjadi kesalahan saat membuat halaman.';
    if (error instanceof Error) {
      // Don't expose sensitive internal messages directly
      if (error.message.includes("Cloudinary")) {
        message = "Gagal mengupload gambar. Coba lagi.";
      } else if (error.message.includes("OpenAI") || error.message.includes("konten AI")) {
        message = "Gagal menghasilkan konten AI. Coba lagi nanti.";
      } else if (error.message.includes("slug unik")) {
        message = "Gagal membuat alamat unik untuk halaman Anda. Coba nama usaha yang sedikit berbeda.";
      }
      // Log full error server-side for debugging
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

// Note: We might need a PUT/PATCH endpoint later for the /edit/[slug] page
// PUT /api/landing/[slug]?token=...
// OR handle edits via Server Actions 
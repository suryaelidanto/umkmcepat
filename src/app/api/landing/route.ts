import { NextResponse } from "next/server";

import { generateLandingPageContent } from "@/lib/ai";
import { auth } from "@/lib/auth"; // Import auth untuk cek sesi
import { prisma } from "@/lib/prisma";
// Import the base schema for omit
import { checkRateLimit } from "@/lib/rate-limit"; // Import rate limit checker
import { buildImageKey, fileToBuffer, storage } from "@/lib/storage";
import { generateRandomString, slugify } from "@/lib/utils";
// Import the base schema to apply refinement after omit
import { baseLandingPageSchemaForOmit } from "@/lib/zod-schemas";

import type { ColorThemeJson } from "@/lib/ai"; // Import types
import type { Prisma } from "@prisma/client";

// Define types for testimonials and social links
type Testimonial = {
  name: string;
  comment: string;
};

type SocialLink = {
  platform: string;
  url: string;
};

// Definisikan tema warna default (disamakan dengan di LandingPageDisplay - Attempt 2, careful syntax)
const defaultColorTheme: ColorThemeJson = {
  primary: "#1c1c1c",
  "on-primary": "#fcfbf8",
  secondary: "#f7f4ed",
  "on-secondary": "#1c1c1c",
  background: "#fcfbf8",
  "on-background": "#1c1c1c",
  surface: "#fcfbf8",
  "on-surface": "#1c1c1c",
  accent: "#eceae4",
  muted: "#f7f4ed",
  border: "#d8d5cc",
  success: "#1c1c1c",
  error: "#9f1d1d",
  card: "#fcfbf8",
  "on-card": "#1c1c1c",
  popover: "#fcfbf8",
  "on-popover": "#1c1c1c",
  destructive: "#9f1d1d",
  "on-destructive": "#fcfbf8",
  input: "#d8d5cc",
  ring: "#1c1c1c",
  foreground: "#1c1c1c",
  primary_foreground: "#fcfbf8",
  secondary_foreground: "#1c1c1c",
  muted_foreground: "#5f5f5d",
  accent_foreground: "#fcfbf8",
  destructive_foreground: "#fcfbf8",
  card_foreground: "#1c1c1c",
  popover_foreground: "#1c1c1c",
};

// POST /api/landing - Create a new landing page
export async function POST(request: Request) {
  try {
    // Apply rate limiting first
    const rateLimitResponse = await checkRateLimit(request, "ai");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Cek sesi user (tidak wajib login)
    const session = await auth();
    const userId = session?.user?.id; // Bisa null jika tidak login

    const formData = await request.formData();

    // Extract basic fields AND optional color theme
    const colorThemeJsonString = formData.get("colorThemeJson") as
      | string
      | null;
    const rawData = {
      businessName: formData.get("businessName"),
      category: formData.get("category"),
      otherCategory: formData.get("otherCategory"),
      userDescription: formData.get("userDescription"),
      whatsappNumber: formData.get("whatsappNumber"),
      colorThemeJson: colorThemeJsonString, // Sertakan untuk validasi Zod
      // Images handled later
    };

    // Validate text fields including colorThemeJson
    const validationSchemaWithColor = baseLandingPageSchemaForOmit
      .omit({ images: true })
      .refine(
        (data) => {
          if (data.category === "Lainnya") {
            return !!data.otherCategory && data.otherCategory.trim().length > 0;
          }
          return true;
        },
        {
          message: "Nama category harus diisi jika memilih 'Lainnya'",
          path: ["otherCategory"],
        },
      );

    // Gunakan skema baru untuk validasi
    const validationResult = validationSchemaWithColor.safeParse(rawData);

    if (!validationResult.success) {
      console.error("Validation Errors:", validationResult.error.flatten());
      return NextResponse.json(
        {
          message: "Data tidak valid",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    // Ambil data yang sudah divalidasi (termasuk colorThemeJson jika ada)
    const {
      businessName,
      category,
      userDescription,
      whatsappNumber,
      colorThemeJson,
    } = validationResult.data;
    const finalCategory =
      category === "Lainnya"
        ? (formData.get("otherCategory") as string)
        : category;

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

    // Handle image uploads through the configured storage provider
    const imageFiles = formData.getAll("images") as File[];
    const uploadedImageData: { url: string; publicId: string }[] = [];

    if (imageFiles && imageFiles.length > 0 && imageFiles[0].size > 0) {
      // Validate image count/type/size again on the server (optional but recommended)
      if (imageFiles.length > 3) {
        return NextResponse.json(
          { message: "Maksimal 3 gambar" },
          { status: 400 },
        );
      }
      // Add more server-side validation if needed (size, type)

      for (const file of imageFiles) {
        try {
          const buffer = await fileToBuffer(file);
          const uniqueFileName = `${slugify(businessName)}-${generateRandomString(4)}-${Date.now()}`;
          const key = buildImageKey(uniqueFileName, file.type);
          const uploadResult = await storage.upload({
            buffer,
            key,
            contentType: file.type,
          });
          uploadedImageData.push({
            url: uploadResult.url,
            publicId: uploadResult.key,
          });
        } catch (uploadError) {
          console.error("Image upload failed:", uploadError);
          return NextResponse.json(
            { message: "Gagal mengupload salah satu gambar." },
            { status: 500 },
          );
        }
      }
    }

    // Generate unique slug
    let pageSlug = slugify(businessName);
    let existingPage = await prisma.landingPage.findUnique({
      where: { slug: pageSlug },
    });
    let attempts = 0;
    while (existingPage && attempts < 5) {
      pageSlug = `${slugify(businessName)}-${generateRandomString(6)}`;
      existingPage = await prisma.landingPage.findUnique({
        where: { slug: pageSlug },
      });
      attempts++;
    }
    if (existingPage) {
      throw new Error("Gagal membuat slug unik setelah beberapa percobaan.");
    }

    // Generate AI Content
    const hasWhatsApp = !!whatsappNumber && whatsappNumber.length > 5;
    const aiContent = await generateLandingPageContent(
      businessName,
      finalCategory,
      userDescription || undefined,
      hasWhatsApp,
    );

    // If AI provides whatsappNumber, ensure it matches user input if CTA is true
    if (aiContent.whatsappCTA && hasWhatsApp) {
      aiContent.whatsappNumber = whatsappNumber; // Use user-provided number
    } else if (aiContent.whatsappCTA && !hasWhatsApp) {
      aiContent.whatsappCTA = false; // Correct AI if it hallucinated WA CTA
      delete aiContent.whatsappNumber;
    } else {
      delete aiContent.whatsappNumber; // Remove if CTA is false
    }

    // === Get Optional Fields ===
    const testimonialsString = formData.get("testimonials") as string | null;
    const address = formData.get("address") as string | null;
    const socialLinksString = formData.get("socialLinks") as string | null;

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

    // Save to Database
    await prisma.landingPage.create({
      data: {
        slug: pageSlug,
        businessName: businessName,
        category: finalCategory,
        whatsappNumber: whatsappNumber || null,
        aiContent: aiContent as unknown as Prisma.InputJsonValue,
        images: uploadedImageData.map((img) => img.url),
        imageKeys: uploadedImageData.map((img) => img.publicId),
        userId: userId,
        isClaimed: !!userId,
        tweaksLeft: 5,
        address: address || null,
        testimonials: testimonials as unknown as Prisma.InputJsonValue,
        socialLinks: socialLinks as unknown as Prisma.InputJsonValue,
        colorTheme: resolvedTheme as unknown as Prisma.InputJsonValue,
      },
    });

    // Return slug ONLY (tanpa edit token)
    return NextResponse.json(
      { slug: pageSlug, message: "Landing page berhasil dibuat!" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating landing page:", error);
    let message = "Terjadi kesalahan saat membuat halaman.";
    if (error instanceof Error) {
      // Don't expose sensitive internal messages directly
      if (
        error.message.includes("storage") ||
        error.message.includes("Storage") ||
        error.message.includes("S3")
      ) {
        message = "Gagal mengupload gambar. Coba lagi.";
      } else if (
        error.message.includes("AI") ||
        error.message.includes("konten AI")
      ) {
        message = "Gagal menghasilkan konten AI. Coba lagi nanti.";
      } else if (error.message.includes("slug unik")) {
        message =
          "Gagal membuat alamat unik untuk halaman Anda. Coba nama usaha yang sedikit berbeda.";
      }
      // Log full error server-side for debugging
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

// Note: We might need a PUT/PATCH endpoint later for the /edit/[slug] page
// PUT /api/landing/[slug]?token=...
// OR handle edits via Server Actions

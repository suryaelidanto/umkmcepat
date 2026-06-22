import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { generateLandingPageContent } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { buildImageKey, fileToBuffer, storage } from "@/lib/storage";
import { generateRandomString, slugify } from "@/lib/utils";
import { baseLandingPageSchemaForOmit as landingPageSchema } from "@/lib/zod-schemas";

// PUT /api/landing/[slug] - Update an existing landing page via token
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { message: "Token edit diperlukan" },
        { status: 401 },
      );
    }

    // 1. Verify Token and Page Status again before update
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug },
      select: { id: true, isClaimed: true, images: true, imageKeys: true },
    });

    if (!landingPage) {
      return NextResponse.json(
        { message: "Halaman tidak ditemukan" },
        { status: 404 },
      );
    }
    if (landingPage.isClaimed) {
      return NextResponse.json(
        { message: "Update tidak diizinkan (sudah diklaim)" },
        { status: 403 },
      );
    }

    // 2. Process FormData
    const formData = await request.formData();
    const rawData = {
      businessName: formData.get("businessName"),
      category: formData.get("category"),
      otherCategory: formData.get("otherCategory"),
      userDescription: formData.get("userDescription"),
      whatsappNumber: formData.get("whatsappNumber"),
    };

    // 3. Validate Text Fields
    const validationResult = landingPageSchema
      .omit({ images: true })
      .safeParse(rawData);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "Data tidak valid",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const { businessName, category, userDescription, whatsappNumber } =
      validationResult.data;
    // Use otherCategory if category is 'Lainnya'
    const finalCategory =
      category === "Lainnya"
        ? (formData.get("otherCategory") as string) || "Lainnya"
        : category;

    // 4. Handle Image Uploads (if new images provided)
    const imageFiles = formData.getAll("images") as File[];
    let updatedImageData: { url: string; publicId: string }[] = [];
    let deleteOldImages = false;

    if (imageFiles && imageFiles.length > 0 && imageFiles[0].size > 0) {
      deleteOldImages = true; // Flag to delete old images
      updatedImageData = []; // Reset image data array
      if (imageFiles.length > 3) {
        return NextResponse.json(
          { message: "Maksimal 3 gambar" },
          { status: 400 },
        );
      }
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
          updatedImageData.push({
            url: uploadResult.url,
            publicId: uploadResult.key,
          });
        } catch (uploadError) {
          console.error("Image upload failed during update:", uploadError);
          return NextResponse.json(
            { message: "Gagal mengupload gambar baru." },
            { status: 500 },
          );
        }
      }
    } else {
      // No new images uploaded, keep existing ones
      updatedImageData = landingPage.images.map((url, index) => ({
        url: url,
        publicId: landingPage.imageKeys?.[index] || "", // Try to map existing public IDs
      }));
    }

    // 5. Generate AI Content (based on updated data)
    const hasWhatsApp = !!whatsappNumber && whatsappNumber.length > 5;
    const aiContent = await generateLandingPageContent(
      businessName,
      finalCategory,
      userDescription || undefined,
      hasWhatsApp,
    );
    if (aiContent.whatsappCTA && hasWhatsApp) {
      aiContent.whatsappNumber = whatsappNumber;
    } else {
      delete aiContent.whatsappNumber;
    }

    // === Get Optional Fields ===
    const address = formData.get("address") as string | null;
    const testimonialsString = formData.get("testimonials") as string | null;
    const socialLinksString = formData.get("socialLinks") as string | null;

    // Parse JSON strings into arrays
    let testimonials = [];
    try {
      testimonials = testimonialsString ? JSON.parse(testimonialsString) : [];
    } catch (e) {
      console.error("Failed to parse testimonials JSON:", e);
    }

    let socialLinks = [];
    try {
      socialLinks = socialLinksString ? JSON.parse(socialLinksString) : [];
    } catch (e) {
      console.error("Failed to parse socialLinks JSON:", e);
    }

    // 6. Update Database
    await prisma.landingPage.update({
      where: { id: landingPage.id },
      data: {
        businessName: businessName,
        category: finalCategory,
        whatsappNumber: whatsappNumber || null,
        aiContent: aiContent as unknown as Prisma.InputJsonValue,
        images: updatedImageData.map((img) => img.url),
        imageKeys: updatedImageData.map((img) => img.publicId),
        // Update optional fields (use null to clear if empty string/not provided)
        address: address || null,
        testimonials:
          testimonials.length > 0
            ? (testimonials as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        socialLinks:
          socialLinks.length > 0
            ? (socialLinks as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
      },
    });

    // 7. Delete old images from the configured storage provider if new ones were uploaded
    if (
      deleteOldImages &&
      landingPage.imageKeys &&
      landingPage.imageKeys.length > 0
    ) {
      storage.delete(landingPage.imageKeys).catch((err) => {
        console.error(
          "Failed to delete old storage objects in background:",
          err,
        );
      });
    }

    // Return success response
    return NextResponse.json(
      { slug: slug, message: "Landing page berhasil diperbarui!" },
      { status: 200 },
    );
  } catch (error) {
    console.error(`Error updating landing page [${slug}]:`, error);
    let message = "Terjadi kesalahan saat menyimpan perubahan.";
    if (error instanceof Error) {
      // Don't expose sensitive internal messages directly
      if (
        error.message.includes("storage") ||
        error.message.includes("Storage") ||
        error.message.includes("S3")
      ) {
        message = "Gagal mengupload gambar baru. Coba lagi.";
      } else if (
        error.message.includes("AI") ||
        error.message.includes("konten AI")
      ) {
        message = "Gagal memperbarui konten AI. Coba lagi nanti.";
      } // Add other specific checks if needed
      // Log full error server-side
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

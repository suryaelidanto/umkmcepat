import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
// Import the base schema for omit
import { generateLandingPageContent } from '@/lib/ai';
import { fileToBuffer, uploadImageToCloudinary } from '@/lib/cloudinary';
import { checkRateLimit } from '@/lib/rate-limit'; // Import rate limit checker
import { generateRandomString, slugify } from '@/lib/utils';
import { baseLandingPageSchemaForOmit as landingPageSchema } from '@/lib/zod-schemas';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// POST /api/landing - Create a new landing page
export async function POST(request: Request) {
  try {
    // Apply rate limiting first (using stricter AI limit)
    const rateLimitResponse = await checkRateLimit(request, 'ai');
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();

    // Extract basic fields
    const rawData = {
      namaUsaha: formData.get('namaUsaha'),
      kategori: formData.get('kategori'),
      kategoriLainnya: formData.get('kategoriLainnya'),
      deskripsi_user: formData.get('deskripsi_user'),
      whatsapp: formData.get('whatsapp'),
      // We will handle images separately
    };

    // Validate text fields first using Zod (without images)
    const validationResult = landingPageSchema.omit({ images: true }).safeParse(rawData);

    if (!validationResult.success) {
      console.error("Validation Errors:", validationResult.error.flatten());
      return NextResponse.json(
        { message: 'Data tidak valid', errors: validationResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { namaUsaha, kategori, deskripsi_user, whatsapp } = validationResult.data;
    const finalKategori = kategori === 'Lainnya' ? formData.get('kategoriLainnya') as string : kategori;

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

    // Generate Edit Token
    const editToken = crypto.randomUUID();
    const saltRounds = 10;
    const hashedEditToken = await bcrypt.hash(editToken, saltRounds);

    // Generate AI Content
    const hasWhatsApp = !!whatsapp && whatsapp.length > 5;
    const aiContent = await generateLandingPageContent(
      namaUsaha,
      finalKategori,
      deskripsi_user,
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


    // Save to Database
    const newLandingPage = await prisma.landingPage.create({
      data: {
        slug: pageSlug,
        namaUsaha: namaUsaha,
        kategori: finalKategori,
        whatsapp: whatsapp || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiContent: aiContent as any, // Reverted to any, Prisma JSON type issue
        images: uploadedImageData.map(img => img.url), // Store only URLs
        imagePublicIds: uploadedImageData.map(img => img.publicId), // Store publicIds
        editToken: hashedEditToken,
        isClaimed: false,
        tweaksLeft: 5,
      },
    });

    console.log("New Landing Page Created:", newLandingPage.id, "Slug:", pageSlug);

    // Return slug and original edit token to the client
    return NextResponse.json(
        { slug: pageSlug, editToken: editToken, message: 'Landing page berhasil dibuat!' },
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
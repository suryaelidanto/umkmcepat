import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
// Import the base schema for omit
import { generateLandingPageContent } from '@/lib/ai';
import { fileToBuffer, uploadImageToCloudinary } from '@/lib/cloudinary';
import { checkRateLimit } from '@/lib/rate-limit'; // Import rate limit checker
import { generateRandomString, slugify } from '@/lib/utils';
// Import the base schema to apply refinement after omit
import { baseLandingPageSchemaForOmit } from '@/lib/zod-schemas';
import { auth } from '@/lib/auth'; // Import auth untuk cek sesi

// POST /api/landing - Create a new landing page
export async function POST(request: Request) {
  try {
    // Apply rate limiting first
    const rateLimitResponse = await checkRateLimit(request, 'ai');
    if (rateLimitResponse) return rateLimitResponse;

    // Cek sesi user
    const session = await auth();
    const userId = session?.user?.id;

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

    // Validate text fields: Omit images from the base schema, then apply refinement
    const validationSchemaForText = baseLandingPageSchemaForOmit
      .omit({ images: true })
      .refine((data) => {
        // Re-apply the same refinement logic
        if (data.kategori === 'Lainnya') {
          return !!data.kategoriLainnya && data.kategoriLainnya.trim().length > 0;
        }
        return true;
      }, {
        message: 'Nama kategori harus diisi jika memilih \'Lainnya\'',
        path: ['kategoriLainnya'],
      });

    const validationResult = validationSchemaForText.safeParse(rawData);

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

    // === Get Optional Fields ===
    const testimonialsString = formData.get('testimonials') as string | null;
    const address = formData.get('address') as string | null;
    const socialLinksString = formData.get('socialLinks') as string | null;

    // Parse JSON strings into arrays
    let testimonials = [];
    try {
      testimonials = testimonialsString ? JSON.parse(testimonialsString) : [];
    } catch (e) {
      console.error("Failed to parse testimonials JSON:", e);
      // Handle error, maybe return bad request?
    }

    let socialLinks = [];
    try {
      socialLinks = socialLinksString ? JSON.parse(socialLinksString) : [];
    } catch (e) {
      console.error("Failed to parse socialLinks JSON:", e);
      // Handle error
    }

    // Save to Database
    const newLandingPage = await prisma.landingPage.create({
      data: {
        slug: pageSlug,
        namaUsaha: namaUsaha,
        kategori: finalKategori,
        whatsapp: whatsapp || null,
        aiContent: aiContent as any,
        images: uploadedImageData.map(img => img.url),
        imagePublicIds: uploadedImageData.map(img => img.publicId),
        userId: userId, // Set userId jika user login, null jika tidak
        isClaimed: !!userId, // Set isClaimed true jika user login
        tweaksLeft: 5,
        address: address || null,
        testimonials: testimonials.length > 0 ? testimonials as any : undefined,
        socialLinks: socialLinks.length > 0 ? socialLinks as any : undefined,
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
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { baseLandingPageSchemaForOmit as landingPageSchema } from '@/lib/zod-schemas';
import { slugify, generateRandomString } from '@/lib/utils';
import { uploadImageToCloudinary, fileToBuffer, deleteImagesFromCloudinary } from '@/lib/cloudinary';
import { generateLandingPageContent } from '@/lib/ai';
import bcrypt from 'bcrypt';

// PUT /api/landing/[slug] - Update an existing landing page via token
export async function PUT(request: Request, { params }: { params: { slug: string } }) {
  try {
    const slug = params.slug;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ message: 'Token edit diperlukan' }, { status: 401 });
    }

    // 1. Verify Token and Page Status again before update
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug },
      select: { id: true, isClaimed: true, editToken: true, images: true, imagePublicIds: true },
    });

    if (!landingPage) {
      return NextResponse.json({ message: 'Halaman tidak ditemukan' }, { status: 404 });
    }
    if (landingPage.isClaimed || !landingPage.editToken) {
      return NextResponse.json({ message: 'Update tidak diizinkan (sudah diklaim atau token tidak valid)' }, { status: 403 });
    }
    const isTokenValid = await bcrypt.compare(token, landingPage.editToken);
    if (!isTokenValid) {
      return NextResponse.json({ message: 'Token edit tidak valid' }, { status: 403 });
    }

    // 2. Process FormData
    const formData = await request.formData();
    const rawData = {
      namaUsaha: formData.get('namaUsaha'),
      kategori: formData.get('kategori'),
      kategoriLainnya: formData.get('kategoriLainnya'),
      deskripsi_user: formData.get('deskripsi_user'),
      whatsapp: formData.get('whatsapp'),
    };

    // 3. Validate Text Fields
    const validationResult = landingPageSchema.omit({ images: true }).safeParse(rawData);
    if (!validationResult.success) {
      return NextResponse.json(
        { message: 'Data tidak valid', errors: validationResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { namaUsaha, kategori, deskripsi_user, whatsapp } = validationResult.data;
    // Use kategoriLainnya if kategori is 'Lainnya'
    const finalKategori = kategori === 'Lainnya' ? (formData.get('kategoriLainnya') as string || 'Lainnya') : kategori;

    // 4. Handle Image Uploads (if new images provided)
    const imageFiles = formData.getAll('images') as File[];
    let updatedImageData: { url: string; publicId: string }[] = [];
    let deleteOldImages = false;

    if (imageFiles && imageFiles.length > 0 && imageFiles[0].size > 0) {
      deleteOldImages = true; // Flag to delete old images
      updatedImageData = []; // Reset image data array
      if (imageFiles.length > 3) {
        return NextResponse.json({ message: 'Maksimal 3 gambar' }, { status: 400 });
      }
      for (const file of imageFiles) {
        try {
          const buffer = await fileToBuffer(file);
          const uniqueFileName = `${slugify(namaUsaha)}-${generateRandomString(4)}-${Date.now()}`;
          const { secure_url, public_id } = await uploadImageToCloudinary(buffer, uniqueFileName);
          updatedImageData.push({ url: secure_url, publicId: public_id });
        } catch (uploadError) {
          console.error("Image upload failed during update:", uploadError);
          return NextResponse.json({ message: 'Gagal mengupload gambar baru.' }, { status: 500 });
        }
      }
    } else {
      // No new images uploaded, keep existing ones
      updatedImageData = landingPage.images.map((url, index) => ({ 
        url: url, 
        publicId: landingPage.imagePublicIds?.[index] || '' // Try to map existing public IDs
      }));
    }

    // 5. Generate AI Content (based on updated data)
    const hasWhatsApp = !!whatsapp && whatsapp.length > 5;
    const aiContent = await generateLandingPageContent(
      namaUsaha,
      finalKategori,
      deskripsi_user,
      hasWhatsApp
    );
    if (aiContent.whatsappCTA && hasWhatsApp) {
      aiContent.whatsappNumber = whatsapp;
    } else {
      delete aiContent.whatsappNumber;
    }

    // 6. Update Database
    await prisma.landingPage.update({
      where: { id: landingPage.id },
      data: {
        namaUsaha: namaUsaha,
        kategori: finalKategori,
        whatsapp: whatsapp || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiContent: aiContent as any,
        images: updatedImageData.map(img => img.url),
        imagePublicIds: updatedImageData.map(img => img.publicId),
      },
    });

    // 7. Delete old images from Cloudinary if new ones were uploaded
    if (deleteOldImages && landingPage.imagePublicIds && landingPage.imagePublicIds.length > 0) {
      // Run deletion in background, don't wait for it
      deleteImagesFromCloudinary(landingPage.imagePublicIds).catch(err => {
        console.error("Failed to delete old Cloudinary images in background:", err);
      });
    }

    console.log(`Landing Page ${slug} updated successfully via token.`);

    // Return success response
    return NextResponse.json(
      { slug: slug, message: 'Landing page berhasil diperbarui!' },
      { status: 200 }
    );

  } catch (error) {
    console.error(`Error updating landing page [${params.slug}]:`, error);
    let message = 'Terjadi kesalahan saat menyimpan perubahan.';
     if (error instanceof Error) {
        // Don't expose sensitive internal messages directly
        if (error.message.includes("Cloudinary")) {
            message = "Gagal mengupload gambar baru. Coba lagi.";
        } else if (error.message.includes("OpenAI") || error.message.includes("konten AI")) {
            message = "Gagal memperbarui konten AI. Coba lagi nanti.";
        } // Add other specific checks if needed
        // Log full error server-side
    }
    return NextResponse.json({ message }, { status: 500 });
  }
} 
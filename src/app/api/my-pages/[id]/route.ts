import { AiGeneratedContent, ColorThemeJson } from '@/lib/ai'; // Import types
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { z } from 'zod'; // Import Zod

// Skema Zod untuk validasi data update (sesuaikan dengan field yang bisa diedit)
// Kita bisa mulai dengan subset dari skema pembuatan, atau buat yang baru
const updateLandingPageSchema = z.object({
  namaUsaha: z.string().min(3, "Nama usaha minimal 3 karakter").max(100),
  kategori: z.string().min(1, "Kategori wajib diisi"),
  whatsapp: z.string().optional().nullable(), // Opsional
  address: z.string().optional().nullable(),
  // testimonials: z.array(z.object({ name: z.string(), comment: z.string() })).optional(), // Perlu handling khusus
  // socialLinks: z.array(z.object({ platform: z.string(), url: z.string().url() })).optional(), // Perlu handling khusus
  // aiContent, colorTheme, images biasanya tidak diupdate langsung di form ini
});

// GET /api/my-pages/[id] - Fetch specific page data for editing
export async function GET(
  request: Request,
  { params: { id: pageId } }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Cek autentikasi
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Cari halaman berdasarkan ID
    const page = await prisma.landingPage.findUnique({
      where: { id: pageId },
      // Select all fields needed for the edit form
      select: {
        id: true,
        slug: true,
        namaUsaha: true,
        kategori: true,
        whatsapp: true,
        aiContent: true, 
        images: true,
        userId: true,
        testimonials: true,
        address: true,
        socialLinks: true,
        colorTheme: true,
      }
    });

    // 3. Jika halaman tidak ditemukan
    if (!page) {
      return NextResponse.json({ message: 'Halaman tidak ditemukan' }, { status: 404 });
    }

    // 4. Verifikasi kepemilikan
    if (page.userId !== userId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // 5. Kembalikan data halaman (dengan type assertion via unknown)
    return NextResponse.json({
        ...page,
        aiContent: page.aiContent as unknown as AiGeneratedContent, // Assert via unknown
        testimonials: page.testimonials as unknown as any[], // Assert via unknown
        socialLinks: page.socialLinks as unknown as any[], // Assert via unknown
        colorTheme: page.colorTheme as unknown as ColorThemeJson | null, // Assert via unknown
    }, { status: 200 });

  } catch (error) {
    console.error(`Error fetching page ${pageId}:`, error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

/*
// PUT /api/my-pages/[id] - Update page data
export async function PUT(
  request: Request,
  { params: { id: pageId } }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Cek autentikasi
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Baca data dari body request
    const body = await request.json();

    // 3. Validasi data body menggunakan Zod
    const validationResult = updateLandingPageSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { message: 'Data tidak valid', errors: validationResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const validatedData = validationResult.data;

    // 4. Cari halaman berdasarkan ID (sekaligus ambil userId untuk verifikasi)
    const page = await prisma.landingPage.findUnique({
      where: { id: pageId },
      select: { userId: true },
    });

    // 5. Jika halaman tidak ditemukan
    if (!page) {
      return NextResponse.json({ message: 'Halaman tidak ditemukan' }, { status: 404 });
    }

    // 6. Verifikasi kepemilikan
    if (page.userId !== userId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // 7. Update data halaman di database
    const updatedPage = await prisma.landingPage.update({
      where: { id: pageId },
      data: {
        namaUsaha: validatedData.namaUsaha,
        kategori: validatedData.kategori,
        whatsapp: validatedData.whatsapp,
        address: validatedData.address,
        // Tambahkan field lain dari validatedData jika ada
      },
    });

    return NextResponse.json(updatedPage, { status: 200 });

  } catch (error) {
    console.error(`Error updating page ${pageId}:`, error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
*/

// DELETE /api/my-pages/[id]
export async function DELETE(
  request: Request,
  { params: { id: pageId } }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Cek autentikasi
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Cari halaman berdasarkan ID
    const page = await prisma.landingPage.findUnique({
      where: { id: pageId },
      select: { userId: true }, // Hanya perlu userId untuk verifikasi
    });

    // 3. Jika halaman tidak ditemukan
    if (!page) {
      return NextResponse.json({ message: 'Halaman tidak ditemukan' }, { status: 404 });
    }

    // 4. Verifikasi kepemilikan
    if (page.userId !== userId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 }); // Pengguna bukan pemilik
    }

    // 5. Hapus halaman (TODO: Pertimbangkan hapus gambar Cloudinary juga)
    await prisma.landingPage.delete({
      where: { id: pageId },
    });

    return NextResponse.json({ message: 'Halaman berhasil dihapus' }, { status: 200 });

  } catch (error) {
    console.error(`Error deleting page ${pageId}:`, error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
} 
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      // Jika tidak ada sesi, mungkin redirect ke halaman login?
      // Atau kembalikan error, tapi karena ini callback, redirect lebih baik
      return NextResponse.redirect(
        new URL("/api/auth/signin?error=SessionRequired", request.url),
      );
    }

    const userId = session.user.id;

    // Cari landing page berdasarkan slug
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug },
    });

    if (!landingPage) {
      // Halaman tidak ditemukan, redirect ke halaman utama atau 404?
      return NextResponse.redirect(
        new URL("/?error=PageNotFound", request.url),
      );
    }

    // Cek apakah halaman sudah diklaim oleh user lain
    if (landingPage.isClaimed && landingPage.userId !== userId) {
      // Halaman sudah diklaim orang lain
      return NextResponse.redirect(
        new URL(`/p/${slug}?error=AlreadyClaimed`, request.url),
      );
    }

    // Jika belum diklaim ATAU sudah diklaim oleh user ini (tidak perlu update)
    if (!landingPage.isClaimed) {
      await prisma.landingPage.update({
        where: { slug },
        data: {
          userId: userId,
          isClaimed: true,
        },
      });
    }

    // Redirect kembali ke halaman landing page setelah klaim berhasil
    return NextResponse.redirect(
      new URL(`/p/${slug}?claimed=true`, request.url),
    );
  } catch (error) {
    console.error("Error claiming landing page:", error);
    // Redirect ke halaman error umum atau kembali ke landing page dengan error
    const { slug } = await params; // Coba dapatkan slug lagi untuk redirect
    const redirectUrl = slug
      ? `/p/${slug}?error=ClaimFailed`
      : "/?error=ClaimFailed";
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  }
}

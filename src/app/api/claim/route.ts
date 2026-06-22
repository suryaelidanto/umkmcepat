import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth"; // Import auth handler
import { prisma } from "@/lib/prisma";

const claimSchema = z.object({
  slug: z.string(),
});

export async function POST(request: Request) {
  try {
    const session = await auth(); // Get session using Auth.js

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Tidak terautentikasi" },
        { status: 401 },
      );
    }

    const userId = session.user.id;

    const body = await request.json();
    const validation = claimSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { message: "Input tidak valid" },
        { status: 400 },
      );
    }

    const { slug } = validation.data;

    // Find the landing page
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug },
      select: { id: true, isClaimed: true, userId: true }, // Select only needed fields
    });

    if (!landingPage) {
      return NextResponse.json(
        { message: "Landing page tidak ditemukan" },
        { status: 404 },
      );
    }

    if (landingPage.isClaimed) {
      // If already claimed, check if the current user is the owner
      if (landingPage.userId === userId) {
        return NextResponse.json(
          { message: "Anda sudah mengklaim halaman ini" },
          { status: 400 },
        );
      } else {
        return NextResponse.json(
          { message: "Halaman ini sudah diklaim oleh pengguna lain" },
          { status: 403 },
        ); // Forbidden
      }
    }

    // If not claimed, claim it for the current user
    await prisma.landingPage.update({
      where: { id: landingPage.id },
      data: {
        userId: userId,
        isClaimed: true,
      },
    });

    return NextResponse.json(
      { message: "Halaman berhasil diklaim!" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error claiming page:", error);
    let message = "Gagal mengklaim halaman. Terjadi kesalahan server.";
    if (error instanceof Error && error.message.includes("diklaim")) {
      message = error.message; // Use specific message if page already claimed
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

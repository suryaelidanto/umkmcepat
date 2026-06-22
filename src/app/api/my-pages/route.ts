import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userPages = await prisma.landingPage.findMany({
      where: {
        userId: userId,
      },
      select: {
        id: true,
        slug: true,
        businessName: true,
        createdAt: true,
        // Tambahkan field lain jika perlu ditampilkan di list
      },
      orderBy: {
        createdAt: "desc", // Tampilkan yang terbaru dulu
      },
    });

    return NextResponse.json(userPages, { status: 200 });
  } catch (error) {
    console.error("Error fetching user pages:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

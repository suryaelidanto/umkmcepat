import { NextResponse } from "next/server";

import { AiGeneratedContent, tweakLandingPageContent } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tweakSchema } from "@/lib/zod-schemas";

import type { Prisma } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Tidak terautentikasi" },
        { status: 401 },
      );
    }
    const userId = session.user.id;

    const body = await request.json();
    const validation = tweakSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "Input tidak valid",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { slug, instruction } = validation.data;

    // 1. Find the page and verify ownership & tweak allowance
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug },
      select: {
        id: true,
        userId: true,
        isClaimed: true,
        tweaksLeft: true,
        aiContent: true,
      },
    });

    if (!landingPage) {
      return NextResponse.json(
        { message: "Halaman tidak ditemukan" },
        { status: 404 },
      );
    }

    if (!landingPage.isClaimed || landingPage.userId !== userId) {
      return NextResponse.json(
        { message: "Anda tidak punya izin untuk mengubah halaman ini" },
        { status: 403 },
      );
    }

    if (landingPage.tweaksLeft <= 0) {
      return NextResponse.json(
        { message: "Jatah tweak AI sudah habis" },
        { status: 400 },
      );
    }

    const currentAiContent = (landingPage.aiContent ||
      {}) as unknown as AiGeneratedContent;

    // 2. Call AI tweak function
    const newAiContent = await tweakLandingPageContent(
      currentAiContent,
      instruction,
    );

    // 3. Update database
    const updatedPage = await prisma.landingPage.update({
      where: { id: landingPage.id },
      data: {
        aiContent: newAiContent as unknown as Prisma.InputJsonValue,
        tweaksLeft: {
          decrement: 1,
        },
      },
      select: { aiContent: true, tweaksLeft: true }, // Return updated content and remaining tweaks
    });

    return NextResponse.json(
      {
        message: "Konten berhasil di-tweak oleh AI!",
        updatedAiContent: updatedPage.aiContent,
        tweaksLeft: updatedPage.tweaksLeft,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error tweaking page:", error);
    let message = "Gagal melakukan tweak AI. Terjadi kesalahan server.";
    if (error instanceof Error) {
      if (error.message.includes("AI") || error.message.includes("tweak")) {
        message = error.message; // Use specific AI/tweak error message
      } else if (error.message.includes("izin")) {
        message = error.message; // Use permission error message
      }
      // Log full error server-side
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

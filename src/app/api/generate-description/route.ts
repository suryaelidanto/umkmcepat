import { NextResponse } from "next/server";
import { z } from "zod";

import { generateBusinessDescription } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit"; // Import rate limiter

const schema = z.object({
  businessName: z.string().min(3, { message: "Nama usaha diperlukan" }),
  category: z.string().min(1, { message: "Kategori diperlukan" }),
});

export async function POST(request: Request) {
  try {
    // Apply rate limiting (use 'ai' limit or a new specific one)
    const rateLimitResponse = await checkRateLimit(request, "ai");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    const validation = schema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "Input tidak valid",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { businessName, category } = validation.data;

    // Call the AI function
    const generatedDescription = await generateBusinessDescription(
      businessName,
      category,
    );

    return NextResponse.json(
      { description: generatedDescription },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error in /api/generate-description:", error);
    let message = "Gagal menghasilkan deskripsi AI.";
    if (error instanceof Error && error.message.includes("AI")) {
      message = error.message; // Use specific AI error
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

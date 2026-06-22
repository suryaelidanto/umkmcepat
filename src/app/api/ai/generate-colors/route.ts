import { NextResponse } from "next/server";
import { z } from "zod";

import { generateColorTheme } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit"; // Assuming you want rate limiting here too

// Input validation schema
const inputSchema = z.object({
  businessName: z.string().min(1, { message: "Nama usaha diperlukan" }).max(50),
  category: z.string().min(1, { message: "Kategori diperlukan" }),
});

export async function POST(request: Request) {
  try {
    // Apply rate limiting (Use 'ai' limit for now)
    const rateLimitResponse = await checkRateLimit(request, "ai");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    const validationResult = inputSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "Input tidak valid",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { businessName, category } = validationResult.data;

    const colorTheme = await generateColorTheme(businessName, category);

    return NextResponse.json(colorTheme, { status: 200 });
  } catch (error) {
    console.error("Error in generate-colors API:", error);
    let message = "Gagal menghasilkan skema warna.";
    if (error instanceof Error && error.message.includes("AI")) {
      message = error.message; // Pass specific AI error message
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

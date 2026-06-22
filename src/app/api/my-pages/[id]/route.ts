import { NextResponse } from "next/server";
import { z } from "zod"; // Import Zod

import { AiGeneratedContent, ColorThemeJson } from "@/lib/ai"; // Import types
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import type { Prisma } from "@prisma/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pageId } = await params;
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Cek autentikasi
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 2. Cari halaman berdasarkan ID
    const page = await prisma.landingPage.findUnique({
      where: { id: pageId },
      // Select all fields needed for the edit form
      select: {
        id: true,
        slug: true,
        businessName: true,
        category: true,
        whatsappNumber: true,
        aiContent: true,
        images: true,
        userId: true,
        testimonials: true,
        address: true,
        socialLinks: true,
        colorTheme: true,
      },
    });

    // 3. Jika halaman tidak ditemukan
    if (!page) {
      return NextResponse.json(
        { message: "Halaman tidak ditemukan" },
        { status: 404 },
      );
    }

    // 4. Verifikasi kepemilikan
    if (page.userId !== userId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // 5. Kembalikan data halaman (dengan type assertion via unknown)
    return NextResponse.json(
      {
        ...page,
        aiContent: page.aiContent as unknown as AiGeneratedContent, // Assert via unknown
        testimonials: page.testimonials as unknown as {
          name: string;
          comment: string;
        }[],
        socialLinks: page.socialLinks as unknown as {
          platform: string;
          url: string;
        }[],
        colorTheme: page.colorTheme as unknown as ColorThemeJson | null, // Assert via unknown
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching page:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// Helper function to update nested fields in an object
function updateNestedField(
  obj: Record<string, unknown> | AiGeneratedContent,
  path: string,
  value: unknown,
): boolean {
  if (!obj || typeof obj !== "object") {
    return false; // Cannot update non-object or null/undefined
  }
  const keys = path.split(".");
  let current = obj as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const match = key.match(/^(.+)\[(\d+)\]$/); // Check for array index like 'features[0]'

    if (match) {
      const arrayKey = match[1];
      const index = parseInt(match[2], 10);
      if (
        !current[arrayKey] ||
        !Array.isArray(current[arrayKey]) ||
        index >= current[arrayKey].length
      ) {
        console.error(
          `Invalid array path: ${path}. Key: ${arrayKey}, Index: ${index}`,
        );
        return false; // Path doesn't exist or is not an array
      }
      current = (current[arrayKey] as Record<string, unknown>[])[index];
    } else {
      // If the key doesn't exist or is not an object, create it (important for adding new fields like titles)
      if (!current[key] || typeof current[key] !== "object") {
        // console.warn(`Creating object path segment: ${key} in ${path}`); // Optional warning
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    // This check might be too strict if we are creating paths
    // if (!current || typeof current !== 'object') {
    //    console.error(`Invalid path segment encountered at ${keys.slice(0, i + 1).join('.')}`);
    //    return false; // Intermediate path is not an object
    // }
  }

  const lastKey = keys[keys.length - 1];
  const lastKeyMatch = lastKey.match(/^(.+)\[(\d+)\]$/);

  if (lastKeyMatch) {
    const arrayKey = lastKeyMatch[1];
    const index = parseInt(lastKeyMatch[2], 10);
    // Ensure the array exists and the index is valid before setting
    if (
      !current[arrayKey] ||
      !Array.isArray(current[arrayKey]) ||
      index > current[arrayKey].length
    ) {
      // Allow adding at the end
      console.error(
        `Invalid final array path: ${path}. Key: ${arrayKey}, Index: ${index}`,
      );
      // If you want to allow creating/expanding arrays, add logic here
      // For now, assume the array and index must roughly exist
      if (!current[arrayKey] || !Array.isArray(current[arrayKey])) {
        console.error(
          `Target array ${arrayKey} does not exist or is not an array.`,
        );
        return false;
      }
      if (index > current[arrayKey].length) {
        console.error(
          `Index ${index} is out of bounds for array ${arrayKey} (length ${current[arrayKey].length}).`,
        );
        return false;
      }
      // If index === current[arrayKey].length, it's like a push
      current[arrayKey][index] = value;
    } else {
      current[arrayKey][index] = value;
    }
  } else {
    // Ensure the target for the final key exists and is an object before assigning
    if (typeof current !== "object" || current === null) {
      console.error(
        `Cannot set property '${lastKey}' on non-object at path: ${path}`,
      );
      return false;
    }
    current[lastKey] = value;
  }

  return true; // Update successful
}

// Zod schema for validating the PATCH request body
const updateContentSchema = z.object({
  fieldKey: z.string().min(1, "Field key is required"),
  newValue: z.string(), // Assuming all editable fields are strings for now
});

// PATCH /api/my-pages/[id] - Update specific aiContent field
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pageId } = await params;
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Check authentication
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const validationResult = updateContentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "Invalid request body",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { fieldKey, newValue } = validationResult.data;

    // 3. Fetch the landing page and verify ownership
    const page = await prisma.landingPage.findUnique({
      where: { id: pageId },
      select: { userId: true, aiContent: true }, // Select aiContent and userId
    });

    if (!page) {
      return NextResponse.json(
        { message: "Landing page not found" },
        { status: 404 },
      );
    }

    if (page.userId !== userId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // 4. Update the specific field in aiContent JSON
    // Make sure aiContent is treated as an object, initialize if null/invalid JSON
    let currentAiContent: AiGeneratedContent;
    if (
      page.aiContent &&
      typeof page.aiContent === "object" &&
      !Array.isArray(page.aiContent)
    ) {
      // Use type assertion via unknown for safety
      currentAiContent = page.aiContent as unknown as AiGeneratedContent;
    } else {
      console.warn(
        `Invalid or missing aiContent for page ${pageId}, initializing.`,
      );
      // Assert empty object as the correct type
      currentAiContent = {} as AiGeneratedContent;
    }

    // Use the helper function to update the nested field
    const updateSuccessful = updateNestedField(
      currentAiContent,
      fieldKey,
      newValue,
    );

    if (!updateSuccessful) {
      console.error(
        `Failed to update fieldKey "${fieldKey}" for page ${pageId}. Path might be invalid or structure unexpected.`,
      );
      return NextResponse.json(
        { message: `Invalid field key or path: ${fieldKey}` },
        { status: 400 },
      );
    }

    // 5. Save the updated aiContent back to the database
    const updatedPage = await prisma.landingPage.update({
      where: { id: pageId },
      data: {
        aiContent: currentAiContent as unknown as Prisma.InputJsonValue,
      },
      select: { id: true }, // Only select necessary fields for response
    });

    return NextResponse.json(
      { message: "Content updated successfully", pageId: updatedPage.id },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error PATCH updating content for page:", error); // Added PATCH marker
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation Error", errors: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/*
// PUT /api/my-pages/[id] - Update page data
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pageId } = await params;
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
        businessName: validatedData.businessName,
        category: validatedData.category,
        whatsappNumber: validatedData.whatsappNumber,
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pageId } = await params;
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Cek autentikasi
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 2. Cari halaman berdasarkan ID
    const page = await prisma.landingPage.findUnique({
      where: { id: pageId },
      select: { userId: true }, // Hanya perlu userId untuk verifikasi
    });

    // 3. Jika halaman tidak ditemukan
    if (!page) {
      return NextResponse.json(
        { message: "Halaman tidak ditemukan" },
        { status: 404 },
      );
    }

    // 4. Verifikasi kepemilikan
    if (page.userId !== userId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 }); // Pengguna bukan pemilik
    }

    // 5. Hapus halaman (TODO: Pertimbangkan hapus file storage terkait juga)
    await prisma.landingPage.delete({
      where: { id: pageId },
    });

    return NextResponse.json(
      { message: "Halaman berhasil dihapus" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting page:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

import { auth } from "@/lib/auth";
import { getStoredObject, isObjectStorageRef } from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";
import { parseLegacyProfileImage } from "@/lib/profile";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response(null, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true },
  });
  const image = isObjectStorageRef(user?.image)
    ? await getStoredObject(user?.image || "")
    : parseLegacyProfileImage(user?.image);

  if (!image) {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(image.body), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": image.body.byteLength.toString(),
      "Content-Type": image.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

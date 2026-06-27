import { auth } from "@/lib/auth";
import { replaceStoredObject } from "@/lib/object-storage";
import { prisma } from "@/lib/prisma";
import {
  normalizeProfileImageDataUrl,
  normalizeProfileName,
  toPublicProfileImage,
} from "@/lib/profile";

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk mengubah profil." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    imageDataUrl?: unknown;
    name?: unknown;
  };
  const name = normalizeProfileName(body.name);

  if (!name) {
    return Response.json(
      { message: "Nama tidak boleh kosong." },
      { status: 400 },
    );
  }

  const data: { image?: string; name: string } = { name };
  const sessionImage = toPublicProfileImage(session.user.image);

  if (sessionImage.startsWith("https://")) {
    data.image = sessionImage;
  }

  if (body.imageDataUrl !== undefined) {
    const image = normalizeProfileImageDataUrl(body.imageDataUrl);

    if (!image.ok) {
      return Response.json({ message: image.message }, { status: 400 });
    }

    data.image = await replaceStoredObject({
      body: image.value.body,
      contentType: image.value.contentType,
      key: `profile-avatars/${session.user.id}/avatar.${image.value.ext}`,
    });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { image: true, name: true },
  });

  return Response.json({
    user: { image: toPublicProfileImage(user.image), name: user.name },
  });
}

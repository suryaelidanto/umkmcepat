import { isObjectStorageRef } from "@/lib/object-storage";

export const PROFILE_IMAGE_MAX_BYTES = 1_000_000;

const PROFILE_IMAGE_DATA_URL_PATTERN =
  /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export type ProfileImageInput = {
  body: Buffer;
  contentType: string;
  ext: "jpg" | "png" | "webp";
};

export function normalizeProfileName(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 100)
    : "";
}

export function normalizeProfileImageDataUrl(
  value: unknown,
): { ok: true; value: ProfileImageInput } | { message: string; ok: false } {
  if (typeof value !== "string") {
    return { message: "Foto profil tidak valid.", ok: false };
  }

  const compactValue = value.trim().replace(/\s/g, "");
  const match = compactValue.match(PROFILE_IMAGE_DATA_URL_PATTERN);

  if (!match) {
    return {
      message: "Foto profil harus berupa PNG, JPG, atau WebP.",
      ok: false,
    };
  }

  const [, contentType, base64] = match;
  const body = Buffer.from(base64, "base64");

  if (body.byteLength > PROFILE_IMAGE_MAX_BYTES) {
    return { message: "Ukuran foto maksimal 1 MB.", ok: false };
  }

  return {
    ok: true,
    value: {
      body,
      contentType,
      ext:
        contentType === "image/webp"
          ? "webp"
          : contentType === "image/jpeg"
            ? "jpg"
            : "png",
    },
  };
}

export function parseLegacyProfileImage(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const image = normalizeProfileImageDataUrl(value);

  return image.ok ? image.value : null;
}

export function toPublicProfileImage(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const image = value.trim();

  if (!image) {
    return "";
  }

  if (PROFILE_IMAGE_DATA_URL_PATTERN.test(image) || isObjectStorageRef(image)) {
    return "/api/profile/avatar";
  }

  if (image.startsWith("https://")) {
    return image;
  }

  if (image === "/api/profile/avatar") {
    return image;
  }

  return "";
}

export const PROJECT_REQUEST_MAX_LENGTH = 1200;
export const PROJECT_REQUEST_MIN_LENGTH = 8;

export type ProjectRequestValidation =
  { ok: true; value: string } | { ok: false; message: string };

export function validateProjectRequest(
  input: string,
): ProjectRequestValidation {
  const value = input.trim().replace(/\s+/g, " ");

  if (!value) {
    return { ok: false, message: "Tulis kebutuhan usahamu dulu." };
  }

  if (value.length < PROJECT_REQUEST_MIN_LENGTH) {
    return {
      ok: false,
      message: "Tulis kebutuhan usahamu lebih lengkap, minimal 8 karakter.",
    };
  }

  if (value.length > PROJECT_REQUEST_MAX_LENGTH) {
    return {
      ok: false,
      message: "Maksimal 1.200 karakter. Ringkas sedikit, ya.",
    };
  }

  return { ok: true, value };
}

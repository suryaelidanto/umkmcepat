export const PROJECT_REQUEST_MAX_LENGTH = 1200;

export type ProjectRequestValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function validateProjectRequest(
  input: string,
): ProjectRequestValidation {
  const value = input.trim().replace(/\s+/g, " ");

  if (!value) {
    return { ok: false, message: "Tulis kebutuhan usahamu dulu." };
  }

  if (value.length > PROJECT_REQUEST_MAX_LENGTH) {
    return {
      ok: false,
      message: "Maksimal 1.200 karakter. Ringkas sedikit, ya.",
    };
  }

  return { ok: true, value };
}

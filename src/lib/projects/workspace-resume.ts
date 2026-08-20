// Pure discuss-turn resume logic, split out of WorkspaceShell so it is

export const RESUME_POLL_INTERVAL_MS = 1_500;

export type TurnState = {
  turnId: string;
  status: "running" | "succeeded" | "failed" | "cancelled" | "expired";
  userMessageId: string;
  errorMessage?: string;
};

export type DiscussResume =
  | { kind: "idle" }
  | { kind: "reload" }
  | { kind: "poll" }
  | { kind: "retry"; errorMessage: string; retryText: string };

export function resolveDiscussResume(turn: TurnState | null): DiscussResume {
  if (!turn) {
    return { kind: "idle" };
  }
  if (turn.status === "running") {
    return { kind: "poll" };
  }
  if (turn.status === "succeeded") {
    return { kind: "reload" };
  }
  return {
    kind: "retry",
    errorMessage: toUserFacingDiscussError(turn.errorMessage),
    retryText: "Kirim ulang",
  };
}

export function toUserFacingDiscussError(
  errorMessage: string | undefined | null,
): string {
  const raw = (errorMessage ?? "").trim();
  if (!raw) {
    return "Putaran AI sebelumnya gagal. Coba kirim ulang ya.";
  }
  if (
    /[à-üÀ-Ü]|coba |belum |gagal|obrolan|sesi |proses |waktu|kirim|hentikan|gangguan|proyek/i.test(
      raw,
    )
  ) {
    return raw;
  }
  const legacy: Record<string, string> = {
    expired: "Sesi obrolan habis waktu. Coba kirim ulang pesanmu ya.",
    stream_error_no_text:
      "AI lagi ada kendala sebentar. Tunggu sebentar lalu coba lagi ya.",
    repair_failed:
      "AI lagi ada kendala sebentar. Tunggu sebentar lalu coba lagi ya.",
    "discuss turn failed":
      "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
  };
  if (legacy[raw]) {
    return legacy[raw];
  }
  if (
    /cannot find module|error:|exception|undefined|null|worker |queue |failed to|ECONN|timeout|overloaded|unavailable|rate.?limit|429|503/i.test(
      raw,
    )
  ) {
    return "AI lagi ada kendala sebentar. Tunggu sebentar lalu coba lagi ya.";
  }
  if (!/\s/.test(raw) && /^[a-z0-9_.:-]+$/i.test(raw)) {
    return "Putaran AI sebelumnya gagal. Coba kirim ulang ya.";
  }
  return raw;
}

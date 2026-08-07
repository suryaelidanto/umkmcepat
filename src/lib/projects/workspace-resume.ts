// Pure discuss-turn resume logic, split out of WorkspaceShell so it is
// unit-testable without a DOM. See the caller for the poll loop wiring.

/** Poll interval for a running discuss turn while the client waits. */
export const RESUME_POLL_INTERVAL_MS = 1_500;

/** Server-side state of one discuss turn, returned by /chat/turn. */
export type TurnState = {
  turnId: string;
  status: "running" | "succeeded" | "failed" | "cancelled" | "expired";
  userMessageId: string;
  errorMessage?: string;
};

/** What the client should do given the server-side turn state. */
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

/** Map stored turn errors to friendly Indonesian (never leak English internals). */
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
    stream_error_no_text: "AI lagi gangguan. Coba lagi sebentar.",
    repair_failed: "AI lagi gangguan. Coba lagi sebentar.",
    "discuss turn failed":
      "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
  };
  if (legacy[raw]) {
    return legacy[raw];
  }
  if (
    /cannot find module|error:|exception|undefined|null|worker |queue |failed to|ECONN|timeout/i.test(
      raw,
    )
  ) {
    return "Obrolan belum berhasil diproses. Coba kirim ulang ya.";
  }
  if (!/\s/.test(raw) && /^[a-z0-9_.:-]+$/i.test(raw)) {
    return "Putaran AI sebelumnya gagal. Coba kirim ulang ya.";
  }
  return raw;
}

export type DiscussChatErrorKind = "transient" | "terminal";

// Patterns that mean "the provider/stream hiccuped — safe to retry".
const TRANSIENT_PATTERNS = [
  /stream_error_no_text/,
  /repair_failed/,
  /ECONN|failed to fetch|network|timeout|worker |queue |exception|undefined|null/i,
  /429|408|503/i,
  /rate.?limit|overloaded|unavailable/i,
];

// Terminal Indonesian copy from the server — retrying is pointless.
const TERMINAL_PATTERNS = [
  /proses dihentikan/i,
  /belum berhasil diproses/i,
  /terlalu panjang/i,
  /ditolak|diblokir|blocked/i,
];

export function classifyDiscussChatError(input: {
  code?: string;
  message?: string;
  status?: number;
}): DiscussChatErrorKind {
  const code = input.code ?? "";
  const message = input.message ?? "";
  const status = input.status ?? 0;

  if (code === "project_request_blocked" || code === "chat_turn_too_large") {
    return "terminal";
  }
  if (TERMINAL_PATTERNS.some((re) => re.test(message))) {
    return "terminal";
  }
  if (status >= 400 && status !== 429 && status !== 408 && status !== 503) {
    return "terminal";
  }
  if (
    TRANSIENT_PATTERNS.some((re) => re.test(code) || re.test(message)) ||
    status === 429 ||
    status === 408
  ) {
    return "transient";
  }
  // Unknown / empty error — safest is to retry once before alarming the user.
  return "transient";
}

export function isTerminalChatError(input: {
  code?: string;
  message?: string;
  status?: number;
}): boolean {
  return classifyDiscussChatError(input) === "terminal";
}

export function nextRetryAttempt(current: number, cap: number): number | null {
  const safeCap = Math.max(0, Math.floor(cap));
  if (current < safeCap) {
    return current + 1;
  }
  return null;
}

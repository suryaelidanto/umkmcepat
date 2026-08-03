/** Split large text-delta for display pacing when providers dump one blob. */
export const DISCUSS_TEXT_PACE_MS = 30;
export const DISCUSS_TEXT_PACE_MIN_CHARS = 12;

export function splitTextForDisplayPacing(text: string): string[] {
  if (!text) {
    return [];
  }
  if (text.length <= DISCUSS_TEXT_PACE_MIN_CHARS) {
    return [text];
  }
  const words = text.match(/\S+\s*/g);
  if (!words || words.length <= 1) {
    const pieces: string[] = [];
    const step = Math.max(4, Math.ceil(DISCUSS_TEXT_PACE_MIN_CHARS / 2));
    for (let i = 0; i < text.length; i += step) {
      pieces.push(text.slice(i, i + step));
    }
    return pieces;
  }
  return words;
}

export async function publishPacedTextDeltas(options: {
  text: string;
  publish: (delta: string) => void;
  delayMs?: number;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const {
    text,
    publish,
    delayMs = DISCUSS_TEXT_PACE_MS,
    abortSignal,
  } = options;
  const pieces = splitTextForDisplayPacing(text);
  for (let i = 0; i < pieces.length; i += 1) {
    if (abortSignal?.aborted) {
      return;
    }
    publish(pieces[i]!);
    if (i < pieces.length - 1 && delayMs > 0) {
      await sleep(delayMs, abortSignal);
    }
  }
}

function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (abortSignal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

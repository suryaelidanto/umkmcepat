export class TextDeltaCoalescer {
  private buffer = "";
  private hasFlushedFirst = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly flushCallback: (delta: string) => void;
  private readonly intervalMs: number;
  private readonly maxBytes: number;

  constructor(
    flushCallback: (delta: string) => void,
    options?: { intervalMs?: number; maxBytes?: number },
  ) {
    this.flushCallback = flushCallback;
    this.intervalMs = options?.intervalMs ?? 24;
    this.maxBytes = options?.maxBytes ?? 256;
  }

  public push(delta: string): void {
    if (!delta) {
      return;
    }

    // Always flush first delta immediately to guarantee 0ms first-token delay.
    if (!this.hasFlushedFirst) {
      this.hasFlushedFirst = true;
      this.flushCallback(delta);
      return;
    }

    this.buffer += delta;

    if (Buffer.byteLength(this.buffer, "utf8") >= this.maxBytes) {
      this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
      }, this.intervalMs);
    }
  }

  public flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length > 0) {
      const payload = this.buffer;
      this.buffer = "";
      this.flushCallback(payload);
    }
  }
}

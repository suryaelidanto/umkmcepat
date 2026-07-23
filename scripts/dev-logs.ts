import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const LOG_FILE = path.join(process.cwd(), "dev.log");

async function main() {
  let size = 0;
  try {
    size = (await stat(LOG_FILE)).size;
  } catch {
    console.error(
      `No dev.log yet at ${LOG_FILE}. Start the server with \`bun run dev\` first.`,
    );
    process.exit(1);
  }

  // Print existing content, then tail.
  const startStream = createReadStream(LOG_FILE, { encoding: "utf8" });
  startStream.on("data", (chunk) => process.stdout.write(chunk as string));
  await new Promise<void>((resolve) => startStream.on("end", resolve));

  let pos = size;
  setInterval(async () => {
    try {
      const now = (await stat(LOG_FILE)).size;
      if (now <= pos) {
        if (now < pos) {
          // Rotation reset the file — re-stream from the start.
          pos = 0;
          const fresh = createReadStream(LOG_FILE, { encoding: "utf8" });
          for await (const chunk of fresh) {
            process.stdout.write(chunk as string);
          }
          pos = (await stat(LOG_FILE)).size;
        }
        return;
      }
      const stream = createReadStream(LOG_FILE, {
        encoding: "utf8",
        start: pos,
      });
      for await (const chunk of stream) {
        process.stdout.write(chunk as string);
      }
      pos = now;
    } catch {
      // File may have rotated mid-poll; next tick retries.
    }
  }, 500);
}

void main();

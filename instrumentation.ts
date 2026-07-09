export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  await import("./src/lib/ai-observability");
}

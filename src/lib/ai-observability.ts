import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

let spanProcessor: LangfuseSpanProcessor | null = null;
let started = false;

export function isLangfuseEnabled() {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY &&
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_BASE_URL,
  );
}

export function getLangfuseSpanProcessor() {
  return spanProcessor;
}

export async function flushLangfuseTraces() {
  await spanProcessor?.forceFlush();
}

if (!started && isLangfuseEnabled()) {
  started = true;
  spanProcessor = new LangfuseSpanProcessor();

  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });

  tracerProvider.register();
}

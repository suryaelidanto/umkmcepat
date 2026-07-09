import { LangfuseSpanProcessor } from "@langfuse/otel";
import { trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const globalForLangfuse = globalThis as typeof globalThis & {
  __umkmLangfuse?: {
    spanProcessor: LangfuseSpanProcessor | null;
    started: boolean;
    tracerProvider: NodeTracerProvider | null;
  };
};

const state = (globalForLangfuse.__umkmLangfuse ??= {
  spanProcessor: null,
  started: false,
  tracerProvider: null,
});

export function isLangfuseEnabled() {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY &&
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_BASE_URL,
  );
}

export function getLangfuseSpanProcessor() {
  return state.spanProcessor;
}

export function getAiTracer() {
  if (!isLangfuseEnabled()) {
    return undefined;
  }

  startLangfuseTracing();
  return trace.getTracer("ai");
}

export async function flushLangfuseTraces() {
  await state.spanProcessor?.forceFlush();
}

export function startLangfuseTracing() {
  if (state.started || !isLangfuseEnabled()) {
    return;
  }

  state.started = true;
  state.spanProcessor = new LangfuseSpanProcessor();
  state.tracerProvider = new NodeTracerProvider({
    spanProcessors: [state.spanProcessor],
  });

  state.tracerProvider.register();
}

startLangfuseTracing();

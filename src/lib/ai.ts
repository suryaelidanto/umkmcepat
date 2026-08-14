import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { nineRouterFetch } from "@/lib/ai-fetch";
import { getDefaultAiModel } from "@/lib/ai-models";
import { getEnv } from "@/lib/config";

export function getAiTelemetry(
  functionId: string,
  metadata: Record<string, string | number | boolean | null | undefined> = {},
) {
  // Telemetry inert. Re-add a tracer here if observability is reintroduced.
  return {
    functionId,
    isEnabled: false,
    recordInputs: false,
    recordOutputs: false,
    metadata: {
      aiGateway: "9router",
      ...metadata,
    },
  };
}

export function getAiModel(model = getDefaultAiModel()) {
  const baseURL = getEnv("NINE_ROUTER_BASE_URL");
  const apiKey = getEnv("NINE_ROUTER_API_KEY");

  if (!baseURL) {
    throw new Error("NINE_ROUTER_BASE_URL is required for AI requests.");
  }

  if (!apiKey) {
    throw new Error("NINE_ROUTER_API_KEY is required for AI requests.");
  }

  return createOpenAICompatible({
    name: "9router",
    baseURL,
    apiKey,
    includeUsage: true,
    supportsStructuredOutputs: false,
    fetch: nineRouterFetch,
  })(model);
}

/**
 * Best-effort: AI SDK portable flag to disable hidden reasoning.
 * Effective only if 9Router + child model honor it.
 *
 * NOTE: flipping this off (e.g. to reasoning: "auto") changes the discuss UX
 * contract — WorkspaceShell's AI-thinking strip reacts to streamed reasoning
 * parts (tier "reasoning"), and reasoning tokens would be billed. Persisted
 * messages strip reasoning parts via chat-memory.ts. Keep in sync with the
 * composer's thinking-tier handling.
 */
export function getNoReasoningCallOptions() {
  return {
    reasoning: "none" as const,
    providerOptions: {
      "9router": { reasoningEffort: "none" },
    },
  };
}

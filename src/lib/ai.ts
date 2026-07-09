import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { getDefaultAiModel } from "@/lib/ai-models";
import { getEnv } from "@/lib/config";

export function getAiTelemetry(
  functionId: string,
  metadata: Record<string, string | number | boolean | null | undefined> = {},
) {
  return {
    functionId,
    isEnabled: Boolean(
      process.env.LANGFUSE_PUBLIC_KEY &&
      process.env.LANGFUSE_SECRET_KEY &&
      process.env.LANGFUSE_BASE_URL,
    ),
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
    supportsStructuredOutputs: true,
  })(model);
}

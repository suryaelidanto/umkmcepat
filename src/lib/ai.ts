import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { getDefaultAiModel } from "@/lib/ai-models";
import { getEnv } from "@/lib/config";

export function getAiModel() {
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
  })(getDefaultAiModel());
}

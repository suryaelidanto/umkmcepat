import { Buffer } from "node:buffer";

type LangfuseModel = {
  id: string;
  modelName: string;
  matchPattern: string;
};

type PaginatedResponse = {
  body: {
    data: LangfuseModel[];
    meta: {
      page: number;
      totalPages: number;
    };
  };
};

type NewModelPayload = {
  modelName: string;
  matchPattern: string;
  unit: "TOKENS";
  inputPrice?: number;
  outputPrice?: number;
  totalPrice?: number;
};

const MODEL_PRICING = {
  "cmc/deepseek/deepseek-v4-pro": {
    inputUsdPerMillion: 0.435,
    outputUsdPerMillion: 0.87,
  },
  "cmc/deepseek/deepseek-v4-flash": {
    inputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
  },
} as const;

function getLangfuseServer() {
  const baseUrl = (
    process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST
  )?.trim();

  if (!baseUrl) {
    throw new Error(
      "Missing LANGFUSE_BASE_URL (or LANGFUSE_HOST) for Langfuse model seeding.",
    );
  }

  return baseUrl.replace(/\/$/, "");
}

function getLangfuseAuthHeader() {
  const key = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secret = process.env.LANGFUSE_SECRET_KEY?.trim();

  if (!key || !secret) {
    throw new Error(
      "Missing LANGFUSE_PUBLIC_KEY and/or LANGFUSE_SECRET_KEY for model seeding.",
    );
  }

  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

function getPricedModelNames() {
  const aiModels = (process.env.AI_MODELS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const pricedModels = Object.keys(MODEL_PRICING);
  const configured = aiModels.filter((value) => pricedModels.includes(value));

  return configured.length ? configured : pricedModels;
}

function exactMatchPattern(modelName: string) {
  return `(?i)^${modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}

async function fetchExistingModels(server: string, auth: string) {
  const models: LangfuseModel[] = [];
  let page = 1;

  for (;;) {
    const response = await fetch(
      `${server}/api/public/models?page=${page}&limit=100`,
      {
        headers: { authorization: auth },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Langfuse models: ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as PaginatedResponse;
    const body = "body" in payload ? payload.body : payload;
    models.push(...body.data);

    if (page >= (body.meta?.totalPages ?? 1)) {
      break;
    }

    page += 1;
  }

  return models;
}

async function createModel(server: string, auth: string, modelName: string) {
  const pricing = MODEL_PRICING[modelName as keyof typeof MODEL_PRICING];
  const payload: NewModelPayload = {
    modelName,
    matchPattern: exactMatchPattern(modelName),
    unit: "TOKENS",
    inputPrice: pricing?.inputUsdPerMillion
      ? pricing.inputUsdPerMillion / 1_000_000
      : undefined,
    outputPrice: pricing?.outputUsdPerMillion
      ? pricing.outputUsdPerMillion / 1_000_000
      : undefined,
  };

  const response = await fetch(`${server}/api/public/models`, {
    method: "POST",
    headers: {
      authorization: auth,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create model ${modelName}: ${response.status} ${text}`,
    );
  }

  console.warn(`Created Langfuse model: ${modelName}`);
}

async function main() {
  const server = getLangfuseServer();
  const auth = getLangfuseAuthHeader();
  const targetModelNames = getPricedModelNames();

  if (!targetModelNames.length) {
    console.warn("No configured paid model mappings to seed.");
    return;
  }

  const existing = await fetchExistingModels(server, auth);
  const existingByName = new Set(existing.map((model) => model.modelName));

  const missing = targetModelNames.filter(
    (modelName) => !existingByName.has(modelName),
  );

  if (!missing.length) {
    console.warn("Langfuse model catalog already includes required model IDs.");
    return;
  }

  for (const modelName of missing) {
    console.warn(`Seeding Langfuse model: ${modelName}`);
    await createModel(server, auth, modelName);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

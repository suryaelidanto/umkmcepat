import { getEnv } from "@/lib/config";

export type GeneratedResourceKind = "dist" | "source";
export type GeneratedResourceFile = { content: string; path: string };

const RESOURCE_BUDGETS = {
  source: {
    maxFileBytes: {
      defaultValue: 256 * 1024,
      env: "PROJECT_SOURCE_MAX_FILE_BYTES",
      maximum: 1024 * 1024,
      minimum: 16 * 1024,
    },
    maxFiles: {
      defaultValue: 100,
      env: "PROJECT_SOURCE_MAX_FILES",
      maximum: 500,
      minimum: 10,
    },
    maxTotalBytes: {
      defaultValue: 5 * 1024 * 1024,
      env: "PROJECT_SOURCE_MAX_TOTAL_BYTES",
      maximum: 20 * 1024 * 1024,
      minimum: 256 * 1024,
    },
  },
  dist: {
    maxFileBytes: {
      defaultValue: 10 * 1024 * 1024,
      env: "PROJECT_DIST_MAX_FILE_BYTES",
      maximum: 25 * 1024 * 1024,
      minimum: 64 * 1024,
    },
    maxFiles: {
      defaultValue: 500,
      env: "PROJECT_DIST_MAX_FILES",
      maximum: 2_000,
      minimum: 10,
    },
    maxTotalBytes: {
      defaultValue: 50 * 1024 * 1024,
      env: "PROJECT_DIST_MAX_TOTAL_BYTES",
      maximum: 200 * 1024 * 1024,
      minimum: 1024 * 1024,
    },
  },
} as const;

export function getGeneratedResourceUsage(files: GeneratedResourceFile[]) {
  let largestFileBytes = 0;
  let totalBytes = 0;

  for (const file of files) {
    const bytes = Buffer.byteLength(file.content, "utf8");
    largestFileBytes = Math.max(largestFileBytes, bytes);
    totalBytes += bytes;
  }

  return { fileCount: files.length, largestFileBytes, totalBytes };
}

export function getGeneratedResourceBudget(kind: GeneratedResourceKind) {
  const budget = RESOURCE_BUDGETS[kind];

  return {
    maxFileBytes: resolveBudgetValue(budget.maxFileBytes),
    maxFiles: resolveBudgetValue(budget.maxFiles),
    maxTotalBytes: resolveBudgetValue(budget.maxTotalBytes),
  };
}

export function assertGeneratedResourceBudget(
  files: GeneratedResourceFile[],
  kind: GeneratedResourceKind,
) {
  const { maxFileBytes, maxFiles, maxTotalBytes } =
    getGeneratedResourceBudget(kind);

  if (files.length > maxFiles) {
    throw new Error(`Generated ${kind} exceeds ${maxFiles} files.`);
  }

  let totalBytes = 0;

  for (const file of files) {
    const fileBytes = Buffer.byteLength(file.content, "utf8");

    if (fileBytes > maxFileBytes) {
      throw new Error(
        `Generated ${kind} file exceeds ${maxFileBytes} bytes: ${file.path}`,
      );
    }

    totalBytes += fileBytes;

    if (totalBytes > maxTotalBytes) {
      throw new Error(
        `Generated ${kind} exceeds ${maxTotalBytes} aggregate bytes.`,
      );
    }
  }
}

function resolveBudgetValue(config: {
  defaultValue: number;
  env: string;
  maximum: number;
  minimum: number;
}) {
  const parsed = Number(getEnv(config.env));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return config.defaultValue;
  }

  return Math.min(config.maximum, Math.max(config.minimum, Math.round(parsed)));
}

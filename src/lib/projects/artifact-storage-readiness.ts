import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/lib/config";

export async function assertProjectArtifactStorageReady() {
  const provider = getEnv(
    "PROJECT_ARTIFACT_STORAGE_PROVIDER",
    "local",
  ).toLowerCase();

  if (provider === "r2") {
    assertRequiredR2Config();
    return;
  }

  if (provider !== "local") {
    throw new Error(
      `Invalid PROJECT_ARTIFACT_STORAGE_PROVIDER '${provider}'. Supported values: local, r2.`,
    );
  }

  const configuredRoot = getEnv("PROJECT_ARTIFACT_DIR").trim();

  if (
    process.env.NODE_ENV === "production" &&
    (!configuredRoot || !path.isAbsolute(configuredRoot))
  ) {
    throw new Error(
      "PROJECT_ARTIFACT_DIR must be an explicit absolute path in production.",
    );
  }

  const root = path.resolve(configuredRoot || ".data/project-artifacts");
  const probePath = path.join(root, `.readiness-${randomUUID()}`);
  const probeContent = randomUUID();

  try {
    await mkdir(root, { recursive: true });
    await writeFile(probePath, probeContent, {
      encoding: "utf8",
      flag: "wx",
    });
    const readBack = await readFile(probePath, "utf8");

    if (readBack !== probeContent) {
      throw new Error("Artifact readiness probe content did not match.");
    }
  } catch (error) {
    throw new Error(
      `Project artifact storage is not writable at '${root}': ${
        error instanceof Error ? error.message : "readiness probe failed"
      }`,
    );
  } finally {
    await rm(probePath, { force: true }).catch(() => undefined);
  }
}

function assertRequiredR2Config() {
  for (const name of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ]) {
    if (!getEnv(name)) {
      throw new Error(`${name} is required for R2 project artifact storage.`);
    }
  }
}

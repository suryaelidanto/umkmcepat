import { createHmac, createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/lib/config";
import { assertGeneratedResourceBudget } from "@/lib/projects/generated-resource-budget";
import { assertSafeProjectFilePath } from "@/lib/projects/generated-source";
import {
  type GeneratedDistFile,
  type GeneratedProjectFile,
} from "@/lib/projects/generated-types";

const PROJECT_ARTIFACT_REF_PREFIX = "project-artifact:";
const LOCAL_PROJECT_ARTIFACT_REF_PREFIX = `${PROJECT_ARTIFACT_REF_PREFIX}local:`;
const R2_PROJECT_ARTIFACT_REF_PREFIX = `${PROJECT_ARTIFACT_REF_PREFIX}r2:`;

export type ProjectArtifactKind = "dist" | "source";
type ProjectArtifactProvider = "local" | "r2";

type ProjectArtifactManifest = {
  files: Array<{
    contentType?: string;
    path: string;
  }>;
  kind: ProjectArtifactKind;
  schemaVersion: 1;
};

type ArtifactRootOptions = {
  rootDir?: string;
};

type WriteArtifactInput<
  TFile extends GeneratedDistFile | GeneratedProjectFile,
> = ArtifactRootOptions & {
  artifactId: string;
  files: TFile[];
  kind: ProjectArtifactKind;
};

type ParsedProjectArtifactRef = {
  artifactId: string;
  kind: ProjectArtifactKind;
  provider: ProjectArtifactProvider;
};

type R2Config = {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  prefix: string;
  secretAccessKey: string;
};

export function createProjectArtifactRef(
  kind: ProjectArtifactKind,
  artifactId: string,
  provider = getProjectArtifactProvider(),
) {
  assertSafeArtifactId(artifactId);
  return `${PROJECT_ARTIFACT_REF_PREFIX}${provider}:${kind}:${artifactId}`;
}

export function parseProjectArtifactRef(
  ref: string,
): ParsedProjectArtifactRef | null {
  const provider = ref.startsWith(LOCAL_PROJECT_ARTIFACT_REF_PREFIX)
    ? "local"
    : ref.startsWith(R2_PROJECT_ARTIFACT_REF_PREFIX)
      ? "r2"
      : null;

  if (!provider) {
    return null;
  }

  const prefix =
    provider === "local"
      ? LOCAL_PROJECT_ARTIFACT_REF_PREFIX
      : R2_PROJECT_ARTIFACT_REF_PREFIX;
  const [rawKind, artifactId] = ref.slice(prefix.length).split(":");

  if ((rawKind !== "dist" && rawKind !== "source") || !artifactId) {
    return null;
  }

  assertSafeArtifactId(artifactId);
  return { artifactId, kind: rawKind, provider };
}

export async function writeProjectSourceArtifact(
  input: Omit<WriteArtifactInput<GeneratedProjectFile>, "kind">,
) {
  return writeProjectArtifactFiles({ ...input, kind: "source" });
}

export async function writeProjectDistArtifact(
  input: Omit<WriteArtifactInput<GeneratedDistFile>, "kind">,
) {
  return writeProjectArtifactFiles({ ...input, kind: "dist" });
}

export async function readProjectSourceArtifact(
  ref: string,
  options: ArtifactRootOptions = {},
): Promise<GeneratedProjectFile[]> {
  const artifact = await readProjectArtifactFiles(ref, options);

  if (artifact.kind !== "source") {
    return [];
  }

  return artifact.files.map((file) => ({
    content: file.content,
    path: file.path,
  }));
}

export async function readProjectDistArtifact(
  ref: string,
  options: ArtifactRootOptions = {},
): Promise<GeneratedDistFile[]> {
  const artifact = await readProjectArtifactFiles(ref, options);

  if (artifact.kind !== "dist") {
    return [];
  }

  return artifact.files.map((file) => ({
    content: file.content,
    contentType: file.contentType || "text/plain; charset=utf-8",
    path: file.path,
  }));
}

export async function materializeProjectDistArtifact(
  ref: string,
  targetRoot: string,
  options: ArtifactRootOptions = {},
) {
  const files = await readProjectDistArtifact(ref, options);

  await rm(targetRoot, { force: true, recursive: true });
  await mkdir(targetRoot, { recursive: true });

  for (const file of files) {
    const target = resolveSafeChildPath(targetRoot, file.path);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }

  return files;
}

export async function deleteProjectArtifact(
  ref: string,
  options: ArtifactRootOptions = {},
) {
  const parsed = parseProjectArtifactRef(ref);

  if (!parsed) {
    return;
  }

  if (parsed.provider === "r2") {
    await deleteR2ProjectArtifact(parsed);
    return;
  }

  await rm(
    resolveProjectArtifactDir(parsed.kind, parsed.artifactId, options.rootDir),
    { force: true, recursive: true },
  );
}

async function writeProjectArtifactFiles<
  TFile extends GeneratedDistFile | GeneratedProjectFile,
>(input: WriteArtifactInput<TFile>) {
  validateArtifactFiles(input.files);
  assertGeneratedResourceBudget(input.files, input.kind);

  const provider = getProjectArtifactProvider();
  const artifactRef = createProjectArtifactRef(
    input.kind,
    input.artifactId,
    provider,
  );
  const manifest: ProjectArtifactManifest = {
    files: input.files.map((file) => ({
      contentType: "contentType" in file ? file.contentType : undefined,
      path: file.path,
    })),
    kind: input.kind,
    schemaVersion: 1,
  };

  if (provider === "r2") {
    await writeR2ProjectArtifact(input, manifest);
    return artifactRef;
  }

  await writeLocalProjectArtifact(input, manifest);
  return artifactRef;
}

async function writeLocalProjectArtifact<
  TFile extends GeneratedDistFile | GeneratedProjectFile,
>(input: WriteArtifactInput<TFile>, manifest: ProjectArtifactManifest) {
  const artifactDir = resolveProjectArtifactDir(
    input.kind,
    input.artifactId,
    input.rootDir,
  );
  const tempDir = `${artifactDir}.tmp-${crypto.randomUUID()}`;
  const tempFilesDir = path.join(tempDir, "files");

  await rm(tempDir, { force: true, recursive: true });
  await mkdir(tempFilesDir, { recursive: true });

  try {
    for (const file of input.files) {
      const target = resolveSafeChildPath(tempFilesDir, file.path);

      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }

    await writeFile(
      path.join(tempDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    await rm(artifactDir, { force: true, recursive: true });
    await rename(tempDir, artifactDir);
  } catch (error) {
    await rm(tempDir, { force: true, recursive: true }).catch(() => undefined);
    throw error;
  }
}

async function writeR2ProjectArtifact<
  TFile extends GeneratedDistFile | GeneratedProjectFile,
>(input: WriteArtifactInput<TFile>, manifest: ProjectArtifactManifest) {
  const config = getR2Config();

  for (const file of input.files) {
    await putR2Object(
      config,
      getR2ArtifactKey(input.kind, input.artifactId, `files/${file.path}`),
      file.content,
      "contentType" in file ? file.contentType : "text/plain; charset=utf-8",
    );
  }

  await putR2Object(
    config,
    getR2ArtifactKey(input.kind, input.artifactId, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "application/json; charset=utf-8",
  );
}

async function readProjectArtifactFiles(
  ref: string,
  options: ArtifactRootOptions,
): Promise<{
  files: Array<GeneratedProjectFile & { contentType?: string }>;
  kind: ProjectArtifactKind;
}> {
  const parsed = parseProjectArtifactRef(ref);

  if (!parsed) {
    return { files: [], kind: "source" };
  }

  if (parsed.provider === "r2") {
    return readR2ProjectArtifact(parsed);
  }

  return readLocalProjectArtifact(parsed, options);
}

async function readLocalProjectArtifact(
  parsed: ParsedProjectArtifactRef,
  options: ArtifactRootOptions,
) {
  const artifactDir = resolveProjectArtifactDir(
    parsed.kind,
    parsed.artifactId,
    options.rootDir,
  );
  const manifest = parseManifest(
    await readFile(path.join(artifactDir, "manifest.json"), "utf8").catch(
      () => "",
    ),
    parsed.kind,
  );
  const filesDir = path.join(artifactDir, "files");
  const files = await Promise.all(
    manifest.files.map(async (file) => {
      const source = resolveSafeChildPath(filesDir, file.path);

      return {
        content: await readFile(source, "utf8"),
        contentType: file.contentType,
        path: file.path,
      };
    }),
  );

  return { files, kind: manifest.kind };
}

async function readR2ProjectArtifact(parsed: ParsedProjectArtifactRef) {
  const config = getR2Config();
  const manifest = parseManifest(
    await getR2Object(
      config,
      getR2ArtifactKey(parsed.kind, parsed.artifactId, "manifest.json"),
    ),
    parsed.kind,
  );
  const files = await Promise.all(
    manifest.files.map(async (file) => ({
      content: await getR2Object(
        config,
        getR2ArtifactKey(parsed.kind, parsed.artifactId, `files/${file.path}`),
      ),
      contentType: file.contentType,
      path: file.path,
    })),
  );

  return { files, kind: manifest.kind };
}

async function deleteR2ProjectArtifact(parsed: ParsedProjectArtifactRef) {
  const config = getR2Config();
  const manifestKey = getR2ArtifactKey(
    parsed.kind,
    parsed.artifactId,
    "manifest.json",
  );

  // Enumerate files from the manifest when available; best-effort so a
  // missing/unreadable manifest does not block deleting the manifest key.
  let filePaths: string[] = [];
  try {
    const manifest = JSON.parse(await getR2Object(config, manifestKey)) as {
      files?: Array<{ path?: unknown }>;
    };
    filePaths = (manifest.files ?? [])
      .map((file) => (typeof file?.path === "string" ? file.path : null))
      .filter((filePath): filePath is string => filePath !== null);
  } catch {
    // Manifest missing or unreadable; nothing more to enumerate.
  }

  await Promise.all([
    ...filePaths.map((filePath) =>
      deleteR2Object(
        config,
        getR2ArtifactKey(parsed.kind, parsed.artifactId, `files/${filePath}`),
      ),
    ),
    deleteR2Object(config, manifestKey),
  ]);
}

function parseManifest(
  value: string,
  expectedKind: ProjectArtifactKind,
): ProjectArtifactManifest {
  const parsed = JSON.parse(value) as Partial<ProjectArtifactManifest>;

  if (
    parsed.schemaVersion !== 1 ||
    parsed.kind !== expectedKind ||
    !Array.isArray(parsed.files)
  ) {
    throw new Error("Project artifact manifest is invalid.");
  }

  return {
    files: parsed.files.map((file) => {
      if (!file || typeof file.path !== "string") {
        throw new Error("Project artifact manifest is invalid.");
      }

      assertSafeProjectFilePath(file.path);
      return {
        contentType:
          typeof file.contentType === "string" ? file.contentType : undefined,
        path: file.path,
      };
    }),
    kind: parsed.kind,
    schemaVersion: 1,
  };
}

function validateArtifactFiles(
  files: Array<GeneratedDistFile | GeneratedProjectFile>,
) {
  for (const file of files) {
    assertSafeProjectFilePath(file.path);
  }
}

function getProjectArtifactProvider(): ProjectArtifactProvider {
  const provider = getEnv(
    "PROJECT_ARTIFACT_STORAGE_PROVIDER",
    "local",
  ).toLowerCase();

  if (provider === "local" || provider === "r2") {
    return provider;
  }

  throw new Error(
    `Invalid PROJECT_ARTIFACT_STORAGE_PROVIDER '${provider}'. Supported values: local, r2.`,
  );
}

function resolveProjectArtifactDir(
  kind: ProjectArtifactKind,
  artifactId: string,
  rootDir?: string,
) {
  assertSafeArtifactId(artifactId);
  return path.join(getProjectArtifactRoot(rootDir), kind, artifactId);
}

function getProjectArtifactRoot(rootDir?: string) {
  return path.resolve(
    rootDir || getEnv("PROJECT_ARTIFACT_DIR", ".data/project-artifacts"),
  );
}

function resolveSafeChildPath(root: string, filePath: string) {
  assertSafeProjectFilePath(filePath);

  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, filePath);

  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Project artifact path escapes root: ${filePath}`);
  }

  return target;
}

function assertSafeArtifactId(artifactId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(artifactId)) {
    throw new Error("Project artifact id is invalid.");
  }
}

function getR2Config(): R2Config {
  return {
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    accountId: requiredEnv("R2_ACCOUNT_ID"),
    bucket: requiredEnv("R2_BUCKET"),
    prefix: normalizeR2Prefix(
      getEnv("PROJECT_ARTIFACT_R2_PREFIX", "project-artifacts"),
    ),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  };
}

function requiredEnv(name: string) {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`${name} is required for R2 project artifact storage.`);
  }

  return value;
}

function normalizeR2Prefix(value: string) {
  return value.replace(/^\/+|\/+$/g, "") || "project-artifacts";
}

function getR2ArtifactKey(
  kind: ProjectArtifactKind,
  artifactId: string,
  suffix: string,
) {
  assertSafeArtifactId(artifactId);
  return `${getR2Config().prefix}/${kind}/${artifactId}/${suffix}`;
}

async function putR2Object(
  config: R2Config,
  key: string,
  body: string,
  contentType: string,
) {
  const response = await signedR2Fetch(config, key, {
    body,
    contentType,
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error(`R2 project artifact write failed: ${response.status}`);
  }
}

async function getR2Object(config: R2Config, key: string) {
  const response = await signedR2Fetch(config, key, { method: "GET" });

  if (!response.ok) {
    throw new Error(`R2 project artifact read failed: ${response.status}`);
  }

  return response.text();
}

async function deleteR2Object(config: R2Config, key: string) {
  const response = await signedR2Fetch(config, key, { method: "DELETE" });

  // 204 success; 404 means the object is already gone — treat as success.
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 project artifact delete failed: ${response.status}`);
  }
}

async function signedR2Fetch(
  config: R2Config,
  key: string,
  input: {
    body?: string;
    contentType?: string;
    method: "GET" | "PUT" | "DELETE";
  },
) {
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${encodedKey}`;
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body ?? "");
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (input.contentType) {
    headers["content-type"] = input.contentType;
  }

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = [
    input.method,
    `/${config.bucket}/${encodedKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(
    getSignatureKey(config.secretAccessKey, dateStamp),
    stringToSign,
  );

  return fetch(url, {
    body: input.body,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    method: input.method,
  });
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(secret: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const dateRegionKey = hmac(dateKey, "auto");
  const dateRegionServiceKey = hmac(dateRegionKey, "s3");
  return hmac(dateRegionServiceKey, "aws4_request");
}

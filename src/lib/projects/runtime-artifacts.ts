import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertGeneratedResourceBudget } from "@/lib/projects/generated-resource-budget";
import { assertSafeProjectFilePath } from "@/lib/projects/generated-source";
import {
  type GeneratedDistFile,
  type GeneratedProjectFile,
} from "@/lib/projects/generated-types";
import {
  deleteS3Object,
  getS3Object,
  putS3Object,
  S3_PREFIXES,
} from "@/lib/s3-client";

const S3_PROJECT_ARTIFACT_REF_PREFIX = "project-artifact:s3:";

export type ProjectArtifactKind = "dist" | "source";

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
};

export function createProjectArtifactRef(
  kind: ProjectArtifactKind,
  artifactId: string,
) {
  assertSafeArtifactId(artifactId);
  return `${S3_PROJECT_ARTIFACT_REF_PREFIX}${kind}:${artifactId}`;
}

export function parseProjectArtifactRef(
  ref: string,
): ParsedProjectArtifactRef | null {
  if (!ref.startsWith(S3_PROJECT_ARTIFACT_REF_PREFIX)) {
    return null;
  }

  const [rawKind, artifactId] = ref
    .slice(S3_PROJECT_ARTIFACT_REF_PREFIX.length)
    .split(":");

  if ((rawKind !== "dist" && rawKind !== "source") || !artifactId) {
    return null;
  }

  assertSafeArtifactId(artifactId);
  return { artifactId, kind: rawKind };
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
  _options: ArtifactRootOptions = {},
): Promise<GeneratedProjectFile[]> {
  const artifact = await readProjectArtifactFiles(ref);

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
  _options: ArtifactRootOptions = {},
): Promise<GeneratedDistFile[]> {
  const artifact = await readProjectArtifactFiles(ref);

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
  _options: ArtifactRootOptions = {},
) {
  const files = await readProjectDistArtifact(ref);

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
  _options: ArtifactRootOptions = {},
) {
  const parsed = parseProjectArtifactRef(ref);

  if (!parsed) {
    return;
  }

  const manifestKey = getArtifactKey(
    parsed.kind,
    parsed.artifactId,
    "manifest.json",
  );

  // Enumerate files from the manifest when available; best-effort so a
  // missing/unreadable manifest does not block deleting the manifest key.
  let filePaths: string[] = [];
  try {
    const manifest = JSON.parse(
      (await getS3Object("public", manifestKey)).toString("utf8"),
    ) as { files?: Array<{ path?: unknown }> };
    filePaths = (manifest.files ?? [])
      .map((file) => (typeof file?.path === "string" ? file.path : null))
      .filter((filePath): filePath is string => filePath !== null);
  } catch {
    // Manifest missing or unreadable; nothing more to enumerate.
  }

  await Promise.all([
    ...filePaths.map((filePath) =>
      deleteS3Object(
        "public",
        getArtifactKey(parsed.kind, parsed.artifactId, `files/${filePath}`),
      ),
    ),
    deleteS3Object("public", manifestKey),
  ]);
}

// ponytail: S3 artifacts have no on-disk files dir. Returns null for any ref
// so the post-generation prettier sweep (edit.ts/generate.ts) no-ops for S3-
// stored source. Upgrade path: make this async + materialize to a temp dir
// via readProjectSourceArtifact; requires touching the two route callers
// (await + tempdir lifecycle). Out of scope for the s3-client rewiring —
// the sweep is fire-and-forget Promise.allSettled polish, not load-bearing.
export function resolveArtifactFilesDir(_ref: string): string | null {
  return null;
}

async function writeProjectArtifactFiles<
  TFile extends GeneratedDistFile | GeneratedProjectFile,
>(input: WriteArtifactInput<TFile>) {
  validateArtifactFiles(input.files);
  assertGeneratedResourceBudget(input.files, input.kind);

  const artifactRef = createProjectArtifactRef(input.kind, input.artifactId);
  const manifest: ProjectArtifactManifest = {
    files: input.files.map((file) => ({
      contentType: "contentType" in file ? file.contentType : undefined,
      path: file.path,
    })),
    kind: input.kind,
    schemaVersion: 1,
  };

  for (const file of input.files) {
    await putS3Object(
      "public",
      getArtifactKey(input.kind, input.artifactId, `files/${file.path}`),
      Buffer.from(file.content, "utf8"),
      "contentType" in file ? file.contentType : "text/plain; charset=utf-8",
    );
  }

  await putS3Object(
    "public",
    getArtifactKey(input.kind, input.artifactId, "manifest.json"),
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    "application/json; charset=utf-8",
  );

  return artifactRef;
}

async function readProjectArtifactFiles(ref: string): Promise<{
  files: Array<GeneratedProjectFile & { contentType?: string }>;
  kind: ProjectArtifactKind;
}> {
  const parsed = parseProjectArtifactRef(ref);

  if (!parsed) {
    return { files: [], kind: "source" };
  }

  const manifest = parseManifest(
    (
      await getS3Object(
        "public",
        getArtifactKey(parsed.kind, parsed.artifactId, "manifest.json"),
      )
    ).toString("utf8"),
    parsed.kind,
  );

  const files = await Promise.all(
    manifest.files.map(async (file) => ({
      content: (
        await getS3Object(
          "public",
          getArtifactKey(parsed.kind, parsed.artifactId, `files/${file.path}`),
        )
      ).toString("utf8"),
      contentType: file.contentType,
      path: file.path,
    })),
  );

  return { files, kind: manifest.kind };
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

function getArtifactKey(
  kind: ProjectArtifactKind,
  artifactId: string,
  suffix: string,
) {
  assertSafeArtifactId(artifactId);
  return `${S3_PREFIXES.artifact}/${kind}/${artifactId}/${suffix}`;
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

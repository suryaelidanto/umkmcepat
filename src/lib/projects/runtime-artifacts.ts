import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/lib/config";
import {
  assertSafeProjectFilePath,
  type GeneratedDistFile,
  type GeneratedProjectFile,
} from "@/lib/projects/generated-source";

export const PROJECT_ARTIFACT_REF_PREFIX = "project-artifact:local:";

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

export function createProjectArtifactRef(
  kind: ProjectArtifactKind,
  artifactId: string,
) {
  assertSafeArtifactId(artifactId);
  return `${PROJECT_ARTIFACT_REF_PREFIX}${kind}:${artifactId}`;
}

export function parseProjectArtifactRef(ref: string) {
  if (!ref.startsWith(PROJECT_ARTIFACT_REF_PREFIX)) {
    return null;
  }

  const [rawKind, artifactId] = ref
    .slice(PROJECT_ARTIFACT_REF_PREFIX.length)
    .split(":");

  if ((rawKind !== "dist" && rawKind !== "source") || !artifactId) {
    return null;
  }

  assertSafeArtifactId(artifactId);
  const kind: ProjectArtifactKind = rawKind;

  return { artifactId, kind };
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

async function writeProjectArtifactFiles<
  TFile extends GeneratedDistFile | GeneratedProjectFile,
>(input: WriteArtifactInput<TFile>) {
  const artifactRef = createProjectArtifactRef(input.kind, input.artifactId);
  const artifactDir = resolveProjectArtifactDir(
    input.kind,
    input.artifactId,
    input.rootDir,
  );
  const filesDir = path.join(artifactDir, "files");
  const manifest: ProjectArtifactManifest = {
    files: input.files.map((file) => ({
      contentType: "contentType" in file ? file.contentType : undefined,
      path: file.path,
    })),
    kind: input.kind,
    schemaVersion: 1,
  };

  await rm(artifactDir, { force: true, recursive: true });
  await mkdir(filesDir, { recursive: true });

  for (const file of input.files) {
    const target = resolveSafeChildPath(filesDir, file.path);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }

  await writeFile(
    path.join(artifactDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  return artifactRef;
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

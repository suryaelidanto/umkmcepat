// src/lib/projects/gate-evidence.ts
import { getS3Object, putS3Object, S3_PREFIXES } from "@/lib/storage/s3-client";

export const GATE_EVIDENCE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const GATE_EVIDENCE_PREFIX = "gate-evidence";

export type GateEvidenceKind = "screenshot" | "dom" | "report";

export type GateEvidenceMeta = {
  projectId: string;
  candidateId: string;
  kind: GateEvidenceKind;
  route: string;
  viewport: "mobile" | "desktop";
  createdAt: string;
};

export function evidenceRefForCandidate(input: {
  projectId: string;
  candidateId: string;
  kind: GateEvidenceKind;
  route: string;
  viewport: "mobile" | "desktop";
}): string {
  const routeKey = input.route.replace(/[/?&#]/g, "_") || "root";
  const extension = input.kind === "screenshot" ? "jpg" : "json";
  const key = `${GATE_EVIDENCE_PREFIX}/${input.projectId}/${input.candidateId}/${input.kind}/${routeKey}-${input.viewport}.${extension}`;
  return `object:s3:objects/${key}`;
}

function s3KeyFromRef(ref: string): string {
  if (!ref.startsWith("object:s3:objects/")) {
    throw new Error("invalid gate-evidence ref");
  }
  return `${S3_PREFIXES.object}/${ref.slice("object:s3:objects/".length)}`;
}

export function isExpiredGateEvidence(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > GATE_EVIDENCE_TTL_MS;
}

export async function storeGateEvidence(input: {
  projectId: string;
  candidateId: string;
  kind: GateEvidenceKind;
  route: string;
  viewport: "mobile" | "desktop";
  value: unknown;
}): Promise<string> {
  const ref = evidenceRefForCandidate(input);
  const payload = {
    ...(input.value as object),
    meta: {
      projectId: input.projectId,
      candidateId: input.candidateId,
      kind: input.kind,
      route: input.route,
      viewport: input.viewport,
      createdAt: new Date().toISOString(),
    } satisfies GateEvidenceMeta,
  };
  await putS3Object(
    "private",
    s3KeyFromRef(ref),
    Buffer.from(JSON.stringify(payload), "utf8"),
    "application/json",
  );
  return ref;
}

export async function storeGateScreenshotEvidence(input: {
  projectId: string;
  candidateId: string;
  route: string;
  viewport: "mobile" | "desktop";
  bytes: Uint8Array;
}): Promise<string> {
  const ref = evidenceRefForCandidate({ ...input, kind: "screenshot" });
  await putS3Object(
    "private",
    s3KeyFromRef(ref),
    Buffer.from(input.bytes),
    "image/jpeg",
  );
  return ref;
}

export async function readGateEvidence<T>(ref: string): Promise<T | null> {
  try {
    const body = await getS3Object("private", s3KeyFromRef(ref));
    if (ref.endsWith(".jpg")) {
      return { screenshot: body.toString("base64") } as T;
    }
    return JSON.parse(body.toString("utf8")) as T;
  } catch {
    return null;
  }
}

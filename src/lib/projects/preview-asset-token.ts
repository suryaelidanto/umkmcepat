import { createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/config";

export const PREVIEW_ASSET_TOKEN_PARAM = "assetToken";

export function createPreviewAssetToken({
  deploymentId,
  projectId,
}: {
  deploymentId: string;
  projectId: string;
}) {
  return createHmac("sha256", getPreviewAssetSecret())
    .update(projectId)
    .update(":")
    .update(deploymentId)
    .digest("base64url");
}

export function verifyPreviewAssetToken({
  deploymentId,
  projectId,
  token,
}: {
  deploymentId: string;
  projectId: string;
  token: string | null;
}) {
  if (!token) {
    return false;
  }

  const expected = createPreviewAssetToken({ deploymentId, projectId });
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);

  return (
    expectedBuffer.length === tokenBuffer.length &&
    timingSafeEqual(expectedBuffer, tokenBuffer)
  );
}

function getPreviewAssetSecret() {
  return getEnv(
    "NEXTAUTH_SECRET",
    getEnv("AUTH_SECRET", "development-preview-asset-token"),
  );
}

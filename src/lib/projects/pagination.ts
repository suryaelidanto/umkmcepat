export const PROJECT_PAGE_SIZE = 3;

const MAX_CURSOR_LENGTH = 512;

type ProjectCursor = {
  id: string;
  updatedAt: Date;
};

export function encodeProjectCursor(cursor: ProjectCursor) {
  return Buffer.from(
    JSON.stringify({
      id: cursor.id,
      updatedAt: cursor.updatedAt.toISOString(),
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeProjectCursor(value: string): ProjectCursor | null {
  if (!value || value.length > MAX_CURSOR_LENGTH) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { id?: unknown; updatedAt?: unknown };

    if (
      typeof parsed.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(parsed.id) ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    const updatedAt = new Date(parsed.updatedAt);

    if (
      !Number.isFinite(updatedAt.getTime()) ||
      updatedAt.toISOString() !== parsed.updatedAt
    ) {
      return null;
    }

    return { id: parsed.id, updatedAt };
  } catch {
    return null;
  }
}

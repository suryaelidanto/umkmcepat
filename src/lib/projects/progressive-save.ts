import { type Prisma } from "@prisma/client";

import { type GeneratedProjectFile } from "./generated-types";

import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";

export function createProgressiveSaver({
  projectId,
  token,
  userId,
  logContext,
}: {
  projectId: string;
  token: string;
  userId: string;
  logContext: "generate" | "edit";
}) {
  let activeWrite: Promise<void> | null = null;
  let nextFilesPayload: GeneratedProjectFile[] | null = null;

  const performWrite = async (files: GeneratedProjectFile[]): Promise<void> => {
    try {
      await prisma.project.updateMany({
        where: {
          activeOperationToken: token,
          id: projectId,
          userId,
        },
        data: {
          sourceFiles: files as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      devLog(logContext, "progressive_save_failed", {
        error: message,
        projectId,
      });
    }
  };

  const processQueue = async (): Promise<void> => {
    if (nextFilesPayload === null) {
      activeWrite = null;
      return;
    }

    const payload = nextFilesPayload;
    nextFilesPayload = null;
    activeWrite = performWrite(payload).then(processQueue);
  };

  return {
    save(files: GeneratedProjectFile[]) {
      nextFilesPayload = files;
      if (!activeWrite) {
        activeWrite = processQueue();
      }
    },
    async flush() {
      while (activeWrite) {
        await activeWrite;
      }
    },
  };
}

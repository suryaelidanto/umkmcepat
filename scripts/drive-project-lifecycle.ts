import { encode } from "@auth/core/jwt";

import { authConfig } from "@/lib/auth/auth-config";
import { prisma } from "@/lib/prisma";

const DEFAULT_BASE_URL = process.env.BASE_URL || "http://localhost:3000";

type CardOption = {
  label: string;
  value: string;
  description?: string;
};

type WorkspaceCard = {
  type: string;
  title?: string;
  question?: string;
  options?: CardOption[];
  allowCustomAnswer?: boolean;
  handoffId?: string;
  reviewHash?: string;
  canBuild?: boolean;
  errorMessage?: string;
};

async function createAuthCookie(userId: string): Promise<string> {
  const secret = authConfig.secret;
  if (!secret) {
    throw new Error("Auth secret is not configured.");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  const token = await encode({
    salt: "authjs.session-token",
    secret,
    token: {
      email: user?.email ?? "owner@example.com",
      id: userId,
      name: user?.name ?? "Owner",
      sub: userId,
    },
  });
  return `authjs.session-token=${token}`;
}

async function sendChatTurn(opts: {
  baseUrl: string;
  cookie: string;
  projectId: string;
  text: string;
  selectedOption?: string;
}): Promise<WorkspaceCard | null> {
  const url = `${opts.baseUrl}/api/projects/${opts.projectId}/chat/turn`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: opts.cookie,
      Origin: opts.baseUrl,
      Referer: `${opts.baseUrl}/projects/${opts.projectId}`,
      Accept: "text/event-stream, application/json",
    },
    body: JSON.stringify({
      text: opts.text,
      selectedOptions: opts.selectedOption ? [opts.selectedOption] : undefined,
      mode: "discuss",
      clientMessageId: `msg-${Date.now()}`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Chat turn failed with status ${res.status}: ${errText}`);
  }

  // Poll project state to get settled workspaceCard
  await new Promise((r) => setTimeout(r, 2000));
  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { workspaceCard: true, chatMessages: true },
  });

  return (project?.workspaceCard as WorkspaceCard) ?? null;
}

async function monitorBuildStream(opts: {
  baseUrl: string;
  cookie: string;
  projectId: string;
  handoffId?: string;
  reviewHash?: string;
  timeoutMs: number;
}): Promise<{ ok: boolean; status: string; log?: string }> {
  console.log("\n🚀 Memulai Build Website...");
  let resolvedHandoffId = opts.handoffId;
  let resolvedReviewHash = opts.reviewHash;

  if (!resolvedHandoffId || !resolvedReviewHash) {
    const project = await prisma.project.findUnique({
      where: { id: opts.projectId },
      select: { activeHandoffId: true },
    });
    if (project?.activeHandoffId) {
      resolvedHandoffId = project.activeHandoffId;
      const handoff = await prisma.projectBuildHandoff.findUnique({
        where: { id: project.activeHandoffId },
        select: { reviewHash: true },
      });
      resolvedReviewHash = handoff?.reviewHash;
    }
  }

  const url = `${opts.baseUrl}/api/projects/${opts.projectId}/generate`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: opts.cookie,
        Origin: opts.baseUrl,
        Referer: `${opts.baseUrl}/projects/${opts.projectId}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        mode: "first_generate",
        clientAttemptId: `att-${Date.now()}`,
        handoffId: resolvedHandoffId,
        reviewHash: resolvedReviewHash,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Build trigger failed: ${res.status} ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No readable response body from build stream.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "progress") {
              console.log(`[BUILD] ${data.label}: ${data.detail ?? ""}`);
            } else if (data.type === "operation") {
              console.log(`[OP] ${data.title} -> ${data.state}`);
            } else if (data.type === "energy") {
              console.log(`[ENERGY] -${data.energyUsed} (${data.reason})`);
            } else if (data.type === "status") {
              console.log(`[STATUS] Build status: ${data.status}`);
              if (data.status === "succeeded" || data.status === "passed") {
                clearTimeout(timer);
                return { ok: true, status: "succeeded" };
              }
              if (data.status === "failed") {
                clearTimeout(timer);
                return { ok: false, status: "failed", log: data.log };
              }
            }
          } catch {
            // non-json line
          }
        }
      }
    }

    clearTimeout(timer);
    const finalProject = await prisma.project.findUnique({
      where: { id: opts.projectId },
      select: { buildStatus: true, status: true },
    });
    return {
      ok:
        finalProject?.buildStatus === "succeeded" ||
        finalProject?.buildStatus === "passed" ||
        finalProject?.status === "ready",
      status: finalProject?.buildStatus ?? "unknown",
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Build stream timed out after ${opts.timeoutMs / 1000}s`);
    }
    throw err;
  }
}

export async function driveProjectLifecycle(projectId: string) {
  console.log(`\n========================================`);
  console.log(`🎯 Driving Project Lifecycle: ${projectId}`);
  console.log(`========================================\n`);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      userId: true,
      prompt: true,
      status: true,
      buildStatus: true,
      workspaceCard: true,
    },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found in database.`);
  }

  const cookie = await createAuthCookie(project.userId);
  let card = (project.workspaceCard as WorkspaceCard) ?? null;
  let turnCount = 0;
  const maxTurns = 8;

  // Conversational loop
  while (turnCount < maxTurns) {
    turnCount++;

    if (!card || card.type === "question") {
      const questionText =
        card?.question || card?.title || "Apa produk atau layanan utamamu?";
      console.log(`\n🤖 [AI Question Turn ${turnCount}]: ${questionText}`);

      let answerText = "Produk dan layanan standar.";
      let selectedOption: string | undefined;

      if (card?.options && card.options.length > 0) {
        // Pick the first sensible option
        const chosen = card.options[0];
        selectedOption = chosen.value;
        answerText = chosen.label;
        console.log(`👉 [User Action]: Memilih opsi "${chosen.label}"`);
      } else {
        // Smart contextual answer
        if (turnCount === 1) {
          answerText =
            "Kaos Distro Original Streetwear dengan bahan katun combed 24s";
        } else if (turnCount === 2) {
          answerText = "Nomor WhatsApp untuk pemesanan: 081234567890";
        } else if (turnCount === 3) {
          answerText = "Harga mulai dari Rp 120.000 sampai Rp 180.000";
        } else {
          answerText = "Sudah pas dan lengkap, yuk kita bangun websitenya!";
        }
        console.log(`💬 [User Answer]: "${answerText}"`);
      }

      card = await sendChatTurn({
        baseUrl: DEFAULT_BASE_URL,
        cookie,
        projectId,
        text: answerText,
        selectedOption,
      });
    }

    if (card?.type === "build_recommendation" || card?.canBuild) {
      console.log(`\n✅ [Build Ready]: AI siap membangun website!`);
      break;
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  // Trigger Build
  const buildResult = await monitorBuildStream({
    baseUrl: DEFAULT_BASE_URL,
    cookie,
    projectId,
    handoffId: card?.handoffId,
    reviewHash: card?.reviewHash,
    timeoutMs: 5 * 60_000,
  });

  if (buildResult.ok) {
    console.log(`\n🎉 SUKSES! Website berhasil dibangun dan terverifikasi.`);
    console.log(`🌐 Preview URL: ${DEFAULT_BASE_URL}/projects/${projectId}`);
  } else {
    console.error(`\n❌ GAGAL: Build status = ${buildResult.status}`);
    if (buildResult.log) {
      console.error(`Log:\n${buildResult.log.slice(0, 1000)}`);
    }
    process.exitCode = 1;
  }
}

// CLI entrypoint
const targetProjectId = process.argv[2] || process.env.PROJECT_ID;
if (!targetProjectId) {
  console.error("Usage: bun scripts/drive-project-lifecycle.ts <PROJECT_ID>");
  process.exit(1);
}

driveProjectLifecycle(targetProjectId).catch((err) => {
  console.error("\n💥 Error driving project lifecycle:", err);
  process.exit(1);
});

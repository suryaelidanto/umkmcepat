import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { encode } from "@auth/core/jwt";
import { chromium } from "playwright-core";

import { authConfig } from "@/lib/auth/auth-config";
import { prisma } from "@/lib/prisma";

const DEFAULT_BASE_URL = process.env.BASE_URL || "http://localhost:3000";

type CardOption = {
  label: string;
  value: string;
  description?: string;
};

type QuestionPayload = {
  id?: string;
  question?: string;
  options?: CardOption[];
  answerMode?: string;
  placeholder?: string;
};

type WorkspaceCard = {
  type: string;
  title?: string;
  question?: string | QuestionPayload;
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
  const url = `${opts.baseUrl}/api/projects/preview`;
  const messageId = `msg-${Date.now()}`;
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
      projectId: opts.projectId,
      mode: "discuss",
      message: {
        id: messageId,
        role: "user",
        parts: [{ type: "text", text: opts.text }],
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Chat turn failed with status ${res.status}: ${errText}`);
  }

  // Consume SSE stream to allow server background workers to settle
  if (res.body) {
    const reader = res.body.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) {
        break;
      }
    }
  }

  // Poll project state until settled workspaceCard is found
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const project = await prisma.project.findUnique({
      where: { id: opts.projectId },
      select: { workspaceCard: true, chatMessages: true },
    });
    const c = project?.workspaceCard as WorkspaceCard | null;
    if (c) {
      return c;
    }
  }

  return null;
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
      select: { activeHandoffId: true, workspaceCard: true },
    });
    if (project?.activeHandoffId) {
      resolvedHandoffId = project.activeHandoffId;
      const handoff = await prisma.projectBuildHandoff.findUnique({
        where: { id: project.activeHandoffId },
        select: { reviewHash: true },
      });
      resolvedReviewHash = handoff?.reviewHash;
    }
    if (!resolvedHandoffId && project?.workspaceCard) {
      const c = project.workspaceCard as WorkspaceCard;
      resolvedHandoffId = c.handoffId;
      resolvedReviewHash = c.reviewHash;
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

async function capturePreviewScreenshots(opts: {
  baseUrl: string;
  projectId: string;
  cookie: string;
}) {
  console.log("\n📸 Mengambil screenshot preview website...");
  const outDir = resolve(process.cwd(), "tmp/screenshots", opts.projectId);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    // 1. Desktop Screenshot
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
    });
    await desktopContext.addCookies([
      {
        name: "authjs.session-token",
        value: opts.cookie.replace("authjs.session-token=", ""),
        domain: "localhost",
        path: "/",
      },
    ]);
    const desktopPage = await desktopContext.newPage();
    const previewUrl = `${opts.baseUrl}/api/projects/${opts.projectId}/preview/`;
    await desktopPage.goto(previewUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    const desktopPath = resolve(outDir, "desktop.png");
    await desktopPage.screenshot({ path: desktopPath, fullPage: true });
    console.log(`🖼️  Desktop screenshot: ${desktopPath}`);

    // 2. Mobile Screenshot
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      colorScheme: "light",
    });
    await mobileContext.addCookies([
      {
        name: "authjs.session-token",
        value: opts.cookie.replace("authjs.session-token=", ""),
        domain: "localhost",
        path: "/",
      },
    ]);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(previewUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    const mobilePath = resolve(outDir, "mobile.png");
    await mobilePage.screenshot({ path: mobilePath, fullPage: true });
    console.log(`📱 Mobile screenshot: ${mobilePath}`);
  } finally {
    await browser.close();
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
  const maxTurns = 16;

  // Conversational loop
  while (turnCount < maxTurns) {
    turnCount++;

    if (card?.type === "build_recommendation" || card?.canBuild) {
      console.log(`\n✅ [Build Ready]: AI siap membangun website!`);
      break;
    }

    const questionObj =
      card?.question && typeof card.question === "object"
        ? (card.question as QuestionPayload)
        : null;
    const questionText =
      questionObj?.question ||
      (typeof card?.question === "string" ? card.question : null) ||
      card?.title ||
      "Apa detail usaha kuliner kamu?";
    const options = questionObj?.options || card?.options || [];
    const questionId = questionObj?.id || "";

    console.log(`\n🤖 [AI Question Turn ${turnCount}]: ${questionText}`);

    let answerText = "Kopi Senja Nusantara";
    let selectedOption: string | undefined;

    if (options.length > 0) {
      const chosen = options[0];
      selectedOption = chosen.value;
      answerText = chosen.label;
      console.log(`👉 [User Action]: Memilih opsi "${chosen.label}"`);
    } else {
      if (
        questionId === "business_name" ||
        /nama usaha|nama brand/i.test(questionText)
      ) {
        answerText = "Kopi Senja Nusantara";
      } else if (/produk|menu|jual apa/i.test(questionText)) {
        answerText =
          "Kopi Susu Gula Aren, Americano, Toast Srikaya, dan Croissant Butter";
      } else if (/whatsapp|nomor|kontak/i.test(questionText)) {
        answerText = "WhatsApp pemesanan: 081298765432";
      } else if (/harga|price/i.test(questionText)) {
        answerText = "Kisaran harga Rp 18.000 sampai Rp 35.000";
      } else if (/lokasi|alamat/i.test(questionText)) {
        answerText = "Jl. Senopati No. 42, Kebayoran Baru, Jakarta Selatan";
      } else if (/keunggulan|usp/i.test(questionText)) {
        answerText =
          "100% biji arabika lokal pilihan dengan suasana nyaman untuk kerja dan nongkrong";
      } else {
        answerText = "Sudah pas dan lengkap, yuk kita buat websitenya!";
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

    // Capture screenshots
    await capturePreviewScreenshots({
      baseUrl: DEFAULT_BASE_URL,
      projectId,
      cookie,
    });
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

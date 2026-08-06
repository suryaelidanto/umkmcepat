import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  enqueueAttemptJobMock,
  createReadStreamFromChannelMock,
  prismaTransactionMock,
  prismaProjectBuildCreateMock,
  prismaProjectBuildUpdateManyMock,
  prismaProjectBuildUpdateMock,
  prismaProjectDeploymentCreateMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectEditAttemptUpdateMock,
  prismaProjectEditAttemptCreateMock,
  prismaProjectFindFirstMock,
  prismaProjectSnapshotCreateMock,
  prismaProjectUpdateManyMock,
  prismaProjectSnapshotUpdateMock,
  prismaProjectUpdateMock,
  prismaRuntimeEventCreateMock,
  prismaExecuteRawMock,
  readProjectDistArtifactMock,
  stopSupersededPreviewDeploymentsMock,
  writeProjectDistArtifactMock,
  writeProjectSourceArtifactMock,
  getSettingMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaTransactionMock: vi.fn(),
  enqueueAttemptJobMock: vi.fn(),
  createReadStreamFromChannelMock: vi.fn(),
  prismaProjectBuildCreateMock: vi.fn(),
  prismaProjectBuildUpdateManyMock: vi.fn(),
  prismaProjectBuildUpdateMock: vi.fn(),
  prismaProjectDeploymentCreateMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectEditAttemptUpdateMock: vi.fn(),
  prismaProjectEditAttemptCreateMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectSnapshotCreateMock: vi.fn(),
  prismaProjectUpdateManyMock: vi.fn(),
  prismaProjectSnapshotUpdateMock: vi.fn(),
  prismaProjectUpdateMock: vi.fn(),
  prismaRuntimeEventCreateMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(),
  readProjectDistArtifactMock: vi.fn(),
  stopSupersededPreviewDeploymentsMock: vi.fn(async () => []),
  writeProjectDistArtifactMock: vi.fn(),
  writeProjectSourceArtifactMock: vi.fn(),
  getSettingMock: vi.fn(async (_key: string, fallback: boolean) => fallback),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/app-settings", () => ({ getSetting: getSettingMock }));
vi.mock("@/lib/prisma", () => {
  const prisma = {
    $executeRaw: prismaExecuteRawMock,
    $transaction: prismaTransactionMock,
    project: {
      findFirst: prismaProjectFindFirstMock,
      update: prismaProjectUpdateMock,
      updateMany: prismaProjectUpdateManyMock,
    },
    projectBuild: {
      create: prismaProjectBuildCreateMock,
      update: prismaProjectBuildUpdateMock,
      updateMany: prismaProjectBuildUpdateManyMock,
    },
    projectDeployment: {
      create: prismaProjectDeploymentCreateMock,
      findMany: prismaProjectDeploymentFindManyMock,
    },
    projectEditAttempt: {
      create: prismaProjectEditAttemptCreateMock,
      update: prismaProjectEditAttemptUpdateMock,
    },
    projectSnapshot: {
      create: prismaProjectSnapshotCreateMock,
      update: prismaProjectSnapshotUpdateMock,
    },
    runtimeEvent: { create: prismaRuntimeEventCreateMock },
  };

  prismaTransactionMock.mockImplementation(
    async (callback: (transaction: typeof prisma) => unknown) =>
      callback(prisma),
  );

  return { prisma };
});
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/user-credits", () => ({
  getEnergyConfig: vi.fn(() => ({
    signupGrant: 500_000,
    microUsdPerEnergy: "100",
    minBuild: "10000",
    minDiscuss: "5000",
    minEdit: "10000",
    minGeneration: "5000",
    minModeration: "1000",
  })),
  checkEnergy: vi.fn(async () => ({ allowed: true, remaining: 200_000 })),
  addEnergyUsage: vi.fn(async () => ({
    energyUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
  })),
  chargeEnergyForAiUsage: vi.fn(async () => ({
    energyUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
  })),
}));
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  stopSupersededPreviewDeployments: stopSupersededPreviewDeploymentsMock,
}));
vi.mock("@/lib/projects/stale-builds", () => ({
  markStaleProjectBuilds: vi.fn(async () => 0),
}));
vi.mock("@/lib/projects/attempt-queue", () => ({
  enqueueAttemptJob: enqueueAttemptJobMock,
}));
vi.mock("@/lib/projects/build-attempt-pubsub", () => ({
  createReadStreamFromChannel: createReadStreamFromChannelMock,
}));
vi.mock("@/lib/projects/runtime-artifacts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/projects/runtime-artifacts")>();

  return {
    ...actual,
    readProjectDistArtifact: readProjectDistArtifactMock,
    writeProjectDistArtifact: writeProjectDistArtifactMock,
    writeProjectSourceArtifact: writeProjectSourceArtifactMock,
  };
});

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.projects.$id.edit";

const POST = getHandler(Route, "POST");

const older = new Date("2026-07-07T01:00:00.000Z");
const newer = new Date("2026-07-07T02:00:00.000Z");
const baseFiles = [
  {
    path: "generated-app.manifest.json",
    content: JSON.stringify({
      buildCommand: "bun run build",
      capabilities: ["static_content"],
      outputDirectory: "dist",
      packageManager: "bun",
      projectId: "project_1",
      routes: [{ path: "/", title: "Beranda" }],
      runtimeProfile: "static-react-v1",
      schemaVersion: "1",
      templateId: "vite-react-frontend-static",
      templateVersion: "1.0.0",
    }),
  },
  {
    path: "package.json",
    content: JSON.stringify({
      dependencies: { react: "19.2.0" },
      scripts: { build: "vite build" },
    }),
  },
  {
    path: "src/App.tsx",
    content:
      'export default function App(){return <main className="site-shell"><nav className="topbar">Bengkel</nav><h1>old headline</h1></main>}',
  },
  { path: "src/styles.css", content: ".topbar{background:#fff;color:#fff}" },
];

function request(
  commands: unknown[],
  instruction: string | null = "ubah judul website",
) {
  return new Request("http://localhost/api/projects/project_1/edit", {
    method: "POST",
    body: JSON.stringify({ commands, instruction: instruction ?? undefined }),
  });
}

async function readSseResponse(response: Response) {
  if (response.headers.get("Content-Type")?.includes("application/json")) {
    return response.json();
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData: unknown = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      const eventName = rawEvent.match(/^event: (.+)$/m)?.[1];
      const dataText = rawEvent.match(/^data: (.+)$/m)?.[1];
      if (eventName === "done" || eventName === "error") {
        finalData = JSON.parse(dataText!);
      }
    }
  }
  return finalData;
}

describe("project edit route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "project_1",
      prompt: "Buat website angkringan",
      siteSchema: null,
    });
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: {
          artifactRef: null,
          createdAt: newer,
          id: "build_failed",
          snapshotId: "snapshot_failed",
          status: "failed",
          updatedAt: newer,
        },
        buildId: "build_failed",
        createdAt: newer,
        id: "deployment_failed",
        kind: "preview",
        snapshot: {
          files: [{ path: "src/App.tsx", content: "failed source" }],
          id: "snapshot_failed",
          sourceRef: null,
        },
        snapshotId: "snapshot_failed",
        status: "failed",
        updatedAt: newer,
      },
      {
        build: {
          artifactRef: "project-artifact:local:dist:build_success",
          createdAt: older,
          id: "build_success",
          snapshotId: "snapshot_success",
          status: "succeeded",
          updatedAt: older,
        },
        buildId: "build_success",
        createdAt: older,
        id: "deployment_success",
        kind: "preview",
        snapshot: {
          files: baseFiles,
          id: "snapshot_success",
          sourceRef: null,
        },
        snapshotId: "snapshot_success",
        status: "stopped",
        updatedAt: older,
      },
    ]);
    prismaProjectBuildUpdateManyMock.mockResolvedValue({ count: 0 });
    prismaExecuteRawMock.mockResolvedValue(1);
    prismaProjectUpdateManyMock.mockResolvedValue({ count: 1 });
    prismaProjectSnapshotCreateMock.mockResolvedValue({ id: "snapshot_edit" });
    writeProjectSourceArtifactMock.mockResolvedValue(
      "project-artifact:local:source:snapshot_edit",
    );
    prismaProjectBuildCreateMock.mockResolvedValue({ id: "build_edit" });
    enqueueAttemptJobMock.mockResolvedValue(undefined);
    createReadStreamFromChannelMock.mockImplementation(
      (attemptId: string) =>
        new Response(
          `event: done
data: ${JSON.stringify({ attemptId, buildId: "build_edit", buildStatus: "succeeded", deploymentId: "deployment_edit", snapshotId: "snapshot_edit" })}

`,
          {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
            },
          },
        ),
    );
    readProjectDistArtifactMock.mockResolvedValue([
      { path: "index.html", content: "ok", contentType: "text/html" },
    ]);
    writeProjectDistArtifactMock.mockResolvedValue(
      "project-artifact:local:dist:build_edit",
    );
    prismaProjectDeploymentCreateMock.mockResolvedValue({
      id: "deployment_edit",
    });
  });

  it("does not claim or mutate a project when generated builds are disabled", async () => {
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "false");

    const response = await POST(request([], "ubah judul website"), {
      id: "project_1",
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("generated_build_execution_unavailable");
    expect(prismaProjectFindFirstMock).not.toHaveBeenCalled();
    expect(prismaProjectUpdateManyMock).not.toHaveBeenCalled();
    expect(prismaProjectSnapshotCreateMock).not.toHaveBeenCalled();
  });

  it("claims lease, enqueues edit job, and returns attempt stream", async () => {
    const response = await POST(request([], "ubah judul website"), {
      id: "project_1",
    });

    expect(response.status).toBe(200);
    expect(enqueueAttemptJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "edit",
        projectId: "project_1",
        userId: "user_1",
        attemptId: expect.stringMatching(/^edit_/),
      }),
    );
    expect(createReadStreamFromChannelMock).toHaveBeenCalledWith(
      expect.stringMatching(/^edit_/),
    );
    const body = await readSseResponse(response);
    expect(body).toMatchObject({
      buildId: "build_edit",
      buildStatus: "succeeded",
    });
    // Work happens in worker, not on the request thread.
    expect(prismaProjectSnapshotCreateMock).not.toHaveBeenCalled();
  });

  it("returns stream view without writing progress events on the route", async () => {
    const response = await POST(request([], "ubah judul website"), {
      id: "project_1",
    });
    expect(response.status).toBe(200);
    expect(enqueueAttemptJobMock).toHaveBeenCalled();
    // Progress persistence is worker-owned after enqueue.
    const progressCalls = prismaRuntimeEventCreateMock.mock.calls.filter(
      ([arg]) => arg?.data?.type === "build.progress",
    );
    expect(progressCalls).toHaveLength(0);
  });

  it("records visual edit attempts and enqueues with attempt id", async () => {
    const response = await POST(
      request(
        [],
        'Apply these visual comments to the generated website source.\n\nVisual comments:\n[{"label":"Bagian website","comment":"navbar"}]',
      ),
      { id: "project_1" },
    );
    const body = await readSseResponse(response);

    expect(response.status).toBe(200);
    expect(body.attemptId).toMatch(/^edit_/);
    expect(prismaProjectEditAttemptCreateMock).toHaveBeenCalled();
    expect(enqueueAttemptJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "edit" }),
    );
  });

  it("returns 503 when edit queue enqueue fails and releases claim", async () => {
    enqueueAttemptJobMock.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST(request([], "ubah judul website"), {
      id: "project_1",
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("edit_failed_retryable");
    expect(prismaProjectUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildStatus: "passed",
          status: "ready",
        }),
      }),
    );
  });

  it("returns 409 when another build is already running", async () => {
    prismaProjectFindFirstMock
      .mockResolvedValueOnce({
        buildStatus: "passed",
        chatMessages: [],
        id: "project_1",
        prompt: "bengkel",
        siteSchema: null,
        status: "ready",
      })
      .mockResolvedValueOnce({
        buildStatus: "running",
        status: "building",
      });

    const response = await POST(request([], "ubah judul website"), {
      id: "project_1",
    });
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.code).toBe("project_build_in_progress");
    expect(enqueueAttemptJobMock).not.toHaveBeenCalled();
  });

  it("marks attempt failed when enqueue is unavailable after claim", async () => {
    enqueueAttemptJobMock.mockRejectedValueOnce(new Error("queue full"));
    const response = await POST(request([], "ubah judul website"), {
      id: "project_1",
    });
    expect(response.status).toBe(503);
    expect(prismaProjectEditAttemptUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("rejects browser-supplied privileged tool commands before claiming", async () => {
    const response = await POST(
      request(
        [
          { type: "write_file", path: "src/App.tsx", content: "browser edit" },
          { type: "check_app" },
        ],
        null,
      ),
      { id: "project_1" },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("edit_instruction_required");
    expect(prismaProjectUpdateManyMock).not.toHaveBeenCalled();
    expect(prismaProjectSnapshotCreateMock).not.toHaveBeenCalled();
  });

  it("returns 404 when feature.direct_edit_enabled is off", async () => {
    getSettingMock.mockResolvedValueOnce(false);

    const response = await POST(request([], "ubah judul website"), {
      id: "project_1",
    });

    expect(response.status).toBe(404);
  });
});

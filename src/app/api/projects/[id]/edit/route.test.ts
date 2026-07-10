import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  buildGeneratedProjectMock,
  editGeneratedSourceWithAgentMock,
  prismaTransactionMock,
  prismaProjectBuildCreateMock,
  prismaProjectBuildUpdateManyMock,
  prismaProjectBuildUpdateMock,
  prismaProjectDeploymentCreateMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectEditAttemptUpdateMock,
  prismaProjectFindFirstMock,
  prismaProjectSnapshotCreateMock,
  prismaProjectUpdateManyMock,
  prismaProjectSnapshotUpdateMock,
  prismaProjectUpdateMock,
  prismaRuntimeEventCreateMock,
  prismaExecuteRawMock,
  stopSupersededPreviewDeploymentsMock,
  writeProjectDistArtifactMock,
  writeProjectSourceArtifactMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buildGeneratedProjectMock: vi.fn(),
  prismaTransactionMock: vi.fn(),
  editGeneratedSourceWithAgentMock: vi.fn(),
  prismaProjectBuildCreateMock: vi.fn(),
  prismaProjectBuildUpdateManyMock: vi.fn(),
  prismaProjectBuildUpdateMock: vi.fn(),
  prismaProjectDeploymentCreateMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectEditAttemptUpdateMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectSnapshotCreateMock: vi.fn(),
  prismaProjectUpdateManyMock: vi.fn(),
  prismaProjectSnapshotUpdateMock: vi.fn(),
  prismaProjectUpdateMock: vi.fn(),
  prismaRuntimeEventCreateMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(),
  stopSupersededPreviewDeploymentsMock: vi.fn(async () => []),
  writeProjectDistArtifactMock: vi.fn(),
  writeProjectSourceArtifactMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
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
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  stopSupersededPreviewDeployments: stopSupersededPreviewDeploymentsMock,
}));
vi.mock("@/lib/projects/source-edit-agent", () => ({
  editGeneratedSourceWithAgent: editGeneratedSourceWithAgentMock,
}));
vi.mock("@/lib/projects/stale-builds", () => ({
  markStaleProjectBuilds: vi.fn(async () => 0),
}));
vi.mock("@/lib/projects/generated-source", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/projects/generated-source")>();

  return {
    ...actual,
    buildGeneratedProject: buildGeneratedProjectMock,
  };
});
vi.mock("@/lib/projects/runtime-artifacts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/projects/runtime-artifacts")>();

  return {
    ...actual,
    writeProjectDistArtifact: writeProjectDistArtifactMock,
    writeProjectSourceArtifact: writeProjectSourceArtifactMock,
  };
});

import { POST } from "./route";

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
    editGeneratedSourceWithAgentMock.mockImplementation(
      async ({ files }: { files: typeof baseFiles }) => ({
        check: { issues: [], ok: true },
        files: files.map((file) =>
          file.path === "src/App.tsx"
            ? {
                ...file,
                content: file.content.replace("old headline", "new headline"),
              }
            : file,
        ),
        ok: true,
        operations: [],
        outputs: [],
        sideEffects: [{ path: "src/App.tsx", type: "replace_in_file" }],
      }),
    );
    prismaProjectSnapshotCreateMock.mockResolvedValue({ id: "snapshot_edit" });
    writeProjectSourceArtifactMock.mockResolvedValue(
      "project-artifact:local:source:snapshot_edit",
    );
    prismaProjectBuildCreateMock.mockResolvedValue({ id: "build_edit" });
    buildGeneratedProjectMock.mockResolvedValue({
      distFiles: [
        { path: "index.html", content: "ok", contentType: "text/html" },
      ],
      log: "ok",
      ok: true,
    });
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
      params: Promise.resolve({ id: "project_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("generated_build_execution_unavailable");
    expect(prismaProjectFindFirstMock).not.toHaveBeenCalled();
    expect(prismaProjectUpdateManyMock).not.toHaveBeenCalled();
    expect(prismaProjectSnapshotCreateMock).not.toHaveBeenCalled();
  });

  it("edits the latest successful preview source instead of the newest failed attempt", async () => {
    const response = await POST(
      request([
        {
          type: "replace_in_file",
          path: "src/App.tsx",
          find: "old headline",
          replace: "new headline",
        },
        { type: "check_app" },
      ]),
      { params: Promise.resolve({ id: "project_1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      buildId: "build_edit",
      buildStatus: "succeeded",
      deploymentId: "deployment_edit",
      snapshotId: "snapshot_edit",
    });
    expect(stopSupersededPreviewDeploymentsMock).toHaveBeenCalledWith({
      activeDeploymentId: "deployment_edit",
      projectId: "project_1",
    });
    expect(prismaProjectSnapshotCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          files: expect.arrayContaining([
            {
              path: "src/App.tsx",
              content:
                'export default function App(){return <main className="site-shell"><nav className="topbar">Bengkel</nav><h1>new headline</h1></main>}',
            },
          ]),
          parentSnapshotId: "snapshot_success",
          sourceType: "edited",
        }),
      }),
    );
    expect(prismaProjectUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildStatus: "passed",
          sourceFiles: expect.any(Array),
          status: "ready",
        }),
        where: expect.objectContaining({
          activeOperationToken: expect.stringMatching(/^op_/),
          id: "project_1",
          userId: "user_1",
        }),
      }),
    );
  });

  it("records visual edit attempts and treats no-op selectors as advisory", async () => {
    const response = await POST(
      request(
        [
          {
            type: "write_file",
            path: "src/styles.css",
            content:
              ".topbar{background:#fff;color:#fff}\n.hero-card{outline:2px solid red}",
          },
          { type: "check_app" },
        ],
        'Apply these visual comments to the generated website source.\n\nVisual comments:\n[{"label":"Bagian website — Bengkel","comment":"navbar warnanya jangan nabrak","target":{"classes":"topbar","selectorPath":"main > nav.topbar","tag":"nav","text":"Bengkel","boundingBox":{"x":0,"y":0,"width":100,"height":40}}}]',
      ),
      { params: Promise.resolve({ id: "project_1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attemptId).toMatch(/^edit_/);
    expect(prismaExecuteRawMock).toHaveBeenCalled();
    expect(prismaProjectSnapshotCreateMock).toHaveBeenCalled();
  });

  it("releases the project claim when artifact persistence throws before build creation", async () => {
    writeProjectSourceArtifactMock.mockRejectedValueOnce(
      new Error("artifact disk unavailable"),
    );

    const response = await POST(request([], "ubah judul website"), {
      params: Promise.resolve({ id: "project_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("edit_failed_retryable");
    expect(prismaProjectBuildCreateMock).not.toHaveBeenCalled();
    expect(prismaProjectDeploymentCreateMock).not.toHaveBeenCalled();
    expect(prismaProjectUpdateManyMock).toHaveBeenLastCalledWith({
      data: {
        activeOperationExpiresAt: null,
        activeOperationKind: null,
        activeOperationToken: null,
        buildStatus: "passed",
        status: "ready",
      },
      where: {
        activeOperationToken: expect.stringMatching(/^op_/),
        id: "project_1",
        userId: "user_1",
      },
    });
  });

  it("does not promote a deployment when the operation token is superseded", async () => {
    prismaProjectUpdateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const response = await POST(request([], "ubah judul website"), {
      params: Promise.resolve({ id: "project_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("edit_failed_retryable");
    expect(prismaProjectDeploymentCreateMock).not.toHaveBeenCalled();
  });

  it("records a failed edit build without replacing project source or ready status", async () => {
    buildGeneratedProjectMock.mockResolvedValue({
      distFiles: [],
      log: "compile failed",
      ok: false,
    });

    const response = await POST(
      request([
        {
          type: "replace_in_file",
          path: "src/App.tsx",
          find: "old headline",
          replace: "broken headline",
        },
        { type: "check_app" },
      ]),
      { params: Promise.resolve({ id: "project_1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.buildStatus).toBe("failed");
    expect(prismaProjectDeploymentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
    expect(prismaProjectUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildLog: "compile failed",
          buildStatus: "failed",
          status: "ready",
        }),
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
      { params: Promise.resolve({ id: "project_1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("edit_instruction_required");
    expect(prismaProjectUpdateManyMock).not.toHaveBeenCalled();
    expect(prismaProjectSnapshotCreateMock).not.toHaveBeenCalled();
  });
});

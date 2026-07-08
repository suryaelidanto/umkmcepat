import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  buildGeneratedProjectMock,
  prismaProjectBuildCreateMock,
  prismaProjectEditAttemptCreateMock,
  prismaProjectEditAttemptUpdateMock,
  prismaProjectBuildUpdateManyMock,
  prismaProjectBuildUpdateMock,
  prismaProjectDeploymentCreateMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectFindFirstMock,
  prismaProjectSnapshotCreateMock,
  prismaProjectUpdateManyMock,
  prismaProjectSnapshotUpdateMock,
  prismaProjectUpdateMock,
  prismaRuntimeEventCreateMock,
  writeProjectDistArtifactMock,
  writeProjectSourceArtifactMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buildGeneratedProjectMock: vi.fn(),
  prismaProjectBuildCreateMock: vi.fn(),
  prismaProjectEditAttemptCreateMock: vi.fn(),
  prismaProjectEditAttemptUpdateMock: vi.fn(),
  prismaProjectBuildUpdateManyMock: vi.fn(),
  prismaProjectBuildUpdateMock: vi.fn(),
  prismaProjectDeploymentCreateMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectSnapshotCreateMock: vi.fn(),
  prismaProjectUpdateManyMock: vi.fn(),
  prismaProjectSnapshotUpdateMock: vi.fn(),
  prismaProjectUpdateMock: vi.fn(),
  prismaRuntimeEventCreateMock: vi.fn(),
  writeProjectDistArtifactMock: vi.fn(),
  writeProjectSourceArtifactMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
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
    projectEditAttempt: {
      create: prismaProjectEditAttemptCreateMock,
      update: prismaProjectEditAttemptUpdateMock,
    },
    projectDeployment: {
      create: prismaProjectDeploymentCreateMock,
      findMany: prismaProjectDeploymentFindManyMock,
    },
    projectSnapshot: {
      create: prismaProjectSnapshotCreateMock,
      update: prismaProjectSnapshotUpdateMock,
    },
    runtimeEvent: { create: prismaRuntimeEventCreateMock },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
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
    path: ".umkmcepat/project.json",
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

function request(commands: unknown[], instruction?: string) {
  return new Request("http://localhost/api/projects/project_1/edit", {
    method: "POST",
    body: JSON.stringify({ commands, instruction }),
  });
}

describe("project edit route", () => {
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
    prismaProjectEditAttemptCreateMock.mockResolvedValue({ id: "attempt_1" });
    prismaProjectEditAttemptUpdateMock.mockResolvedValue({});
    prismaProjectUpdateManyMock.mockResolvedValue({ count: 1 });
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
    expect(prismaProjectUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ready",
          buildStatus: "passed",
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
    expect(body.attemptId).toBe("attempt_1");
    expect(prismaProjectEditAttemptCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "instruction" }),
      }),
    );
    expect(prismaProjectSnapshotCreateMock).toHaveBeenCalled();
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
    expect(prismaProjectUpdateMock).toHaveBeenCalledWith({
      data: { buildLog: "compile failed", buildStatus: "failed" },
      where: { id: "project_1" },
    });
  });

  it("rejects unsafe edit tools before creating a snapshot", async () => {
    const response = await POST(
      request([
        { type: "write_file", path: "../escape.ts", content: "bad" },
        { type: "check_app" },
      ]),
      { params: Promise.resolve({ id: "project_1" }) },
    );

    expect(response.status).toBe(400);
    expect(prismaProjectSnapshotCreateMock).not.toHaveBeenCalled();
  });
});

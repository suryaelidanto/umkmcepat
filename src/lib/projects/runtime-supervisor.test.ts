import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { putMock, getMock, deleteMock, store } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    putMock: vi.fn(
      async (_b: "public" | "private", key: string, body: Buffer) => {
        store.set(key, body.toString("utf8"));
      },
    ),
    getMock: vi.fn(async (_b: "public" | "private", key: string) => {
      const v = store.get(key);
      if (v === undefined) {
        throw new Error("NoSuchKey");
      }
      return Buffer.from(v);
    }),
    deleteMock: vi.fn(async (_b: "public" | "private", key: string) => {
      store.delete(key);
    }),
    store,
  };
});

vi.mock("@/lib/s3-client", () => ({
  getS3Config: () => ({ client: {}, bucket: "pub" }),
  putS3Object: putMock,
  getS3Object: getMock,
  deleteS3Object: deleteMock,
  S3_PREFIXES: {
    artifact: "project-artifacts",
    asset: "project-assets",
    object: "objects",
    thumbnail: "project-thumbnails",
  },
}));

import { writeProjectDistArtifact } from "@/lib/projects/runtime-artifacts";
import {
  createLocalProcessRuntimeSupervisor,
  createNoopRuntimeSupervisor,
  stopSupersededPreviewDeployments,
} from "@/lib/projects/runtime-supervisor";

let tempDir = "";

describe("noop runtime supervisor", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }
    store.clear();
    putMock.mockClear();
    getMock.mockClear();
    deleteMock.mockClear();
  });

  it("exposes a safe stopped runtime boundary for Phase 1", async () => {
    const supervisor = createNoopRuntimeSupervisor();

    await expect(supervisor.startDeployment("deployment_1")).resolves.toBe(
      "stopped",
    );
    await expect(supervisor.stopDeployment("deployment_1")).resolves.toBe(
      "stopped",
    );
    await expect(supervisor.getDeploymentStatus("deployment_1")).resolves.toBe(
      "stopped",
    );
    await expect(
      supervisor.resolveDeploymentTarget("deployment_1"),
    ).resolves.toBeNull();
  });

  it("stops running preview deployments superseded by a newer deployment", async () => {
    const findMany = vi.fn(async () => [
      { id: "deployment_old_1" },
      { id: "deployment_old_2" },
    ]);
    const stopDeployment = vi.fn(async () => "stopped" as const);

    await expect(
      stopSupersededPreviewDeployments({
        activeDeploymentId: "deployment_new",
        prisma: {
          projectDeployment: {
            findMany,
            findUnique: vi.fn(),
            update: vi.fn(),
          },
          runtimeEvent: { create: vi.fn() },
          runtimeNode: { upsert: vi.fn() },
        },
        projectId: "project_1",
        supervisor: {
          getDeploymentStatus: vi.fn(),
          resolveDeploymentTarget: vi.fn(),
          startDeployment: vi.fn(),
          stopDeployment,
        },
      }),
    ).resolves.toEqual(["deployment_old_1", "deployment_old_2"]);
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: { not: "deployment_new" },
        kind: "preview",
        projectId: "project_1",
        status: { in: ["starting", "running"] },
      },
    });
    expect(stopDeployment).toHaveBeenCalledTimes(2);
  });

  it("starts and stops a generated dist artifact in a local runtime process", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-runtime-"));
    const artifactRef = await writeProjectDistArtifact({
      artifactId: "build_1",
      files: [
        {
          content: "<h1>Runtime preview</h1>",
          contentType: "text/html; charset=utf-8",
          path: "index.html",
        },
      ],
    });
    const events: unknown[] = [];
    let deployment = {
      build: { artifactRef },
      containerName: null as string | null,
      id: "deployment_1",
      internalUrl: null as string | null,
      projectId: "project_1",
      runtimeNodeId: null as string | null,
      status: "created",
    };
    const prisma = {
      projectDeployment: {
        findUnique: vi.fn(async () => deployment),
        update: vi.fn(async (input: unknown) => {
          const data = (input as { data: Partial<typeof deployment> }).data;

          deployment = { ...deployment, ...data };
          return deployment;
        }),
      },
      runtimeEvent: {
        create: vi.fn(async (input: unknown) => {
          events.push(input);
          return { id: `event_${events.length}` };
        }),
      },
      runtimeNode: {
        upsert: vi.fn(async () => ({ id: "node_1" })),
      },
    };
    const supervisor = createLocalProcessRuntimeSupervisor({
      prisma,
      runtimeRootDir: path.join(tempDir, "runtime"),
    });

    try {
      await expect(supervisor.startDeployment("deployment_1")).resolves.toBe(
        "running",
      );
      expect(deployment.status).toBe("running");
      expect(deployment.internalUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const response = await fetch(`${deployment.internalUrl}/index.html`);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
        "cross-origin",
      );
      await expect(response.text()).resolves.toContain("Runtime preview");
      await expect(
        supervisor.resolveDeploymentTarget("deployment_1"),
      ).resolves.toBe(deployment.internalUrl);
    } finally {
      await expect(supervisor.stopDeployment("deployment_1")).resolves.toBe(
        "stopped",
      );
    }

    expect(deployment.status).toBe("stopped");
    expect(events).toHaveLength(2);
  }, 30_000);

  it("marks a running deployment stopped when its serving docroot is deleted (404 health)", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-runtime-"));
    const artifactRef = await writeProjectDistArtifact({
      artifactId: "build_404",
      files: [
        {
          content: "<h1>Runtime preview</h1>",
          contentType: "text/html; charset=utf-8",
          path: "index.html",
        },
      ],
    });
    let deployment = {
      build: { artifactRef },
      containerName: null as string | null,
      id: "deployment_404",
      internalUrl: null as string | null,
      projectId: "project_404",
      runtimeNodeId: null as string | null,
      status: "created",
    };
    const prisma = {
      projectDeployment: {
        findUnique: vi.fn(async () => deployment),
        update: vi.fn(async (input: unknown) => {
          const data = (input as { data: Partial<typeof deployment> }).data;
          deployment = { ...deployment, ...data };
          return deployment;
        }),
      },
      runtimeEvent: { create: vi.fn(async () => ({ id: "event_404" })) },
      runtimeNode: { upsert: vi.fn(async () => ({ id: "node_404" })) },
    };
    const supervisor = createLocalProcessRuntimeSupervisor({
      prisma,
      runtimeRootDir: path.join(tempDir, "runtime"),
    });

    try {
      await expect(supervisor.startDeployment("deployment_404")).resolves.toBe(
        "running",
      );
      expect(deployment.status).toBe("running");

      await rm(path.join(tempDir, "runtime", "deployment_404"), {
        force: true,
        recursive: true,
      });

      await expect(
        supervisor.getDeploymentStatus("deployment_404"),
      ).resolves.toBe("stopped");
      expect(deployment.status).toBe("stopped");
    } finally {
      await supervisor.stopDeployment("deployment_404").catch(() => "stopped");
    }
  }, 30_000);
});

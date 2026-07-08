import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

import { prisma as defaultPrisma } from "@/lib/prisma";
import { materializeProjectDistArtifact } from "@/lib/projects/runtime-artifacts";
import { createRuntimeEventData } from "@/lib/projects/runtime-events";
import { type ProjectDeploymentStatus } from "@/lib/projects/runtime-types";

export type RuntimeStatus = Extract<
  ProjectDeploymentStatus,
  "starting" | "running" | "stopped" | "failed"
>;

export type RuntimeSupervisor = {
  getDeploymentStatus(deploymentId: string): Promise<RuntimeStatus>;
  resolveDeploymentTarget(deploymentId: string): Promise<string | null>;
  startDeployment(deploymentId: string): Promise<RuntimeStatus>;
  stopDeployment(deploymentId: string): Promise<RuntimeStatus>;
};

type RuntimeDeploymentRecord = {
  build: { artifactRef: string | null } | null;
  containerName: string | null;
  id: string;
  internalUrl: string | null;
  projectId: string;
  runtimeNodeId: string | null;
  status: string;
};

type RuntimeSupervisorPrisma = {
  projectDeployment: {
    findUnique(input: unknown): Promise<RuntimeDeploymentRecord | null>;
    update(input: unknown): Promise<unknown>;
  };
  runtimeEvent: {
    create(input: unknown): Promise<unknown>;
  };
  runtimeNode: {
    upsert(input: unknown): Promise<{ id: string }>;
  };
};

type LocalProcessRuntimeSupervisorOptions = {
  artifactRootDir?: string;
  prisma?: RuntimeSupervisorPrisma;
  runtimeRootDir?: string;
};

const LOCAL_RUNTIME_NODE_NAME = "local-process-runtime";
const LOCAL_RUNTIME_PROVIDER = "local-process";
const DEFAULT_MAX_CONTAINERS = 8;
const RUNTIME_START_TIMEOUT_MS = 5_000;

declare global {
  var umkmRuntimeProcesses: Map<string, ChildProcess> | undefined;
  var umkmRuntimeStartPromises: Map<string, Promise<RuntimeStatus>> | undefined;
}

export function createNoopRuntimeSupervisor(): RuntimeSupervisor {
  return {
    async getDeploymentStatus() {
      return "stopped";
    },
    async resolveDeploymentTarget() {
      return null;
    },
    async startDeployment() {
      return "stopped";
    },
    async stopDeployment() {
      return "stopped";
    },
  };
}

export function createLocalProcessRuntimeSupervisor(
  options: LocalProcessRuntimeSupervisorOptions = {},
): RuntimeSupervisor {
  const runtimePrisma =
    options.prisma ?? (defaultPrisma as unknown as RuntimeSupervisorPrisma);
  const runtimeRootDir =
    options.runtimeRootDir ||
    process.env.PROJECT_RUNTIME_DIR ||
    path.join(process.cwd(), ".data", "project-runtimes");
  const artifactRootDir = options.artifactRootDir;
  const processes =
    globalThis.umkmRuntimeProcesses ?? new Map<string, ChildProcess>();
  const startPromises =
    globalThis.umkmRuntimeStartPromises ??
    new Map<string, Promise<RuntimeStatus>>();

  globalThis.umkmRuntimeProcesses = processes;
  globalThis.umkmRuntimeStartPromises = startPromises;

  return {
    async getDeploymentStatus(deploymentId) {
      const deployment = await findDeployment(runtimePrisma, deploymentId);

      if (!deployment) {
        return "failed";
      }

      if (deployment.status !== "running" && deployment.status !== "starting") {
        return deployment.status === "failed" ? "failed" : "stopped";
      }

      if (
        deployment.internalUrl &&
        (await isRuntimeReachable(deployment.internalUrl))
      ) {
        return "running";
      }

      await markDeploymentStopped(runtimePrisma, deployment);
      return "stopped";
    },

    async resolveDeploymentTarget(deploymentId) {
      const deployment = await findDeployment(runtimePrisma, deploymentId);

      if (
        deployment?.internalUrl &&
        deployment.status === "running" &&
        (await isRuntimeReachable(deployment.internalUrl))
      ) {
        return deployment.internalUrl;
      }

      return null;
    },

    async startDeployment(deploymentId) {
      const existingStart = startPromises.get(deploymentId);

      if (existingStart) {
        return existingStart;
      }

      const startPromise = startDeploymentOnce(deploymentId).finally(() => {
        startPromises.delete(deploymentId);
      });

      startPromises.set(deploymentId, startPromise);
      return startPromise;
    },

    async stopDeployment(deploymentId) {
      const deployment = await findDeployment(runtimePrisma, deploymentId);

      if (!deployment) {
        return "stopped";
      }

      const child = processes.get(deploymentId);

      if (child) {
        child.kill();
        processes.delete(deploymentId);
      } else {
        killDeploymentPid(deployment.containerName);
      }

      await markDeploymentStopped(runtimePrisma, deployment);
      return "stopped";
    },
  };

  async function startDeploymentOnce(deploymentId: string) {
    const deployment = await findDeployment(runtimePrisma, deploymentId);

    if (!deployment?.build?.artifactRef) {
      if (deployment) {
        await markDeploymentFailed(
          runtimePrisma,
          deployment,
          "Deployment has no build artifact.",
        );
      }

      return "failed";
    }

    if (
      deployment.status === "running" &&
      deployment.internalUrl &&
      (await isRuntimeReachable(deployment.internalUrl))
    ) {
      return "running";
    }

    const runtimeNode = await runtimePrisma.runtimeNode.upsert({
      create: {
        maxContainers: Number(
          process.env.PROJECT_RUNTIME_MAX_CONTAINERS || DEFAULT_MAX_CONTAINERS,
        ),
        name: LOCAL_RUNTIME_NODE_NAME,
        provider: LOCAL_RUNTIME_PROVIDER,
        status: "active",
      },
      update: {
        lastHeartbeatAt: new Date(),
        status: "active",
      },
      where: { name: LOCAL_RUNTIME_NODE_NAME },
    });
    const materializedRoot = path.join(runtimeRootDir, deploymentId, "www");

    await runtimePrisma.projectDeployment.update({
      data: {
        runtimeNodeId: runtimeNode.id,
        status: "starting",
        stoppedAt: null,
      },
      where: { id: deploymentId },
    });

    try {
      await materializeProjectDistArtifact(
        deployment.build.artifactRef,
        materializedRoot,
        { rootDir: artifactRootDir },
      );

      const port = await getAvailablePort();
      const internalUrl = `http://127.0.0.1:${port}`;
      const child = spawnRuntimeProcess(materializedRoot, port);

      processes.set(deploymentId, child);
      child.once("exit", () => {
        processes.delete(deploymentId);
      });

      if (!(await waitForRuntime(internalUrl))) {
        child.kill();
        throw new Error("Runtime process did not become reachable.");
      }

      await runtimePrisma.projectDeployment.update({
        data: {
          containerName: `local-process:${child.pid ?? "unknown"}`,
          internalUrl,
          runtimeNodeId: runtimeNode.id,
          startedAt: new Date(),
          status: "running",
          stoppedAt: null,
        },
        where: { id: deploymentId },
      });
      await runtimePrisma.runtimeEvent.create({
        data: createRuntimeEventData({
          deploymentId,
          message: "Local process runtime started.",
          projectId: deployment.projectId,
          runtimeNodeId: runtimeNode.id,
          type: "deployment.started",
        }),
      });

      return "running";
    } catch (error) {
      await markDeploymentFailed(
        runtimePrisma,
        deployment,
        error instanceof Error ? error.message : "Runtime startup failed.",
      );
      return "failed";
    }
  }
}

let runtimeSupervisor: RuntimeSupervisor | null = null;

export function getRuntimeSupervisor() {
  if (!runtimeSupervisor) {
    runtimeSupervisor =
      process.env.PROJECT_RUNTIME_SUPERVISOR === "noop"
        ? createNoopRuntimeSupervisor()
        : createLocalProcessRuntimeSupervisor();
  }

  return runtimeSupervisor;
}

async function findDeployment(
  runtimePrisma: RuntimeSupervisorPrisma,
  deploymentId: string,
) {
  return await runtimePrisma.projectDeployment.findUnique({
    select: {
      build: { select: { artifactRef: true } },
      containerName: true,
      id: true,
      internalUrl: true,
      projectId: true,
      runtimeNodeId: true,
      status: true,
    },
    where: { id: deploymentId },
  });
}

async function markDeploymentStopped(
  runtimePrisma: RuntimeSupervisorPrisma,
  deployment: RuntimeDeploymentRecord,
) {
  await runtimePrisma.projectDeployment.update({
    data: {
      containerName: null,
      internalUrl: null,
      status: "stopped",
      stoppedAt: new Date(),
    },
    where: { id: deployment.id },
  });
  await runtimePrisma.runtimeEvent.create({
    data: createRuntimeEventData({
      deploymentId: deployment.id,
      message: "Runtime deployment stopped.",
      projectId: deployment.projectId,
      runtimeNodeId: deployment.runtimeNodeId,
      type: "deployment.stopped",
    }),
  });
}

async function markDeploymentFailed(
  runtimePrisma: RuntimeSupervisorPrisma,
  deployment: RuntimeDeploymentRecord,
  message: string,
) {
  await runtimePrisma.projectDeployment.update({
    data: {
      containerName: null,
      internalUrl: null,
      status: "failed",
      stoppedAt: new Date(),
    },
    where: { id: deployment.id },
  });
  await runtimePrisma.runtimeEvent.create({
    data: createRuntimeEventData({
      deploymentId: deployment.id,
      message,
      projectId: deployment.projectId,
      runtimeNodeId: deployment.runtimeNodeId,
      type: "deployment.failed",
    }),
  });
}

function spawnRuntimeProcess(root: string, port: number) {
  const child = spawn(
    process.execPath,
    [
      path.join(process.cwd(), "scripts", "runtime-static-server.mjs"),
      "--root",
      root,
      "--port",
      String(port),
    ],
    {
      detached: true,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );

  child.unref();
  return child;
}

async function getAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }

        reject(new Error("Could not allocate a runtime port."));
      });
    });
  });
}

async function waitForRuntime(internalUrl: string) {
  const deadline = Date.now() + RUNTIME_START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await isRuntimeReachable(internalUrl)) {
      return true;
    }

    await delay(120);
  }

  return false;
}

async function isRuntimeReachable(internalUrl: string) {
  try {
    const response = await fetch(internalUrl, { cache: "no-store" });
    return response.status < 500;
  } catch {
    return false;
  }
}

function killDeploymentPid(containerName: string | null) {
  const pid = Number(containerName?.match(/^local-process:(\d+)$/)?.[1]);

  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid);
    } catch {
      // The process may already be gone; the database state is still cleaned up.
    }
  }
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

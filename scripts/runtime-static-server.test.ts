import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

let rootDirectory: string;
let port: number;
let serverProcess: ChildProcess;

beforeEach(async () => {
  rootDirectory = await mkdtemp(
    path.join(os.tmpdir(), "umkm-runtime-static-server-"),
  );
  await mkdir(path.join(rootDirectory, "assets"));
  await mkdir(path.join(rootDirectory, "images"));
  await Promise.all([
    writeFile(path.join(rootDirectory, "index.html"), "home", "utf8"),
    writeFile(path.join(rootDirectory, "assets", "app.js"), "asset", "utf8"),
    writeFile(path.join(rootDirectory, "images", "logo.svg"), "image", "utf8"),
  ]);

  port = await findFreePort();
  serverProcess = spawn(
    "bun",
    [
      fileURLToPath(new URL("./runtime-static-server.ts", import.meta.url)),
      "--root",
      rootDirectory,
      "--port",
      String(port),
    ],
    { cwd: process.cwd(), stdio: "ignore" },
  );
  await waitForServer(serverProcess, port);
});

afterEach(async () => {
  if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
    const exited = once(serverProcess, "exit");
    serverProcess.kill("SIGTERM");
    await Promise.race([exited, delay(1_000)]);
  }
  await rm(rootDirectory, { force: true, recursive: true });
});

describe("runtime static server", () => {
  it("returns 404 for malformed encoded paths", async () => {
    const malformedPath = await fetch(`http://127.0.0.1:${port}/assets/%`);

    expect(malformedPath.status).toBe(404);
  });

  it("serves existing assets, keeps SPA fallback for pages, and 404s missing assets", async () => {
    const validAsset = await fetch(`http://127.0.0.1:${port}/assets/app.js`);
    const validImage = await fetch(`http://127.0.0.1:${port}/images/logo.svg`);
    const missingAsset = await fetch(
      `http://127.0.0.1:${port}/assets/missing.js`,
    );
    const missingImage = await fetch(
      `http://127.0.0.1:${port}/images/missing.svg`,
    );
    const missingPage = await fetch(`http://127.0.0.1:${port}/products`);

    expect(validAsset.status).toBe(200);
    expect(validAsset.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(validImage.status).toBe(200);
    expect(missingAsset.status).toBe(404);
    expect(missingImage.status).toBe(404);
    expect(missingPage.status).toBe(200);
  });
});

async function findFreePort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const address = socket.address();
  if (!address || typeof address === "string") {
    socket.close();
    throw new Error("Could not determine a free TCP port.");
  }
  const freePort = address.port;
  await new Promise<void>((resolve, reject) => {
    socket.close((error) => (error ? reject(error) : resolve()));
  });
  return freePort;
}

async function waitForServer(
  process: ChildProcess,
  serverPort: number,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null || process.signalCode !== null) {
      throw new Error("Runtime static server exited before becoming ready.");
    }
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort}/`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // The child may need a moment to bind its port.
    }
    await delay(50);
  }
  throw new Error("Runtime static server did not become ready.");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

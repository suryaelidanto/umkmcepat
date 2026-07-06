import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const args = new Map();

for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const root = path.resolve(args.get("--root") || ".");
const port = Number(args.get("--port") || 0);
const host = args.get("--host") || "127.0.0.1";

if (!port) {
  throw new Error("runtime-static-server requires --port.");
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
  const filePath = await resolveRequestPath(requestUrl.pathname);

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": getContentType(filePath),
    "Cross-Origin-Resource-Policy": "cross-origin",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(port, host);

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  server.close(() => process.exit(0));
}

async function resolveRequestPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relativePath = decoded.replace(/^\/+/, "") || "index.html";

  if (isUnsafeRelativePath(relativePath)) {
    return null;
  }

  const requestedPath = await resolveFile(relativePath);

  if (requestedPath) {
    return requestedPath;
  }

  return await resolveFile("index.html");
}

async function resolveFile(relativePath) {
  const target = path.resolve(root, relativePath);

  if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
    return null;
  }

  const targetStat = await stat(target).catch(() => null);

  if (targetStat?.isFile()) {
    return target;
  }

  if (targetStat?.isDirectory()) {
    const indexPath = path.join(target, "index.html");
    const indexStat = await stat(indexPath).catch(() => null);

    return indexStat?.isFile() ? indexPath : null;
  }

  return null;
}

function isUnsafeRelativePath(relativePath) {
  return (
    !relativePath ||
    relativePath.includes("\\") ||
    path.isAbsolute(relativePath) ||
    relativePath.split("/").some((part) => part === "..")
  );
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (filePath.endsWith(".ico")) {
    return "image/x-icon";
  }

  return "text/plain; charset=utf-8";
}

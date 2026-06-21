import { spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";

const listenPort = Number(process.env.NINE_ROUTER_LOCAL_PROXY_PORT || 20129);
const targetPort = Number(process.env.NINE_ROUTER_LOCAL_TARGET_PORT || 20130);

function detectWslIp() {
  if (process.platform !== "win32") {
    return null;
  }

  const result = spawnSync("wsl.exe", ["-e", "sh", "-lc", "hostname -I | awk '{print $1}'"], {
    encoding: "utf8",
    windowsHide: true,
  });

  return result.stdout.trim() || null;
}

function targetHosts() {
  const configured = process.env.NINE_ROUTER_LOCAL_TARGET_HOST;
  const hosts = [configured, "127.0.0.1", detectWslIp()].filter(Boolean);
  return [...new Set(hosts)];
}

function proxyHttp(req, res, hosts, index = 0) {
  const host = hosts[index];
  if (!host) {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("9Router is not reachable. Start it with: docker compose --profile ai up -d 9router\n");
    return;
  }

  const upstream = http.request(
    { host, port: targetPort, method: req.method, path: req.url, headers: req.headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", () => proxyHttp(req, res, hosts, index + 1));
  req.pipe(upstream);
}

function proxyUpgrade(req, socket, head, hosts, index = 0) {
  const host = hosts[index];
  if (!host) {
    socket.destroy();
    return;
  }

  const upstream = net.connect(targetPort, host, () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (const [key, value] of Object.entries(req.headers)) {
      upstream.write(`${key}: ${value}\r\n`);
    }
    upstream.write("\r\n");
    upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", () => proxyUpgrade(req, socket, head, hosts, index + 1));
}

const server = http.createServer((req, res) => {
  proxyHttp(req, res, targetHosts());
});

server.on("upgrade", (req, socket, head) => {
  proxyUpgrade(req, socket, head, targetHosts());
});

server.listen(listenPort, () => {
  console.warn(`9Router local proxy ready: http://localhost:${listenPort}`);
});

import { spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";

const listenPort = 20129;
const targetPort = 20130;

function targetHost() {
  const result = spawnSync("wsl.exe", ["-e", "sh", "-lc", "hostname -I | awk '{print $1}'"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const ip = result.stdout.trim();
  if (!ip) {
    throw new Error("WSL IP unavailable");
  }
  return ip;
}

const server = http.createServer((req, res) => {
  let host;
  try {
    host = targetHost();
  } catch {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("WSL is not reachable.\n");
    return;
  }

  const upstream = http.request(
    { host, port: targetPort, method: req.method, path: req.url, headers: req.headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("9Router is not reachable. Start it with: docker compose --profile ai up -d 9router\n");
  });

  req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
  let host;
  try {
    host = targetHost();
  } catch {
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

  upstream.on("error", () => socket.destroy());
});

server.listen(listenPort, () => {
  console.warn(`9Router local proxy ready: http://localhost:${listenPort}`);
});

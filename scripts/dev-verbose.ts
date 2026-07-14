import { spawn } from "node:child_process";

const child = spawn("bunx", ["vite", "dev", "--port", "3000"], {
  env: { ...process.env, UMKM_VERBOSE_DEV: "1" },
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

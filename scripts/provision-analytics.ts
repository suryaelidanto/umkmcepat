/* eslint-disable no-console */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env");
const USERNAME = "admin";
const WEBSITE_NAME = "UMKM Cepat";

async function main() {
  const base = process.env.UMAMI_BASE_URL || "http://localhost:3001";
  const prod = process.env.NODE_ENV === "production";
  let password = process.env.UMAMI_ADMIN_PASSWORD;

  if (!password) {
    if (prod) {
      console.error(
        "UMAMI_ADMIN_PASSWORD is required in production. Set it in .env.",
      );
      process.exit(1);
    }
    console.warn("⚠ UMAMI_ADMIN_PASSWORD empty — using dev default 'umami'.");
    password = "umami";
  }

  const domain = process.env.GENERATED_PUBLIC_ORIGIN || "localhost";

  // --- Phase B: provision (idempotent, REST only, Bearer token) ---

  // Login → 200 {token, user} means admin exists. 401 = wrong password (NOT
  // "admin missing" — Umami 3.2.0 has no anonymous setup endpoint; admin is
  // seeded by the postgres init SQL at first boot). Exit on 401, don't fall back.
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password }),
  });
  if (loginRes.status === 401) {
    console.error(
      `Login failed (401): wrong username/password. If the dev admin was created with a different password, set UMAMI_ADMIN_PASSWORD in .env to match. Umami 3.2.0 has no setup endpoint to reset it via this script — reset via the Umami DB directly.`,
    );
    process.exit(1);
  }
  if (!loginRes.ok) {
    console.error(
      `Login failed (${loginRes.status}): ${await loginRes.text()}`,
    );
    process.exit(1);
  }
  const loginBody = (await loginRes.json()) as { token: string };
  if (!loginBody.token) {
    console.error("Login response had no token field.");
    process.exit(1);
  }
  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${loginBody.token}`,
  };

  // List websites → 200 {data:[...], count, ...}. Unwrap .data. Find by name.
  const listRes = await fetch(`${base}/api/websites`, { headers: authHeaders });
  if (!listRes.ok) {
    console.error(
      `List websites failed (${listRes.status}): ${await listRes.text()}`,
    );
    process.exit(1);
  }
  const listBody = (await listRes.json()) as { data?: Website[] };
  const websites = listBody.data ?? [];
  let website = websites.find((w) => w.name === WEBSITE_NAME);

  // Create only if missing → 200 {id, name, domain, ...}.
  if (!website) {
    const createRes = await fetch(`${base}/api/websites`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: WEBSITE_NAME, domain }),
    });
    if (!createRes.ok) {
      console.error(
        `Create website failed (${createRes.status}): ${await createRes.text()}`,
      );
      process.exit(1);
    }
    website = (await createRes.json()) as Website;
  }

  const scriptSrc = `${base}/script.js`;

  // --- Phase C: write .env (idempotent, atomic) ---
  writeEnv({
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: website.id,
    NEXT_PUBLIC_UMAMI_SCRIPT_SRC: scriptSrc,
  });

  console.log(
    `✓ Umami provisioned — websiteId=${website.id}, scriptSrc=${scriptSrc}, .env updated. Restart dev/app to load.`,
  );
}

type Website = { id: string; name: string; domain?: string };

function writeEnv(updates: Record<string, string>) {
  if (!existsSync(ENV_PATH)) {
    console.error(".env not found. Run `cp .env.example .env` first.");
    process.exit(1);
  }
  const original = readFileSync(ENV_PATH, "utf8");
  const lines = original.split("\n");
  const handled = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && updates[match[1]] !== undefined) {
      lines[i] = `${match[1]}="${updates[match[1]]}"`;
      handled.add(match[1]);
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (!handled.has(key)) {
      lines.push(`${key}="${value}"`);
    }
  }
  const tmp = `${ENV_PATH}.tmp`;
  writeFileSync(tmp, lines.join("\n"));
  renameSync(tmp, ENV_PATH);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

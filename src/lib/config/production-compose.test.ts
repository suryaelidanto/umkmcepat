import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const productionCompose = readFileSync("docker-compose.prod.yml", "utf8");
const cloudflaredExample = readFileSync(
  "cloudflared/config.example.yml",
  "utf8",
);

describe("production compose generated site capabilities", () => {
  it("keeps public execution configurable and enabled by default", () => {
    expect(productionCompose).toContain(
      "GENERATED_PUBLIC_EXECUTION_ENABLED: ${GENERATED_PUBLIC_EXECUTION_ENABLED:-true}",
    );
  });

  it("routes the isolated generated-site origin without losing its host", () => {
    expect(cloudflaredExample).toContain("hostname: sites.umkmcepat.com");
    expect(cloudflaredExample).toContain("httpHostHeader: sites.umkmcepat.com");
  });
});

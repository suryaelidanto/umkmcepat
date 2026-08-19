import { createServerFn } from "@tanstack/react-start";

import { isStreamerModeEnabled } from "@/lib/config/config";

export const loadStreamerMode = createServerFn({ method: "GET" }).handler(
  async () => isStreamerModeEnabled(),
);

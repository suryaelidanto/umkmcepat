import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { initSentry } from "@/lib/sentry";

initSentry();

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);

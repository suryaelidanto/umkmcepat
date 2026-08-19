import { Generator, getConfig } from "@tanstack/router-generator";

const config = getConfig(
  {
    disableTypes: false,
    autoCodeSplitting: false,
  },
  process.cwd(),
);
const generator = new Generator({ config, root: process.cwd() });
await generator.run();

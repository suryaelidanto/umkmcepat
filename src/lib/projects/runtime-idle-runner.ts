import { stopIdleProjectDeployments } from "@/lib/projects/runtime-idle";

stopIdleProjectDeployments()
  .then((result) => {
    console.warn(
      `Runtime idle stop checked ${result.checked} deployment(s), stopped ${result.stopped.length}.`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

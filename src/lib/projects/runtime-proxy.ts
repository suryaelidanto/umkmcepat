import {
  getRuntimeSupervisor,
  type RuntimeSupervisor,
} from "@/lib/projects/runtime-supervisor";

type ProxyDeploymentRequestInput = {
  deploymentId: string;
  deploymentStatus: string;
  noindex?: boolean;
  pathSegments: string[];
  request: Request;
  supervisor?: RuntimeSupervisor;
};

export async function proxyDeploymentRequest(
  input: ProxyDeploymentRequestInput,
) {
  const supervisor = input.supervisor ?? getRuntimeSupervisor();
  const status =
    input.deploymentStatus === "running"
      ? await supervisor.getDeploymentStatus(input.deploymentId)
      : await supervisor.startDeployment(input.deploymentId);

  if (status !== "running") {
    return null;
  }

  const target = await supervisor.resolveDeploymentTarget(input.deploymentId);

  if (!target) {
    return null;
  }

  const requestUrl = new URL(input.request.url);
  const runtimeUrl = new URL(
    encodeRuntimePath(input.pathSegments),
    target.endsWith("/") ? target : `${target}/`,
  );

  runtimeUrl.search = requestUrl.search;

  const runtimeResponse = await fetch(runtimeUrl, { cache: "no-store" });
  const headers = new Headers(runtimeResponse.headers);

  if (input.noindex ?? true) {
    headers.set("X-Robots-Tag", "noindex");
  }

  return new Response(runtimeResponse.body, {
    headers,
    status: runtimeResponse.status,
    statusText: runtimeResponse.statusText,
  });
}

function encodeRuntimePath(pathSegments: string[]) {
  return pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
}

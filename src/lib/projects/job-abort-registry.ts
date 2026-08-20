const controllers = new Map<string, AbortController>();

export function registerJobAbort(jobId: string): AbortSignal {
  const existing = controllers.get(jobId);
  if (existing) {
    controllers.delete(jobId);
  }
  const controller = new AbortController();
  controllers.set(jobId, controller);
  return controller.signal;
}

export function abortJob(jobId: string): boolean {
  const controller = controllers.get(jobId);
  if (!controller) {
    return false;
  }
  controller.abort();
  controllers.delete(jobId);
  return true;
}

export function clearJobAbort(jobId: string): void {
  controllers.delete(jobId);
}

export function resetJobAbortRegistryForTests(): void {
  controllers.clear();
}

import { Suspense, lazy, useSyncExternalStore } from "react";

import type { ComponentType } from "react";

const emptySubscribe = () => () => {};

// Returns true only after hydration on the client; false during SSR and the
function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

// Drop-in replacement for next/dynamic(loader, { ssr: false }). Lazily loads a
export function clientOnly<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
) {
  const Lazy = lazy(loader);

  return function ClientOnly(props: P) {
    const hydrated = useHydrated();

    if (!hydrated) {
      return null;
    }

    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}

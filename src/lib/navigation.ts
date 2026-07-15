import {
  useRouterState,
  useRouter as useTanstackRouter,
} from "@tanstack/react-router";

// Compatibility shims for the previous next/navigation client hooks.
// These map the small surface the app actually used onto TanStack Router, and
// degrade gracefully when rendered outside a RouterProvider (e.g. Storybook,
// isolated unit tests) instead of throwing.

export function usePathname(): string {
  try {
    // Prefer the resolved (committed) location over the in-flight target.
    // During project → home transitions, location.pathname can already be "/"
    // while Outlet still paints the previous project page. Chrome that keys
    // layout off the target path will then show header/footer with project chat.
    return useRouterState({
      select: (state) =>
        state.resolvedLocation?.pathname ?? state.location.pathname,
    });
  } catch {
    return "/";
  }
}

/** In-flight destination path (updates immediately on click). */
export function useTargetPathname(): string {
  try {
    return useRouterState({ select: (state) => state.location.pathname });
  } catch {
    return "/";
  }
}

/** True while a route transition still has previous content committed. */
export function useIsRoutePending(): boolean {
  try {
    return useRouterState({
      select: (state) =>
        Boolean(
          state.isLoading ||
          state.isTransitioning ||
          (state.resolvedLocation &&
            state.resolvedLocation.pathname !== state.location.pathname),
        ),
    });
  } catch {
    return false;
  }
}

type PushReplaceOptions = { href: string };

// next/navigation's useRouter exposed push/replace taking a string href.
// TanStack Router's navigate takes { to }. This wrapper preserves call sites
// like router.replace("/verify") and router.push("/projects/new").
export function useRouter() {
  let router: ReturnType<typeof useTanstackRouter> | null = null;
  try {
    router = useTanstackRouter();
  } catch {
    router = null;
  }

  return {
    push: (href: string, _options?: PushReplaceOptions) => {
      void router?.navigate({ to: href });
    },
    replace: (href: string, _options?: PushReplaceOptions) => {
      void router?.navigate({ to: href, replace: true });
    },
    refresh: () => {
      void router?.invalidate();
    },
    back: () => {
      router?.history.back();
    },
    forward: () => {
      router?.history.forward();
    },
  };
}

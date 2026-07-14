import { Link as RouterLink, useRouter } from "@tanstack/react-router";

import type { ComponentProps } from "react";

type RouterLinkProps = ComponentProps<typeof RouterLink>;

// Compatibility wrapper so components can keep the familiar `<Link href="...">`
// API. Maps `href` to TanStack Router's `to`. External/hash/mailto links fall
// back to a plain anchor, as do internal links rendered outside a
// RouterProvider (e.g. Storybook, isolated tests).
export type LinkProps = Omit<RouterLinkProps, "to"> & {
  href: string;
};

function useHasRouter(): boolean {
  try {
    useRouter();
    return true;
  } catch {
    return false;
  }
}

export function Link({ href, ...props }: LinkProps) {
  const hasRouter = useHasRouter();
  const isExternal =
    /^([a-z]+:)?\/\//i.test(href) ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#");

  if (isExternal || !hasRouter) {
    const { children, ...anchorProps } = props as ComponentProps<"a"> & {
      children?: React.ReactNode;
    };
    return (
      <a href={href} {...anchorProps}>
        {children}
      </a>
    );
  }

  return <RouterLink to={href} {...(props as RouterLinkProps)} />;
}

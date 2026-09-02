export type BoundingBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type PopoverPositionResult = {
  left: number;
  placement: "bottom" | "top";
  top: number;
};

export type BreadcrumbItem = {
  level: "section" | "block" | "leaf";
  name: string;
};

const VIEWPORT_MARGIN = 12;
const TARGET_GAP = 8;

export function calculateFloatingPopoverPosition({
  boundingBox,
  containerHeight,
  containerWidth,
  popoverHeight = 240,
  popoverWidth = 340,
}: {
  boundingBox: BoundingBox;
  containerHeight: number;
  containerWidth: number;
  popoverHeight?: number;
  popoverWidth?: number;
}): PopoverPositionResult {
  // Horizontal calculation
  let left = boundingBox.x;
  if (left + popoverWidth > containerWidth - VIEWPORT_MARGIN) {
    left = containerWidth - popoverWidth - VIEWPORT_MARGIN;
  }
  if (left < VIEWPORT_MARGIN) {
    left = VIEWPORT_MARGIN;
  }

  // Vertical calculation with auto-flip
  const spaceBelow = containerHeight - (boundingBox.y + boundingBox.height);
  const spaceAbove = boundingBox.y;

  const shouldFlipAbove =
    spaceBelow < popoverHeight + TARGET_GAP &&
    spaceAbove >= popoverHeight + TARGET_GAP;

  let top: number;
  let placement: "bottom" | "top";

  if (shouldFlipAbove) {
    top = Math.max(VIEWPORT_MARGIN, boundingBox.y - popoverHeight - TARGET_GAP);
    placement = "top";
  } else {
    top = Math.min(
      containerHeight - popoverHeight - VIEWPORT_MARGIN,
      boundingBox.y + boundingBox.height + TARGET_GAP,
    );
    placement = "bottom";
  }

  return {
    left: Math.round(left),
    placement,
    top: Math.round(top),
  };
}

export function formatHierarchyBreadcrumb({
  componentHierarchy = [],
  label,
  tag = "",
}: {
  componentHierarchy?: string[];
  label?: string;
  tag?: string;
}): BreadcrumbItem[] {
  const filtered = componentHierarchy.filter(
    (name) =>
      ![
        "App",
        "Layout",
        "LandingPage",
        "SiteLayout",
        "main",
        "body",
        "Route",
      ].includes(name),
  );

  if (!filtered.length) {
    const rawLabel = (label || tag || "Elemen").split(" — ")[0];
    return [{ level: "leaf", name: rawLabel }];
  }

  return filtered.map((name, index) => {
    let level: BreadcrumbItem["level"] = "block";
    if (index === 0 && filtered.length > 1) {
      level = "section";
    } else if (index === filtered.length - 1) {
      level = "leaf";
    }
    return { level, name };
  });
}

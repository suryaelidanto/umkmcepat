"use client";

import { useInView } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { annotate } from "rough-notation";

import type React from "react";
import type { RoughAnnotation } from "rough-notation/lib/model";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type AnnotationAction =
  | "highlight"
  | "underline"
  | "box"
  | "circle"
  | "strike-through"
  | "crossed-off"
  | "bracket";

export interface HighlighterProps {
  children: React.ReactNode;
  action?: AnnotationAction;
  color?: string;
  strokeWidth?: number;
  animationDuration?: number;
  iterations?: number;
  padding?: number;
  multiline?: boolean;
  isView?: boolean;
  className?: string;
}

export function Highlighter({
  action = "highlight",
  animationDuration = 600,
  children,
  className = "",
  color = "rgba(255, 122, 89, 0.25)",
  isView = true,
  iterations = 2,
  multiline = true,
  padding = 2,
  strokeWidth = 1.5,
}: HighlighterProps) {
  const elementRef = useRef<HTMLSpanElement>(null);

  const isInView = useInView(elementRef, {
    margin: "-10%",
    once: true,
  });

  const shouldShow = !isView || isInView;

  useIsomorphicLayoutEffect(() => {
    const element = elementRef.current;
    let annotation: RoughAnnotation | null = null;
    let resizeObserver: ResizeObserver | null = null;

    if (shouldShow && element && typeof window !== "undefined") {
      const annotationConfig = {
        animationDuration,
        color,
        iterations,
        multiline,
        padding,
        strokeWidth,
        type: action,
      };

      const currentAnnotation = annotate(element, annotationConfig);
      annotation = currentAnnotation;
      currentAnnotation.show();

      resizeObserver = new ResizeObserver(() => {
        currentAnnotation.hide();
        currentAnnotation.show();
      });

      resizeObserver.observe(element);
      if (document.body) {
        resizeObserver.observe(document.body);
      }
    }

    return () => {
      annotation?.remove();
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [
    shouldShow,
    action,
    color,
    strokeWidth,
    animationDuration,
    iterations,
    padding,
    multiline,
  ]);

  return (
    <span
      ref={elementRef}
      className={`relative inline-block bg-transparent ${className}`}
    >
      {children}
    </span>
  );
}

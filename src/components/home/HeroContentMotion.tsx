"use client";

import { motion, useReducedMotion } from "motion/react";

import type React from "react";

export function HeroContentMotion({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-5xl flex-col items-center justify-center text-center"
      initial={reduceMotion ? false : "hidden"}
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: { delayChildren: 0.12, staggerChildren: 0.12 },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function HeroMotionItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={
        reduceMotion
          ? undefined
          : {
              hidden: { opacity: 0, y: 24, filter: "blur(10px)" },
              show: {
                opacity: 1,
                y: 0,
                filter: "blur(0px)",
                transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] },
              },
            }
      }
    >
      {children}
    </motion.div>
  );
}

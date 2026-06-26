"use client";

import { motion, useReducedMotion } from "motion/react";

import type React from "react";

export function ScrollReveal({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={
        reduceMotion ? false : { opacity: 0, y: 36, filter: "blur(8px)" }
      }
      whileInView={
        reduceMotion ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

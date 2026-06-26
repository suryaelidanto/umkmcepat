"use client";

import { motion, useReducedMotion } from "motion/react";

const baseGradient =
  "radial-gradient(circle at 50% 0%, rgba(21,21,21,1) 0%, rgba(21,21,21,0.95) 16%, rgba(33,55,90,0.9) 32%, rgba(71,119,239,0.92) 50%, rgba(236,126,229,0.94) 66%, rgba(255,31,128,0.98) 82%, rgba(255,94,39,1) 100%)";

const shiftedGradient =
  "radial-gradient(circle at 46% 4%, rgba(21,21,21,1) 0%, rgba(21,21,21,0.92) 14%, rgba(40,64,108,0.92) 31%, rgba(92,142,255,0.9) 49%, rgba(224,114,236,0.88) 65%, rgba(255,45,144,0.92) 82%, rgba(255,110,48,0.94) 100%)";

const warmDrift =
  "radial-gradient(ellipse at 24% 76%, rgba(255,31,128,0.32), transparent 34%)";

const coolDrift =
  "radial-gradient(ellipse at 78% 32%, rgba(84,137,255,0.3), transparent 36%)";

export function HeroAuroraBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: baseGradient }} />

      <motion.div
        className="absolute inset-[-6%]"
        initial={false}
        animate={
          reduceMotion
            ? { opacity: 0.18, scale: 1 }
            : {
                opacity: [0.16, 0.42, 0.22, 0.36, 0.16],
                scale: [1.02, 1.075, 1.04, 1.09, 1.02],
                x: ["0%", "2.4%", "-1.4%", "1.8%", "0%"],
                y: ["0%", "-1.6%", "1.8%", "0.6%", "0%"],
              }
        }
        transition={{ duration: 18, ease: "easeInOut", repeat: Infinity }}
        style={{ background: shiftedGradient }}
      />

      <motion.div
        className="absolute inset-[-12%] mix-blend-screen"
        initial={false}
        animate={
          reduceMotion
            ? { opacity: 0.16, scale: 1 }
            : {
                opacity: [0.18, 0.46, 0.24, 0.4, 0.18],
                scale: [1, 1.12, 1.05, 1.14, 1],
                x: ["-3%", "4%", "1.5%", "-4%", "-3%"],
                y: ["2.5%", "-1.8%", "-3.5%", "1.4%", "2.5%"],
              }
        }
        transition={{ duration: 22, ease: "easeInOut", repeat: Infinity }}
        style={{ background: `${warmDrift}, ${coolDrift}` }}
      />

      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={
          reduceMotion ? { opacity: 1 } : { opacity: [1, 0.94, 0.98, 0.95, 1] }
        }
        transition={{ duration: 18, ease: "easeInOut", repeat: Infinity }}
        style={{
          background:
            "radial-gradient(circle at 50% 18%, rgba(10,10,10,0.82) 0%, rgba(10,10,10,0.45) 18%, transparent 42%)",
        }}
      />

      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#151515] to-transparent" />
      <motion.div
        className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#ff5e27] via-[#ff1f80]/70 to-transparent"
        initial={false}
        animate={
          reduceMotion ? { opacity: 1 } : { opacity: [0.92, 1, 0.96, 1, 0.92] }
        }
        transition={{ duration: 20, ease: "easeInOut", repeat: Infinity }}
      />
    </div>
  );
}

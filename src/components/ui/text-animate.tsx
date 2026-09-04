"use client";

import {
  AnimatePresence,
  motion,
  type DOMMotionComponents,
  type MotionProps,
  type Variants,
} from "motion/react";
import { memo } from "react";

import { cn } from "@/lib/utils";

type AnimationType = "text" | "word" | "character" | "line";
type AnimationVariant =
  | "fadeIn"
  | "blurIn"
  | "blurInUp"
  | "blurInDown"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "scaleUp"
  | "scaleDown";

const motionElements = {
  article: motion.article,
  div: motion.div,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  h4: motion.h4,
  h5: motion.h5,
  h6: motion.h6,
  li: motion.li,
  p: motion.p,
  section: motion.section,
  span: motion.span,
} as const;

type MotionElementType = Extract<
  keyof DOMMotionComponents,
  keyof typeof motionElements
>;

export interface TextAnimateProps extends Omit<MotionProps, "children"> {
  children: string;
  className?: string;
  segmentClassName?: string;
  delay?: number;
  duration?: number;
  variants?: Variants;
  as?: MotionElementType;
  by?: AnimationType;
  startOnView?: boolean;
  once?: boolean;
  animation?: AnimationVariant;
  accessible?: boolean;
}

const staggerTimings: Record<AnimationType, number> = {
  character: 0.03,
  line: 0.06,
  text: 0.06,
  word: 0.05,
};

const defaultContainerVariants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      delayChildren: 0,
      staggerChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

const defaultItemVariants: Variants = {
  exit: {
    opacity: 0,
  },
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
  },
};

const defaultItemAnimationVariants: Record<
  AnimationVariant,
  { container: Variants; item: Variants }
> = {
  blurIn: {
    container: defaultContainerVariants,
    item: {
      exit: {
        filter: "blur(10px)",
        opacity: 0,
        transition: { duration: 0.3 },
      },
      hidden: { filter: "blur(10px)", opacity: 0 },
      show: {
        filter: "blur(0px)",
        opacity: 1,
        transition: {
          duration: 0.3,
        },
      },
    },
  },
  blurInDown: {
    container: defaultContainerVariants,
    item: {
      hidden: { filter: "blur(10px)", opacity: 0, y: -20 },
      show: {
        filter: "blur(0px)",
        opacity: 1,
        transition: {
          filter: { duration: 0.3 },
          opacity: { duration: 0.4 },
          y: { duration: 0.3 },
        },
        y: 0,
      },
    },
  },
  blurInUp: {
    container: defaultContainerVariants,
    item: {
      exit: {
        filter: "blur(10px)",
        opacity: 0,
        transition: {
          filter: { duration: 0.3 },
          opacity: { duration: 0.4 },
          y: { duration: 0.3 },
        },
        y: 20,
      },
      hidden: { filter: "blur(10px)", opacity: 0, y: 20 },
      show: {
        filter: "blur(0px)",
        opacity: 1,
        transition: {
          filter: { duration: 0.3 },
          opacity: { duration: 0.4 },
          y: { duration: 0.3 },
        },
        y: 0,
      },
    },
  },
  fadeIn: {
    container: defaultContainerVariants,
    item: {
      exit: {
        opacity: 0,
        transition: { duration: 0.3 },
        y: 20,
      },
      hidden: { opacity: 0, y: 20 },
      show: {
        opacity: 1,
        transition: {
          duration: 0.3,
        },
        y: 0,
      },
    },
  },
  scaleDown: {
    container: defaultContainerVariants,
    item: {
      exit: {
        opacity: 0,
        scale: 1.5,
        transition: { duration: 0.3 },
      },
      hidden: { opacity: 0, scale: 1.5 },
      show: {
        opacity: 1,
        scale: 1,
        transition: {
          damping: 15,
          duration: 0.3,
          scale: {
            damping: 15,
            stiffness: 300,
            type: "spring",
          },
          stiffness: 300,
          type: "spring",
        },
      },
    },
  },
  scaleUp: {
    container: defaultContainerVariants,
    item: {
      exit: {
        opacity: 0,
        scale: 0.5,
        transition: { duration: 0.3 },
      },
      hidden: { opacity: 0, scale: 0.5 },
      show: {
        opacity: 1,
        scale: 1,
        transition: {
          damping: 15,
          duration: 0.3,
          scale: {
            damping: 15,
            stiffness: 300,
            type: "spring",
          },
          stiffness: 300,
          type: "spring",
        },
      },
    },
  },
  slideDown: {
    container: defaultContainerVariants,
    item: {
      exit: {
        opacity: 0,
        transition: { duration: 0.3 },
        y: 20,
      },
      hidden: { opacity: 0, y: -20 },
      show: {
        opacity: 1,
        transition: { duration: 0.3 },
        y: 0,
      },
    },
  },
  slideLeft: {
    container: defaultContainerVariants,
    item: {
      exit: {
        opacity: 0,
        transition: { duration: 0.3 },
        x: -20,
      },
      hidden: { opacity: 0, x: 20 },
      show: {
        opacity: 1,
        transition: { duration: 0.3 },
        x: 0,
      },
    },
  },
  slideRight: {
    container: defaultContainerVariants,
    item: {
      exit: {
        opacity: 0,
        transition: { duration: 0.3 },
        x: 20,
      },
      hidden: { opacity: 0, x: -20 },
      show: {
        opacity: 1,
        transition: { duration: 0.3 },
        x: 0,
      },
    },
  },
  slideUp: {
    container: defaultContainerVariants,
    item: {
      exit: {
        opacity: 0,
        transition: {
          duration: 0.3,
        },
        y: -20,
      },
      hidden: { opacity: 0, y: 20 },
      show: {
        opacity: 1,
        transition: {
          duration: 0.3,
        },
        y: 0,
      },
    },
  },
};

function TextAnimateBase({
  accessible = true,
  animation = "fadeIn",
  as: Component = "p",
  by = "word",
  children,
  className,
  delay = 0,
  duration = 0.3,
  once = false,
  segmentClassName,
  startOnView = true,
  variants,
  ...props
}: TextAnimateProps) {
  const MotionComponent = motionElements[Component];

  let segments: string[] = [];
  switch (by) {
    case "word":
      segments = children.split(/(\s+)/);
      break;
    case "character":
      segments = children.split("");
      break;
    case "line":
      segments = children.split("\n");
      break;
    case "text":
    default:
      segments = [children];
      break;
  }

  const finalVariants = variants
    ? {
        container: {
          exit: {
            opacity: 0,
            transition: {
              staggerChildren: duration / segments.length,
              staggerDirection: -1,
            },
          },
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              delayChildren: delay,
              opacity: { delay, duration: 0.01 },
              staggerChildren: duration / segments.length,
            },
          },
        },
        item: variants,
      }
    : animation
      ? {
          container: {
            ...defaultItemAnimationVariants[animation].container,
            exit: {
              ...defaultItemAnimationVariants[animation].container.exit,
              transition: {
                staggerChildren: duration / segments.length,
                staggerDirection: -1,
              },
            },
            show: {
              ...defaultItemAnimationVariants[animation].container.show,
              transition: {
                delayChildren: delay,
                staggerChildren: duration / segments.length,
              },
            },
          },
          item: defaultItemAnimationVariants[animation].item,
        }
      : { container: defaultContainerVariants, item: defaultItemVariants };

  return (
    <AnimatePresence mode="popLayout">
      <MotionComponent
        variants={finalVariants.container as Variants}
        initial="hidden"
        whileInView={startOnView ? "show" : undefined}
        animate={startOnView ? undefined : "show"}
        exit="exit"
        className={cn("whitespace-pre-wrap", className)}
        viewport={{ once }}
        aria-label={accessible ? children : undefined}
        {...props}
      >
        {accessible && <span className="sr-only">{children}</span>}
        {segments.map((segment, i) => (
          <motion.span
            key={`${by}-${segment}-${i}`}
            variants={finalVariants.item}
            custom={i * staggerTimings[by]}
            className={cn(
              by === "line" ? "block" : "inline-block whitespace-pre",
              by === "character" && "",
              segmentClassName,
            )}
            aria-hidden={accessible ? true : undefined}
          >
            {segment}
          </motion.span>
        ))}
      </MotionComponent>
    </AnimatePresence>
  );
}

export const TextAnimate = memo(TextAnimateBase);

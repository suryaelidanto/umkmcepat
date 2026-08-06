"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import * as React from "react";

// Bottom-anchored sheet for mobile (md:hidden). Slide-up + swipe-to-dismiss.
// Desktop keeps center modals; this is the mobile-native pattern.
export function MobileSheet({
  children,
  onOpenChange,
  open,
  title,
}: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}) {
  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 md:hidden" />
        <DialogPrimitive.Content asChild>
          <motion.div
            animate={{ y: 0 }}
            drag="y"
            dragConstraints={{ bottom: 0, top: 0 }}
            dragElastic={{ bottom: 0.6, top: 0 }}
            exit={{ y: "100%" }}
            initial={{ y: "100%" }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) {
                onOpenChange(false);
              }
            }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-[#151515] p-spacing-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] md:hidden"
            transition={{ damping: 30, stiffness: 320, type: "spring" }}
          >
            <div className="mx-auto mb-spacing-4 h-1.5 w-10 rounded-full bg-surface-warm-white/35" />
            {title ? (
              <DialogPrimitive.Title className="mb-spacing-3 text-sm font-medium">
                {title}
              </DialogPrimitive.Title>
            ) : (
              <DialogPrimitive.Title className="sr-only">
                Sheet
              </DialogPrimitive.Title>
            )}
            {children}
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

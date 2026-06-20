"use client"; // Needs to be a client component for potential event handlers

import { motion } from "framer-motion";
import { Phone } from "lucide-react";

import { Button } from "@/components/ui/button";

interface StickyCTAProps {
  ctaText: string;
  whatsappCTA: boolean;
  whatsappNumber: string | undefined;
  // colorTheme: ColorThemeJson; // REMOVED: No longer needed
}

export function StickyCTA({
  ctaText,
  whatsappCTA,
  whatsappNumber,
}: // colorTheme, // REMOVED
StickyCTAProps) {
  // if (!ctaText) return null; // Don't render if no CTA text

  const handleCTAClick = () => {
    if (whatsappCTA && whatsappNumber) {
      const waLink = `https://wa.me/${whatsappNumber.replace(/\D/g, "")}`;
      window.open(waLink, "_blank");
    }
    // Handle non-WhatsApp CTA later if needed
  };

  return (
    <motion.div
      className="sticky bottom-0 left-0 right-0 z-40 p-4 border-t border-foreground-primary/10 bg-surface-warm-white/95 backdrop-blur supports-[backdrop-filter]:bg-surface-warm-white/60"
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      // Removed inline styles for background and border
    >
      <div className="container mx-auto max-w-4xl flex items-center justify-center">
        {whatsappCTA && whatsappNumber ? (
          <Button
            size="lg"
            className="cursor-pointer w-full max-w-sm lovable-shadow-subtle bg-action-primary text-surface-warm-white hover:bg-action-primary/90"
            onClick={handleCTAClick}
            // Removed inline style, use shadcn classes
          >
            <Phone className="mr-2 h-5 w-5" />
            {ctaText || "Hubungi via WhatsApp"} {/* Fallback text */}
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full max-w-sm lovable-shadow-subtle bg-action-primary text-surface-warm-white hover:bg-action-primary/90"
            // Use default primary button style if not WhatsApp
          >
            {ctaText || "Lihat Penawaran"} {/* Fallback text */}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

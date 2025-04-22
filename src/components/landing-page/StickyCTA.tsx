"use client"; // Needs to be a client component for potential event handlers

import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MessageCircle, Send } from "lucide-react"; // Ganti Phone ke MessageCircle
import type { ColorThemeJson } from "@/lib/ai"; // Import ColorThemeJson

interface StickyCTAProps {
  ctaText?: string;
  whatsappCTA?: boolean;
  whatsappNumber?: string;
  colorTheme: ColorThemeJson; // Tambah colorTheme prop
}

export function StickyCTA({
  ctaText = "Hubungi Kami",
  whatsappCTA = false,
  whatsappNumber,
  colorTheme: theme, // Terima theme
}: StickyCTAProps) {
  const whatsappLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}`
    : "#";

  // Tentukan warna dan ikon berdasarkan whatsappCTA dan theme
  const isWhatsApp = whatsappCTA && whatsappNumber;
  const finalButtonColor = theme.primary;
  const finalButtonTextColor = theme["on-primary"];
  const ButtonIcon = isWhatsApp ? MessageCircle : Send;

  const buttonStyle = {
    backgroundColor: finalButtonColor,
    color: finalButtonTextColor,
  };

  const CTAContent = () => (
    <Button
      style={buttonStyle}
      size="lg"
      className="w-full sm:w-auto text-lg font-semibold shadow-lg hover:opacity-90 hover:scale-[0.98] active:scale-95 transition-all cursor-pointer"
    >
      <ButtonIcon className="mr-2 h-5 w-5" />
      {ctaText}
    </Button>
  );

  // TODO: UX/Styling - Test sticky behavior thoroughly on different devices/browsers.
  // TODO: UX/Styling - Consider desktop CTA placement (e.g., non-sticky at the bottom).
  return (
    <>
      {/* Mobile Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:hidden">
        {whatsappCTA ? (
          <div className="cursor-pointer hover:opacity-95 active:scale-[0.99] transition-all">
            <Link
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={ctaText}
            >
              <CTAContent />
            </Link>
          </div>
        ) : (
          <CTAContent />
        )}
      </div>

      {/* Desktop CTA (Non-Sticky, placed after content) */}
      <div className="mt-16 hidden sm:flex justify-center">
        {whatsappCTA ? (
          <div className="cursor-pointer hover:opacity-95 active:scale-[0.99] transition-all">
            <Link
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={ctaText}
            >
              <CTAContent />
            </Link>
          </div>
        ) : (
          <CTAContent />
        )}
      </div>
    </>
  );
}

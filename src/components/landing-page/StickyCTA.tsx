"use client"; // Needs to be a client component for potential event handlers

import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { MessageCircle, Send } from 'lucide-react'; // Ganti Phone ke MessageCircle

interface StickyCTAProps {
  ctaText?: string;
  primaryColor?: string;
  whatsappCTA?: boolean;
  whatsappNumber?: string;
}

export function StickyCTA({ 
    ctaText = "Hubungi Kami", 
    primaryColor = '#3B82F6', 
    whatsappCTA = false, 
    whatsappNumber 
}: StickyCTAProps) {

    const whatsappLink = whatsappNumber 
        ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}` 
        : '#';

    // Tentukan warna dan ikon berdasarkan whatsappCTA
    const isWhatsApp = whatsappCTA && whatsappNumber;
    const buttonColor = isWhatsApp ? '#25D366' : primaryColor;
    const ButtonIcon = isWhatsApp ? MessageCircle : Send; 

    const buttonStyle = {
        backgroundColor: buttonColor,
        // Pastikan warna teks kontras (opsional, bisa diatur via className)
        // color: isWhatsApp ? 'white' : '#auto-contrast' 
    };

    const CTAContent = () => (
        <Button 
            style={buttonStyle} 
            size="lg" 
            className="cursor-pointer w-full sm:w-auto text-lg font-semibold shadow-lg hover:opacity-90 transition-opacity"
        >
            <ButtonIcon className="mr-2 h-5 w-5"/>
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
                <Link href={whatsappLink} target="_blank" rel="noopener noreferrer" aria-label={ctaText}>
                   <CTAContent />
                </Link>
            ) : (
                 <CTAContent />
            )}
        </div>

        {/* Desktop CTA (Non-Sticky, placed after content) */}
        <div className="mt-16 hidden sm:flex justify-center">
          {whatsappCTA ? (
              <Link href={whatsappLink} target="_blank" rel="noopener noreferrer" aria-label={ctaText}>
                  <CTAContent />
              </Link>
              ) : (
               <CTAContent />
              )}
         </div>
      </>
    );
} 
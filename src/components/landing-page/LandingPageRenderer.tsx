"use client"; // Required for framer-motion

import { Card, CardContent } from "@/components/ui/card";
import { AiGeneratedContent, ColorThemeJson } from "@/lib/ai"; // Keep AiGeneratedContent, maybe remove ColorThemeJson
import { motion } from "framer-motion"; // Import motion
import { CheckCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button"; // Assuming Button uses CSS vars
import Link from "next/link";

interface LandingPageRendererProps {
  data: AiGeneratedContent;
  images?: string[]; // Array of Cloudinary URLs
  namaUsaha: string;
  // colorTheme: ColorThemeJson; // REMOVED: No longer needed
}

export function LandingPageRenderer({
  data,
  namaUsaha,
}: // colorTheme, // REMOVED
LandingPageRendererProps) {
  // Destructure content safely, providing defaults
  const {
    headline = `Selamat Datang di ${namaUsaha}`,
    subheadline = `Temukan penawaran terbaik dari ${namaUsaha}`,
    description = "Kami menyediakan produk/layanan berkualitas untuk Anda.",
    features = [
      "Fitur Unggulan 1",
      "Fitur Unggulan 2",
      "Fitur Unggulan 3",
    ],
    ctaText = "Hubungi Kami",
    whatsappCTA = false,
    whatsappNumber,
    layoutStyle = "standard",
    tone = "friendly",
    font = "Inter", // Assuming Inter corresponds to a CSS class like .font-inter
  } = data || {}; // Handle case where data might be null/undefined

  // TODO: UX/Styling - Review padding, margins, font sizes, line heights for Notion feel.
  // TODO: UX/Styling - Ensure perfect responsiveness on various mobile sizes.
  // TODO: Feature - Implement logic for different `layoutStyle` if needed.

  // Animation Variants (can be customized)
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, ease: "easeOut" },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  // Determine text alignment based on layoutStyle or tone
  const textAlignClass = layoutStyle === 'minimal' ? "text-center" : "text-left";

  // Apply font class - ensure this class exists in your global CSS
  const fontClass = font === 'Poppins' ? "font-poppins" : "font-inter";

  const handleCTAClick = () => {
    if (whatsappCTA && whatsappNumber) {
      const waLink = `https://wa.me/${whatsappNumber.replace(/\D/g, "")}`;
      window.open(waLink, "_blank");
    }
    // Potentially handle non-WhatsApp links here if needed
  };

  return (
    <motion.div
      className={`container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12 md:py-16 ${fontClass}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      // Removed inline style for color
    >
      {/* Header Section */}
      <motion.header className={`${textAlignClass} mb-10 md:mb-14`} variants={itemVariants}>
        <h1
          className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 text-foreground"
          // Use text-foreground, reads from CSS var
        >
          {headline}
        </h1>
        <p
          className="text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-3xl mx-auto"
           // Use text-muted-foreground, reads from CSS var
        >
          {subheadline}
        </p>
      </motion.header>

      {/* Description Section */}
      <motion.section className="mb-12 md:mb-16 text-lg leading-relaxed text-foreground" variants={itemVariants}>
        <p
           // Use text-foreground
        >
          {description}
        </p>
      </motion.section>

      {/* Features Section */}
      {features && features.length > 0 && (
        <motion.section className="mb-12 md:mb-16" variants={itemVariants}>
          <h2 className="text-2xl md:text-3xl font-semibold mb-6 md:mb-8 text-foreground">Fitur Utama</h2>
          <ul className="space-y-4">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start">
                <div className="flex-shrink-0">
                  <Check className="h-6 w-6 text-primary mr-3 mt-1" />
                </div>
                <span className="text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* Call to Action Section */}
      <motion.section className="text-center" variants={itemVariants}>
        {whatsappCTA && whatsappNumber ? (
           <Button
              size="lg"
              className="w-full max-w-xs shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-4"
              onClick={handleCTAClick}
              // Use shadcn classes
            >
              {ctaText || "Hubungi via WhatsApp"}
            </Button>
        ) : (
            <Button
              size="lg"
              className="w-full max-w-xs shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-4"
               // Use shadcn classes
            >
              {ctaText || "Lihat Penawaran"}
            </Button>
        )}
      </motion.section>

    </motion.div>
  );
}

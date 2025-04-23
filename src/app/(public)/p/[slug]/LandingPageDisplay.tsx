"use client";

import { InlineEditText } from "@/components/landing-page/InlineEditText"; // Import InlineEditText
import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import { StickyCTA } from "@/components/landing-page/StickyCTA";
import { Separator } from "@/components/ui/separator";
import type { AiGeneratedContent, ColorThemeJson } from "@/lib/ai"; // Add AiGeneratedContent
import { motion } from "framer-motion";
import {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Link as LinkIcon,
  MapPin,
  Phone,
  Quote,
  Send,
  Twitter,
  Youtube
} from "lucide-react";
import { Session } from "next-auth"; // Import Session type
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation"; // Import for router.refresh
import React, { useState } from "react"; // Import React
import { toast } from "sonner"; // For notifications
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { LandingPageClientContent } from "./LandingPageClientContent";
import { ShareButtons } from "@/components/common/ShareButtons"; // Import ShareButtons

// Type for the fetched page data
type PageData = {
  id: string;
  slug: string;
  namaUsaha: string;
  kategori: string;
  whatsapp: string | null;
  // Update aiContent to include optional titles
  aiContent: AiGeneratedContent & {
      featuresTitle?: string;
      galleryTitle?: string;
      testimonialsTitle?: string;
      contactTitle?: string;
  };
  images: string[] | null;
  userId: string | null;
  isClaimed: boolean;
  tweaksLeft: number;
  testimonials: { name: string; comment: string }[];
  address: string | null;
  socialLinks: { platform: string; url: string }[];
  colorTheme: ColorThemeJson | null;
};

// Define props for the client component
interface LandingPageDisplayProps {
  pageData: PageData;
  session: Session | null; // Use imported Session type
}

// Definisikan tema warna default (sama seperti di API route)
const defaultColorTheme: ColorThemeJson = {
  primary: "hsl(222.2 47.4% 11.2%)",
  "on-primary": "hsl(0 0% 100%)",
  secondary: "hsl(210 40% 96.1%)",
  "on-secondary": "hsl(222.2 47.4% 11.2%)",
  background: "hsl(0 0% 100%)",
  "on-background": "hsl(222.2 47.4% 11.2%)",
  surface: "hsl(0 0% 100%)", // Often same as background or card
  "on-surface": "hsl(222.2 47.4% 11.2%)",
  accent: "hsl(217.2 91.2% 59.8%)",
  muted: "hsl(210 40% 96.1%)",
  border: "hsl(214.3 31.8% 91.4%)",
  success: "hsl(142.1 70.6% 45.3%)", // Example HSL for success
  error: "hsl(0 84.2% 60.2%)", // Example HSL for error
  // Added missing ones for full shadcn compatibility
  card: "hsl(0 0% 100%)",
  "on-card": "hsl(222.2 47.4% 11.2%)",
  popover: "hsl(0 0% 100%)",
  "on-popover": "hsl(222.2 47.4% 11.2%)",
  destructive: "hsl(0 84.2% 60.2%)", // alias for error
  "on-destructive": "hsl(0 0% 100%)", // Added missing property
  input: "hsl(214.3 31.8% 91.4%)", // Use 'input' key
  ring: "hsl(215 20.2% 65.1%)", // focus ring etc.

  // Add missing foreground variants based on convention
  foreground: "hsl(222.2 47.4% 11.2%)", // Same as on-background
  primary_foreground: "hsl(0 0% 100%)", // Same as on-primary
  secondary_foreground: "hsl(222.2 47.4% 11.2%)", // Same as on-secondary
  muted_foreground: "hsl(215.4 16.3% 46.9%)", // Default shadcn muted-foreground
  accent_foreground: "hsl(0 0% 100%)", // Often same as on-primary
  destructive_foreground: "hsl(0 0% 100%)", // Same as on-destructive
  card_foreground: "hsl(222.2 47.4% 11.2%)", // Same as on-card
  popover_foreground: "hsl(222.2 47.4% 11.2%)", // Same as on-popover

  // Optional (can be omitted or added)
  // "on-success": "hsl(0 0% 100%)",
  // "on-error": "hsl(0 0% 100%)",
};

// Define an extended CSS Properties type to include our theme variables
// We map the keys from ColorThemeJson to their corresponding CSS variable names
type ThemeCSSProperties = React.CSSProperties & {
  [key in
    | `--${keyof ColorThemeJson}`
    | "--foreground"
    | "--primary-foreground"
    | "--secondary-foreground"
    | "--card-foreground"
    | "--popover-foreground"
    | "--muted-foreground"
    | "--accent-foreground"
    | "--destructive-foreground"
    | "--input"
    | "--radius"]?: string; // Added radius as well
};

// Updated helper to generate CSS variable object
const generateThemeStyle = (theme: ColorThemeJson): ThemeCSSProperties => {
  // Use the extended type ThemeCSSProperties here
  const style: ThemeCSSProperties = {};

  // --- Direct Mappings (preferred approach) ---
  style["--background"] = theme.background;
  style["--foreground"] = theme.foreground || theme["on-background"];

  style["--card"] = theme.card || theme.surface;
  style["--card-foreground"] =
    theme.card_foreground || theme["on-card"] || theme["on-surface"];

  style["--popover"] = theme.popover || theme.card || theme.surface;
  style["--popover-foreground"] =
    theme.popover_foreground ||
    theme["on-popover"] ||
    theme["on-card"] ||
    theme["on-surface"];

  style["--primary"] = theme.primary;
  style["--primary-foreground"] =
    theme.primary_foreground || theme["on-primary"];

  style["--secondary"] = theme.secondary;
  style["--secondary-foreground"] =
    theme.secondary_foreground || theme["on-secondary"];

  style["--muted"] = theme.muted;
  style["--muted-foreground"] = theme.muted_foreground; // Assuming muted_foreground is generated

  style["--accent"] = theme.accent;
  style["--accent-foreground"] = theme.accent_foreground || theme["on-primary"]; // Default accent fg often matches on-primary

  style["--destructive"] = theme.destructive || theme.error;
  style["--destructive-foreground"] =
    theme.destructive_foreground ||
    theme["on-destructive"] ||
    theme["on-primary"]; // Default destructive fg often matches on-primary

  style["--border"] = theme.border;
  style["--input"] = theme.input || theme.border; // Input often uses border color
  style["--ring"] = theme.ring;

  // Radius (not part of color theme, keep default or make configurable elsewhere)
  style["--radius"] = "0.5rem"; // Example default radius

  // --- Deprecated Loop (Keeping for reference, but direct mapping above is cleaner) ---
  /*
  for (const key in theme) {
    let cssVarName: keyof ThemeCSSProperties | null = null;
    let cssVarValue = theme[key as keyof ColorThemeJson];

    // Map theme keys to CSS variable names
    switch (key) {
      case 'primary': cssVarName = '--primary'; break;
      case 'on-primary': cssVarName = '--primary-foreground'; break;
      case 'secondary': cssVarName = '--secondary'; break;
      case 'on-secondary': cssVarName = '--secondary-foreground'; break;
      case 'background': cssVarName = '--background'; break;
      case 'on-background': cssVarName = '--foreground'; break;
      case 'surface': cssVarName = '--card'; break; // Map surface to card
      case 'on-surface': cssVarName = '--card-foreground'; break; // Map on-surface to card-foreground
      case 'card': cssVarName = '--card'; break;
      case 'on-card': cssVarName = '--card-foreground'; break;
      case 'popover': cssVarName = '--popover'; break;
      case 'on-popover': cssVarName = '--popover-foreground'; break;
      case 'accent': cssVarName = '--accent'; break;
      case 'muted': cssVarName = '--muted'; break;
      case 'border': cssVarName = '--border'; break;
      case 'success': cssVarName = '--success'; break; // Keep --success if used, otherwise ignore
      case 'error': cssVarName = '--destructive'; break; // Map error to destructive
      case 'destructive': cssVarName = '--destructive'; break;
      case 'on-destructive': cssVarName = '--destructive-foreground'; break;
      case 'input': cssVarName = '--input'; break;
      case 'ring': cssVarName = '--ring'; break;
      case 'foreground': cssVarName = '--foreground'; break;
      case 'primary_foreground': cssVarName = '--primary-foreground'; break;
      case 'secondary_foreground': cssVarName = '--secondary-foreground'; break;
      case 'muted_foreground': cssVarName = '--muted-foreground'; break;
      case 'accent_foreground': cssVarName = '--accent-foreground'; break;
      case 'destructive_foreground': cssVarName = '--destructive-foreground'; break;
      case 'card_foreground': cssVarName = '--card-foreground'; break;
      case 'popover_foreground': cssVarName = '--popover-foreground'; break;
      // Ignore on-success, on-error if not directly mapped
    }

    if (cssVarName && typeof cssVarValue === 'string') {
        // Use bracket notation for dynamic assignment to the extended type
        style[cssVarName as keyof ThemeCSSProperties] = cssVarValue;
    }
  }
  */

  // Ensure critical fallbacks (already handled by direct mapping logic above)
  // if (!style['--background']) style['--background'] = defaultColorTheme.background;
  // if (!style['--foreground']) style['--foreground'] = defaultColorTheme.foreground;
  // ... add more fallbacks if needed, although direct mapping is better

  return style;
};

// Helper function to get icon based on platform (can stay here or be moved)
const SocialIcon = ({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) => {
  switch (platform.toLowerCase()) {
    case "instagram":
      return <Instagram className={className} />;
    case "facebook":
      return <Facebook className={className} />;
    case "tiktok":
      return (
        <svg
          className={className}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 448 512"
        >
          <path
            fill="currentColor"
            d="M448 209.91a210.06 210.06 0 0 1 -122.77 39.25V62.02a210.06 210.06 0 0 1 122.77 39.25zM122.4 184.74a210.36 210.36 0 0 1 -35.12 12.08V1.25A210.52 210.52 0 0 1 122.4 184.74zM122.4 407.49a210.36 210.36 0 0 1 -35.12 12.08V226.5A210.36 210.36 0 0 1 122.4 407.49zM224.49 304.37a210.36 210.36 0 0 1 -102.09 -12.08V197.2a210.36 210.36 0 0 1 102.09 -12.08zm101.86 -122.77a210.36 210.36 0 0 1 12.08 35.12H226.5a210.36 210.36 0 0 1 41.16 -35.12z"
          />
        </svg>
      );
    case "youtube":
      return <Youtube className={className} />;
    case "twitter (x)":
      return <Twitter className={className} />;
    case "linkedin":
      return <Linkedin className={className} />;
    case "website":
      return <Globe className={className} />;
    case "whatsapp":
      return <Phone className={className} />;
    case "telegram":
      return <Send className={className} />;
    default:
      return <LinkIcon className={className} />;
  }
};

export function LandingPageDisplay({
  pageData,
  session,
}: LandingPageDisplayProps) {
  const [openLightbox, setOpenLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  // const queryClient = useQueryClient(); // Initialize query client
  const router = useRouter(); // Initialize router

  // Check if current user is the owner (with safe check for session.user)
  const isLoggedIn = !!session?.user;
  const isOwner = isLoggedIn && session?.user?.id === pageData.userId; // Added optional chaining ?. 

  // --- API Call Handler for Saving Inline Edits (Moved Here) ---
  const handleSaveContent = async (fieldKey: string, newValue: string) => {
    try {
      const response = await fetch(`/api/my-pages/${pageData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldKey, newValue }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Gagal menyimpan perubahan.");
      }
      toast.success("Perubahan disimpan!"); // Show success toast
      router.refresh(); // Refresh server data
      // Optional: Manually update cache if needed for immediate feedback before refresh completes
      // queryClient.invalidateQueries({ queryKey: ['landingPageData', pageData.slug] });
    } catch (error) {
      console.error("Failed to save content:", error);
      toast.error("Gagal menyimpan", { description: error instanceof Error ? error.message : "Kesalahan server" });
      // Re-throw error for InlineEditText to handle its state
      throw error;
    }
  };
  // --- End API Call Handler ---

  const theme = pageData.colorTheme || defaultColorTheme;
  const themeStyle = generateThemeStyle(theme);

  const sectionVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  };

  const testimonials = pageData.testimonials;
  const address = pageData.address;
  const socialLinks = pageData.socialLinks;
  const imagesForLightbox = pageData.images?.map((url) => ({ src: url })) || [];

  // Get section titles from aiContent, with defaults
  const galleryTitle = pageData.aiContent?.galleryTitle || "Galeri";
  const testimonialsTitle = pageData.aiContent?.testimonialsTitle || "Apa Kata Pelanggan Kami?";
  const contactTitle = pageData.aiContent?.contactTitle || "Hubungi Kami";

  // --- Construct Share URL ---
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tokko.online'; // Get base URL
  const pageUrl = `${baseUrl}/p/${pageData.slug}`;
  const pageTitle = pageData.aiContent?.headline || pageData.namaUsaha;

  return (
    <div className="relative overflow-x-hidden" style={themeStyle}>
      {/* Client Content (Claim/Tweak Buttons) */}
      <div className="container mx-auto max-w-4xl px-4 pt-4 sm:px-6 lg:px-8">
        {/* Assuming LandingPageClientContent is okay here */}
        <LandingPageClientContent pageData={pageData} session={session} />
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Ensure only necessary props are passed down */}
        <LandingPageRenderer
          data={pageData.aiContent}
          namaUsaha={pageData.namaUsaha}
          isOwner={isOwner} 
          handleSaveContent={handleSaveContent}
        />

        {/* --- Share Buttons Section --- */}
        <div className="my-10 md:my-12">
          <Separator className="mb-6" />
          <ShareButtons url={pageUrl} title={pageTitle} />
        </div>

        {/* --- Gallery Section --- */}
        {pageData.images && pageData.images.length > 0 && (
          <motion.section
            className="my-16 md:my-20 rounded-lg p-6 md:p-8 shadow-inner bg-card border"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            <InlineEditText
              as="h2"
              initialValue={galleryTitle}
              isOwner={isOwner}
              fieldKey="galleryTitle"
              onSave={handleSaveContent}
              className="text-2xl md:text-3xl font-semibold mb-8 md:mb-10 text-center text-card-foreground"
              inputClassName="text-2xl md:text-3xl font-semibold text-center"
              placeholder="Judul Galeri"
            />
            <div className="flex flex-wrap justify-center gap-4">
              {pageData.images.map((imgUrl, index) => (
                <div
                  key={index}
                  className="relative aspect-[4/3] w-full sm:w-[48%] md:w-[31%] overflow-hidden rounded-lg shadow-md grow-0 shrink-0 cursor-pointer"
                  onClick={() => {
                    setLightboxIndex(index);
                    setOpenLightbox(true);
                  }}
                >
                  <Image
                    src={imgUrl}
                    alt={`${pageData.namaUsaha} - Gambar ${index + 1}`}
                    fill
                    sizes="(max-width: 768px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 hover:scale-105"
                  />
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* --- Testimonials Section --- */}
        {testimonials && testimonials.length > 0 && (
          <motion.section
            className="my-16 md:my-20 text-center"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            <InlineEditText
              as="h2"
              initialValue={testimonialsTitle}
              isOwner={isOwner}
              fieldKey="testimonialsTitle"
              onSave={handleSaveContent}
              className="text-2xl lg:text-3xl font-semibold mb-8 text-foreground"
              inputClassName="text-2xl lg:text-3xl font-semibold text-center"
              placeholder="Judul Testimoni"
            />
            <div
              className={`grid grid-cols-1 gap-6 ${
                testimonials.length > 1 ? "md:grid-cols-2" : ""
              }`}
            >
              {testimonials.map((testimonial, index) => (
                <blockquote
                  key={index}
                  className="p-6 md:p-8 rounded-r-lg text-left shadow-lg transition duration-300 hover:shadow-xl bg-card text-card-foreground border-l-4 border-primary"
                >
                  <Quote
                    className="h-5 w-5 mb-2 opacity-80 text-primary"
                    aria-hidden="true"
                  />
                  <p className="italic leading-relaxed mb-3 text-card-foreground">
                    {testimonial.comment}
                  </p>
                  <footer className="text-sm font-medium text-foreground">
                    - {testimonial.name}
                  </footer>
                </blockquote>
              ))}
            </div>
          </motion.section>
        )}

        {/* --- Contact/Location Section --- */}
        {(address || (socialLinks && socialLinks.length > 0)) && (
          <motion.div
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            <Separator
              className="my-16 md:my-20"
              style={{ backgroundColor: theme.border }}
            />
            <section
              className="my-16 md:my-20 text-center rounded-lg p-8 md:p-10 shadow-inner"
              style={{
                backgroundColor: theme.surface,
                border: `1px solid ${theme.border}`,
              }}
            >
              <InlineEditText
                as="h2"
                initialValue={contactTitle}
                isOwner={isOwner}
                fieldKey="contactTitle"
                onSave={handleSaveContent}
                className="text-2xl md:text-3xl font-semibold mb-8 md:mb-10"
                inputClassName="text-2xl md:text-3xl font-semibold text-center"
                placeholder="Judul Kontak"
              />
              <div className="flex flex-col items-center gap-6">
                {address && (
                  <div
                    className="flex items-center gap-3 md:text-lg"
                    style={{ color: theme["on-surface"] }}
                  >
                    <MapPin className="w-5 h-5 flex-shrink-0" />
                    <span>{address}</span>
                  </div>
                )}
                {socialLinks && socialLinks.length > 0 && (
                  <div className="mt-8 flex flex-wrap justify-center gap-4">
                    {socialLinks.map((link, index) => (
                      <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center p-3 rounded-full transition-colors duration-200 bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground"
                        aria-label={`Kunjungi ${link.platform}`}
                      >
                        <SocialIcon
                          platform={link.platform}
                          className="h-5 w-5"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}

        {/* Sticky CTA needs theme */}
        <StickyCTA
          ctaText={pageData.aiContent.ctaText}
          whatsappCTA={pageData.aiContent.whatsappCTA}
          whatsappNumber={pageData.aiContent.whatsappNumber}
        />
      </div>

      {/* --- Watermark Section (Always shows now) --- */}
      <footer className="text-center py-6 border-t border-border mt-16">
        <p className="text-xs text-muted-foreground">
          Dibuat dengan {" "}
          <Link
            href="https://tokko.online"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline text-primary/80"
          >
            tokko.online
          </Link>
        </p>
      </footer>

      {/* Lightbox Component */}
      <Lightbox
        open={openLightbox}
        close={() => setOpenLightbox(false)}
        slides={imagesForLightbox}
        index={lightboxIndex}
      />
    </div>
  );
} 
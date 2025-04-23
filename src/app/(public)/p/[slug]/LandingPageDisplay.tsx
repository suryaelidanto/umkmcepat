"use client";

import { ShareButtons } from "@/components/common/ShareButtons"; // Import ShareButtons
import { InlineEditText } from "@/components/landing-page/InlineEditText"; // Import InlineEditText
import { StickyCTA } from "@/components/landing-page/StickyCTA";
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

// Type for the fetched page data - ** ADJUSTED TO MATCH NEW AI STRUCTURE **
type PageData = {
  id: string;
  slug: string;
  namaUsaha: string;
  kategori: string;
  whatsapp: string | null;
  // Use the revamped AiGeneratedContent structure
  aiContent: AiGeneratedContent | null; // Make it potentially null initially if generated separately
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

// --- MAIN DISPLAY COMPONENT ---
export function LandingPageDisplay({
  pageData: initialPageData,
  session,
}: LandingPageDisplayProps) {
  const router = useRouter();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // --- State for Editable Content ---
  // Initialize state with initial page data
  // ** USE UPDATED STRUCTURE HERE **
  const [pageData] = useState<PageData>(initialPageData);

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

  // Determine ownership
  const isOwner = session?.user?.id === pageData.userId && pageData.isClaimed;

  // --- Theme Application ---
  const theme = pageData.colorTheme || defaultColorTheme;
  const themeStyle = generateThemeStyle(theme);

  // Fallback content
  const aiContent = pageData.aiContent || {
      businessType: 'Other',
      tone: 'professional',
      headline: pageData.namaUsaha || "Selamat Datang",
      subheadline: "Informasi lebih lanjut tentang bisnis kami.",
      heroDescription: "Deskripsi bisnis belum tersedia.",
      sections: [],
      ctaText: pageData.whatsapp ? "Hubungi Kami" : "Pelajari Lebih Lanjut",
      whatsappCTA: !!pageData.whatsapp,
      whatsappNumber: pageData.whatsapp || undefined,
  };

  // --- Prepare Data for Rendering ---
  const { headline, subheadline, heroDescription, sections, ctaText, whatsappCTA, whatsappNumber } = aiContent;
  const images = pageData.images || [];
  const testimonials = pageData.testimonials || [];
  const socialLinks = pageData.socialLinks || [];
  const address = pageData.address;
  const whatsAppLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
    : null;

  // Lightbox setup
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Function to render section content (handles paragraphs and lists)
  const renderSectionContent = (content: string, layoutHint?: string) => {
    if (layoutHint === 'list' || content.startsWith('-')) {
      return (
        <ul className="list-disc space-y-2 pl-5">
          {content.split('\n').map((item, index) => {
            const trimmedItem = item.trim();
            if (trimmedItem.startsWith('-')) {
              return <li key={index}>{trimmedItem.substring(1).trim()}</li>;
            } else if (trimmedItem) {
               return <li key={index}>{trimmedItem}</li>; // Handle lists without leading dash
            }
            return null;
          })}
        </ul>
      );
    }
    // Default to paragraph rendering, replace newlines with breaks
    return content.split('\n').map((paragraph, index, arr) => (
        <React.Fragment key={index}>
            {paragraph}
            {index < arr.length - 1 && <br />}
        </React.Fragment>
    ));
  };

  // --- MAIN JSX STRUCTURE --- Apply themeStyle and refine styling
  return (
    <>
      <main style={themeStyle} className="flex flex-col min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans">
        {/* Added font-sans as a base */}

        {/* --- Hero Section --- Enhanced Spacing & Alignment */}
        <section className="container mx-auto px-6 py-20 md:py-28 text-center flex flex-col items-center">
          {/* Increased padding, centered items */}
          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold mb-5 leading-tight"
             /* ... motion props ... */
          >
            {isOwner ? (
              <InlineEditText fieldKey="headline" initialValue={headline} onSave={handleSaveContent} isOwner={isOwner} />
            ) : (
              headline
            )}
          </motion.h1>
          <motion.p
            className="text-lg md:text-xl text-[var(--muted-foreground)] mb-8 max-w-3xl"
             /* ... motion props ... */
          >
            {isOwner ? (
              <InlineEditText fieldKey="subheadline" initialValue={subheadline} onSave={handleSaveContent} isOwner={isOwner} />
            ) : (
              subheadline
            )}
          </motion.p>
          <motion.div
            className="prose prose-lg dark:prose-invert max-w-2xl mx-auto mb-10 text-center text-[var(--foreground)]"
            /* Changed text alignment, added dark:prose-invert */
             /* ... motion props ... */
          >
            {isOwner ? (
              <InlineEditText fieldKey="heroDescription" initialValue={heroDescription} onSave={handleSaveContent} isOwner={isOwner} />
            ) : (
               // Render basic paragraphs from heroDescription - FIXED SYNTAX
               <>
                {heroDescription.split('\n').map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                ))}
               </>
            )}
          </motion.div>

          {/* CTA Button - Ensure good visibility */}
          {ctaText && (
             <motion.div /* ... motion props ... */ >
                <a
                  href={whatsappCTA && whatsAppLink ? whatsAppLink : '#'}
                  target={whatsappCTA && whatsAppLink ? "_blank" : "_self"}
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-10 py-4 border border-transparent text-lg font-semibold rounded-md shadow-md text-[var(--on-primary)] bg-[var(--primary)] hover:bg-[var(--primary)]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--primary)] transition-all duration-150 ease-in-out"
                  // Enhanced styling: larger padding/text, shadow, focus ring
                >
                  {isOwner ? (
                      <InlineEditText fieldKey="ctaText" initialValue={ctaText} onSave={handleSaveContent} isOwner={isOwner} />
                  ) : (
                      ctaText
                  )}
                  {whatsappCTA && <Send className="ml-2.5 h-5 w-5" />}
                </a>
             </motion.div>
          )}
        </section>

        {/* Render Sections Dynamically - Rewritten Block */}
        <div className="space-y-16 md:space-y-24"> {/* Container for sections */}
          {sections?.map((section, index) => (
            <motion.section
              key={index}
              id={section.title.toLowerCase().replace(/\s+/g, '-')}
              className={`py-16 md:py-20 ${index % 2 === 1 ? 'bg-[hsl(var(--secondary))]' : 'bg-[hsl(var(--background))]'}"`}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 * index }}
            >
              <div className="container mx-auto px-6">
                <h2 className="text-3xl md:text-4xl font-bold text-center mb-10 md:mb-14 text-[var(--foreground)]">
                  {section.title}
                </h2>
                <div className="prose prose-lg lg:prose-xl max-w-none text-[var(--foreground)]">
                  {renderSectionContent(section.content, section.layoutHint)}
                </div>

                {/* Gallery specific logic inside the section map */}
                {section.layoutHint === 'gallery_placeholder' && images.length > 0 && (
                  <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 md:gap-8">
                    {images.map((imgUrl, imgIndex) => (
                      <motion.div
                        key={`gallery-img-${imgIndex}`} // Correct key placement
                        className="relative aspect-video overflow-hidden rounded-lg shadow-lg cursor-pointer group border border-[var(--border)]"
                        onClick={() => openLightbox(imgIndex)}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: imgIndex * 0.1 }}
                      >
                        <Image
                          src={imgUrl}
                          alt={`${pageData.namaUsaha} - Gambar ${imgIndex + 1}`}
                          layout="fill"
                          objectFit="cover"
                          className="group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity duration-300" />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div> {/* Close container */}
            </motion.section> /* Close motion.section */
          ))}
        </div> {/* Close sections container */}

       {/* --- Gallery Section (Fallback) --- Improved Styling */}
        {images.length > 0 && !sections?.some(s => s.layoutHint === 'gallery_placeholder') && (
            <section id="gallery" className="py-16 md:py-20 bg-[var(--muted)]">
                 {/* Removed text color here, rely on foreground */} 
                <div className="container mx-auto px-6">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-14 text-[var(--foreground)]">Galeri</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 md:gap-8">
                    {images.map((imgUrl, index) => (
                        <motion.div
                          key={`gallery-img-${index}`}
                          className="relative aspect-video overflow-hidden rounded-lg shadow-lg cursor-pointer group border border-[var(--border)]"
                          onClick={() => openLightbox(index)}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  <Image
                    src={imgUrl}
                    alt={`${pageData.namaUsaha} - Gambar ${index + 1}`}
                                layout="fill"
                                objectFit="cover"
                                className="group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity duration-300" />
                        </motion.div>
                    ))}
                    </div>
                </div>
            </section>
        )}

        {/* --- Testimonials Section --- Using Card Colors */}
        {testimonials.length > 0 && (
          <section id="testimonials" className="py-16 md:py-20 bg-[var(--background)]">
            <div className="container mx-auto px-6">
              <h2 className="text-3xl md:text-4xl font-bold text-center mb-14 text-[var(--foreground)]">
                 {"Apa Kata Mereka?"}
              </h2>
              {/* Use card colors for testimonials */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                  <motion.div
                  key={index}
                    className="p-8 rounded-lg shadow-lg bg-[var(--card)] text-[var(--on-card)] border border-[var(--border)] flex flex-col"
                    // Increased padding, added flex col
                     /* ... motion props ... */
                  >
                    <Quote className="w-10 h-10 text-[var(--primary)] mb-5 flex-shrink-0" />
                    <p className="italic mb-6 flex-grow">"{testimonial.comment}"</p>
                    <p className="font-semibold text-right">- {testimonial.name}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* --- Contact / Info Section --- Improved Spacing & Styling */}
        {(address || socialLinks.length > 0) && (
            <section id="contact" className="py-16 md:py-20 bg-[var(--secondary)] text-[var(--on-secondary)]">
                <div className="container mx-auto px-6 text-center">
                 <h2 className="text-3xl md:text-4xl font-bold text-center mb-14">
                    {"Hubungi Kami"}
                 </h2>
                 <div className="flex flex-col md:flex-row justify-center items-center gap-x-12 gap-y-6 text-lg">
                    {/* Increased gap */}
                {address && (
                        <div className="flex items-center gap-3">
                            <MapPin className="w-6 h-6 text-[var(--primary)] flex-shrink-0" />
                    <span>{address}</span>
                  </div>
                )}
                    {socialLinks.length > 0 && (
                        <div className="flex items-center flex-wrap justify-center gap-5">
                            {/* Added flex-wrap */}
                            {socialLinks.map((link) => (
                                <a
                                key={link.platform}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                                className="text-[var(--on-secondary)] hover:text-[var(--primary)] transition-colors"
                                title={link.platform}
                      >
                                <SocialIcon platform={link.platform} className="w-7 h-7" /> {/* Increased icon size */}
                      </a>
                    ))}
                  </div>
                )}
                 </div>
              </div>
            </section>
        )}

         {/* --- Footer --- Cleaner look */}
        <footer className="py-10 bg-[var(--muted)] text-[var(--muted-foreground)] border-t border-[var(--border)]">
            {/* Added border top */}
          <div className="container mx-auto px-6 text-center">
             <div className="flex justify-center items-center gap-6 mb-6">
                 {/* Increased gap */}
                <ShareButtons url={typeof window !== 'undefined' ? window.location.href : ''} title={pageData.namaUsaha} />
      </div>
            <p className="text-sm">&copy; {new Date().getFullYear()} {pageData.namaUsaha}. Dibuat dengan Tokko.Online</p>
             <Link href="/" className="text-sm text-[var(--primary)] hover:underline transition-colors">
                Buat halaman Anda sendiri
          </Link>
          </div>
      </footer>

        {/* --- Sticky CTA --- (Logic unchanged, relies on StickyCTA internal styling) */}
         {ctaText && whatsappCTA && whatsappNumber && (
            <StickyCTA ctaText={ctaText} whatsappCTA={whatsappCTA} whatsappNumber={whatsappNumber} />
        )}

      </main>

      {/* --- Lightbox Component --- Correct props */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={images.map((url) => ({ src: url }))}
        index={lightboxIndex}
      />

       {/* --- Owner Toolbar / Edit UI --- Correct props */}
       <LandingPageClientContent
         pageData={pageData}
         session={session}
       />

    </>
  );
} 
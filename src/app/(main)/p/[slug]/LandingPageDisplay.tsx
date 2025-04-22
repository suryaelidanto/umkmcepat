'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import { StickyCTA } from "@/components/landing-page/StickyCTA";
import { LandingPageClientContent } from "./LandingPageClientContent"; // Assuming this is also a client component or compatible
import { AiGeneratedContent } from "@/lib/ai"; // Type import is fine
import { Instagram, Facebook, Linkedin, Youtube, Twitter, Globe, Send, Phone, MapPin, MessageCircle, Quote, Link as LinkIcon, ExternalLink } from "lucide-react";

// Type for the fetched page data (adjust based on getLandingPageData return type)
type PageData = {
  id: string;
  slug: string;
  namaUsaha: string;
  kategori: string;
  whatsapp: string | null;
  aiContent: AiGeneratedContent;
  images: string[] | null;
  userId: string | null;
  isClaimed: boolean;
  tweaksLeft: number;
  testimonials: { name: string; comment: string }[];
  address: string | null;
  socialLinks: { platform: string; url: string }[];
};

// Define props for the client component
interface LandingPageDisplayProps {
  pageData: PageData;
  session: any; // Replace 'any' with your actual session type
}

// Helper function to get icon based on platform (can stay here or be moved)
const SocialIcon = ({ platform, className }: { platform: string, className?: string }) => {
    switch (platform.toLowerCase()) {
    case "instagram": return <Instagram className={className} />;
    case "facebook": return <Facebook className={className} />;
    case "tiktok": return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="M448 209.91a210.06 210.06 0 0 1 -122.77 39.25V62.02a210.06 210.06 0 0 1 122.77 39.25zM122.4 184.74a210.36 210.36 0 0 1 -35.12 12.08V1.25A210.52 210.52 0 0 1 122.4 184.74zM122.4 407.49a210.36 210.36 0 0 1 -35.12 12.08V226.5A210.36 210.36 0 0 1 122.4 407.49zM224.49 304.37a210.36 210.36 0 0 1 -102.09 -12.08V197.2a210.36 210.36 0 0 1 102.09 -12.08zm101.86 -122.77a210.36 210.36 0 0 1 12.08 35.12H226.5a210.36 210.36 0 0 1 41.16 -35.12z"/></svg>;
    case "youtube": return <Youtube className={className} />;
    case "twitter (x)": return <Twitter className={className} />;
    case "linkedin": return <Linkedin className={className} />;
    case "website": return <Globe className={className} />;
    case "whatsapp": return <Phone className={className} />;
    case "telegram": return <Send className={className} />;
    default: return <LinkIcon className={className} />;
  }
};

export function LandingPageDisplay({ pageData, session }: LandingPageDisplayProps) {
  // Lightbox State
  const [openLightbox, setOpenLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Animation Variants
  const sectionVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  };

  // Safely access data passed via props
  const testimonials = pageData.testimonials;
  const address = pageData.address;
  const socialLinks = pageData.socialLinks;
  const imagesForLightbox = pageData.images?.map(url => ({ src: url })) || [];

  return (
    <div className="relative bg-background text-foreground overflow-x-hidden">
      {/* Client Content (Claim/Tweak Buttons) */}
      <div className="container mx-auto max-w-4xl px-4 pt-4 sm:px-6 lg:px-8">
        {/* Assuming LandingPageClientContent is okay here */}
        <LandingPageClientContent pageData={pageData} session={session} />
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Landing Page Renderer (Client Component) */}
        <LandingPageRenderer
          data={pageData.aiContent}
          namaUsaha={pageData.namaUsaha}
        />

        {/* --- Gallery Section --- */}
        {pageData.images && pageData.images.length > 0 && (
          <motion.section
            className="my-16 md:my-20 bg-slate-50 rounded-lg p-6 md:p-8 shadow-inner border border-slate-200/50"
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            <h2 className="text-2xl md:text-3xl font-semibold mb-8 md:mb-10 text-center">Galeri</h2>
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
            <h2 className="text-2xl lg:text-3xl font-semibold mb-8">
              Apa Kata Pelanggan Kami?
            </h2>
            <div className={`grid grid-cols-1 gap-6 ${testimonials.length > 1 ? 'md:grid-cols-2' : ''}`}>
              {testimonials.map((testimonial, index) => (
                <blockquote
                  key={index}
                  className="p-6 md:p-8 bg-white border-l-4 border-primary rounded-r-lg text-left shadow-lg transition duration-300 hover:shadow-xl"
                >
                  <Quote
                    className="h-5 w-5 text-primary mb-2 opacity-80"
                    aria-hidden="true"
                  />
                  <p className="text-muted-foreground italic leading-relaxed mb-3">
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
            <Separator className="my-16 md:my-20" />
            <section className="my-16 md:my-20 text-center bg-slate-50 rounded-lg p-8 md:p-10 shadow-inner border border-slate-200/50">
              <h2 className="text-2xl md:text-3xl font-semibold mb-8 md:mb-10">Hubungi Kami</h2>
              <div className="flex flex-col items-center gap-6">
                {address && (
                  <div className="flex items-center gap-3 text-muted-foreground md:text-lg">
                    <MapPin className="w-5 h-5 flex-shrink-0" />
                    <span>{address}</span>
                  </div>
                )}
                {socialLinks && socialLinks.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
                    {socialLinks.map((link, index) => (
                      <Button key={index} variant="outline" size="sm" asChild>
                        <Link
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={link.platform}
                        >
                          <SocialIcon
                            platform={link.platform}
                            className="w-4 h-4 mr-2"
                          />
                          {link.platform}
                          <ExternalLink className="w-3 h-3 ml-1.5 text-muted-foreground/80" />
                        </Link>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}

        {/* Sticky CTA remains at the bottom of the viewport */}
        <StickyCTA
          ctaText={pageData.aiContent.ctaText}
          primaryColor={pageData.aiContent.primaryColor}
          whatsappCTA={pageData.aiContent.whatsappCTA}
          whatsappNumber={pageData.aiContent.whatsappNumber}
        />
      </div>

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
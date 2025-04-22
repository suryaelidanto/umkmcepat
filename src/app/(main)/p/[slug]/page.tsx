import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import { StickyCTA } from "@/components/landing-page/StickyCTA";
import { AiGeneratedContent } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LandingPageClientContent } from "./LandingPageClientContent";
import { Separator } from "@/components/ui/separator"; // Corrected import path
import {
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  Twitter,
  Globe,
  Send,
  Phone,
  MapPin,
  MessageCircle,
  Quote,
  Link as LinkIcon,
  ExternalLink,
} from "lucide-react"; // Removed Pinterest
import type { Metadata } from "next"; // Keep metadata import
import Image from "next/image"; // Import Next Image for Gallery
import { notFound } from "next/navigation";
import Link from "next/link"; // Import Link
import { Button } from "@/components/ui/button"; // Import Button

// Gunakan tipe standar 'Props'
type Props = {
  params: { slug: string };
  searchParams?: { [key: string]: string | string[] | undefined }; // Jadikan opsional
};

// Revalidate data periodically or on demand if needed
// export const revalidate = 3600; // Revalidate every hour

async function getLandingPageData(slug: string) {
  const landingPage = await prisma.landingPage.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      namaUsaha: true,
      kategori: true,
      whatsapp: true,
      aiContent: true,
      images: true,
      userId: true,
      isClaimed: true,
      tweaksLeft: true,
      // Select new fields
      testimonials: true,
      address: true,
      socialLinks: true,
      // pricingInfo removed
      // Don't select editToken here for security
    },
  });

  if (!landingPage) {
    notFound(); // Return 404 if slug doesn't exist
  }

  // Ensure aiContent is parsed or default
  const aiContent = (landingPage.aiContent ||
    {}) as unknown as AiGeneratedContent;

  // Parse optional JSON fields with type safety
  const testimonials = landingPage.testimonials
    ? (JSON.parse(JSON.stringify(landingPage.testimonials)) as {
        name: string;
        comment: string;
      }[])
    : [];
  const socialLinks = landingPage.socialLinks
    ? (JSON.parse(JSON.stringify(landingPage.socialLinks)) as {
        platform: string;
        url: string;
      }[])
    : [];

  // Add whatsappNumber to aiContent if applicable (needed by renderer/CTA)
  // We need to check the type more carefully here after casting
  if (
    typeof aiContent === "object" &&
    aiContent !== null &&
    aiContent.whatsappCTA &&
    landingPage.whatsapp
  ) {
    aiContent.whatsappNumber = landingPage.whatsapp;
  }

  return {
    ...landingPage,
    aiContent: aiContent, // Return the potentially modified aiContent
    testimonials: testimonials, // Add parsed testimonials
    socialLinks: socialLinks,
  };
}

// type PageData = Awaited<ReturnType<typeof getLandingPageData>>; // Removed manual type

// Helper function to get icon based on platform
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
      ); // Simple TikTok icon
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

export default async function PublicLandingPage({ params }: Props) {
  const { slug } = await params;
  const pageData = await getLandingPageData(slug);
  const session = await auth();

  // Safely access potentially null/undefined fields
  const testimonials = pageData.testimonials;
  const address = pageData.address;
  const socialLinks = pageData.socialLinks;

  return (
    <div className="relative bg-background text-foreground">
      {/* Client Content (Claim/Tweak Buttons) - Moved to top */}
      <div className="container mx-auto max-w-4xl px-4 pt-4 sm:px-6 lg:px-8">
        <LandingPageClientContent pageData={pageData} session={session} />{" "}
        {/* Type now inferred */}
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* --- Hero Section (From AI Renderer) --- */}
        <LandingPageRenderer
          data={pageData.aiContent}
          namaUsaha={pageData.namaUsaha}
        />

        {/* --- Gallery Section --- */}
        {pageData.images && pageData.images.length > 0 && (
          <section className="my-12 md:my-16">
            <h2 className="text-2xl font-semibold mb-6 text-center">Galeri</h2>
            <div className="flex flex-wrap justify-center gap-4">
              {pageData.images.map((imgUrl, index) => (
                <div
                  key={index}
                  className="relative aspect-[4/3] w-full sm:w-[48%] md:w-[31%] overflow-hidden rounded-lg shadow-md grow-0 shrink-0"
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
          </section>
        )}

        <Separator className="my-12 md:my-16" />

        {/* --- Testimonials Section --- */}
        {testimonials && testimonials.length > 0 && (
          <section className="my-12 md:my-16 text-center">
            <h2 className="text-2xl lg:text-3xl font-semibold mb-8">
              Apa Kata Pelanggan Kami?
            </h2>
            <div className={`grid grid-cols-1 gap-6 ${testimonials.length > 1 ? 'md:grid-cols-2' : ''}`}>
              {testimonials.map((testimonial, index) => (
                <blockquote
                  key={index}
                  className="p-6 bg-muted/50 border-l-4 border-primary rounded-r-lg text-left shadow-sm"
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
          </section>
        )}

        {/* --- Contact/Location Section --- */}
        {(address || (socialLinks && socialLinks.length > 0)) && (
          <>
            <Separator className="my-12 md:my-16" />
            <section className="my-12 md:my-16 text-center">
              <h2 className="text-2xl font-semibold mb-8">Hubungi Kami</h2>
              <div className="flex flex-col items-center gap-5">
                {address && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
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
          </>
        )}

        {/* Sticky CTA remains at the bottom of the viewport */}
        <StickyCTA
          ctaText={pageData.aiContent.ctaText}
          primaryColor={pageData.aiContent.primaryColor}
          whatsappCTA={pageData.aiContent.whatsappCTA}
          whatsappNumber={pageData.aiContent.whatsappNumber}
        />
      </div>
    </div>
  );
}

// Optional: Generate Metadata dynamically
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pageData = await getLandingPageData(slug); // Fetch data again for metadata

  // Use the aiContent structured in getLandingPageData
  const aiContent = pageData.aiContent;
  const title = aiContent?.headline || pageData.namaUsaha;
  const description =
    aiContent?.subheadline || `Lihat penawaran dari ${pageData.namaUsaha}`;
  const imageUrl = pageData.images?.[0]; // Use first image for social sharing

  return {
    title: `${title} | tokko.online`,
    description: description,
    openGraph: {
      title: title,
      description: description,
      images: imageUrl ? [{ url: imageUrl }] : [],
      url: `/p/${slug}`, // Canonical URL
      siteName: "tokko.online",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: title,
      description: description,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

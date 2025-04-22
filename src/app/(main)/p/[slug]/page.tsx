import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import { StickyCTA } from "@/components/landing-page/StickyCTA";
import { AiGeneratedContent } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LandingPage } from '@prisma/client'; // Import Prisma type
import { notFound } from "next/navigation";
import { LandingPageClientContent } from "./LandingPageClientContent"; // Client component for interactions

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
      // Don't select editToken here for security
    },
  });

  if (!landingPage) {
    notFound(); // Return 404 if slug doesn't exist
  }

  // Ensure aiContent is parsed or default
  // Cast through unknown for type safety
  const aiContent = (landingPage.aiContent ||
    {}) as unknown as AiGeneratedContent;

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
  };
}

// Infer the type from the function's return value
type PageData = Omit<LandingPage, 'aiContent' | 'editToken'> & {
  aiContent: AiGeneratedContent;
};

export default async function PublicLandingPage({ params }: Props) {
  const { slug } = await params; // Await params before destructuring
  const pageData = await getLandingPageData(slug); // Type is inferred
  const session = await auth(); // Get current user session (if any)

  // No need for assertion here as getLandingPageData handles it
  // const typedAiContent = pageData.aiContent as AiGeneratedContent;

  return (
    <div className="relative">
      <LandingPageClientContent pageData={pageData as PageData} session={session} /> {/* Cast to inferred type */}

      {/* Render the main content */}
      <LandingPageRenderer
        data={pageData.aiContent}
        images={pageData.images}
        namaUsaha={pageData.namaUsaha}
      />

      {/* Render sticky/desktop CTA *after* the main renderer */}
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
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
import type { Metadata } from "next";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; // Await params before destructuring
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

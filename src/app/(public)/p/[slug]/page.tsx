// Impor yang dibutuhkan Server Component
import { notFound } from "next/navigation";

import { AiGeneratedContent } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { LandingPageDisplay } from "./LandingPageDisplay";

import type { ColorThemeJson } from "@/lib/ai";
import type { Metadata } from "next";

// Tipe Props tetap sama
type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Fungsi getLandingPageData tetap sama (dijalankan di server)
async function getLandingPageData(slug: string) {
  const landingPage = await prisma.landingPage.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      businessName: true,
      category: true,
      whatsappNumber: true,
      aiContent: true,
      images: true,
      userId: true,
      isClaimed: true,
      tweaksLeft: true,
      testimonials: true,
      address: true,
      socialLinks: true,
      colorTheme: true,
    },
  });

  if (!landingPage) {
    notFound();
  }

  const aiContent = (landingPage.aiContent ||
    {}) as unknown as AiGeneratedContent;
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

  // Type assertion for colorTheme (safer way)
  const colorThemeTyped = landingPage.colorTheme
    ? (landingPage.colorTheme as unknown as ColorThemeJson)
    : null;

  if (
    typeof aiContent === "object" &&
    aiContent !== null &&
    aiContent.whatsappCTA &&
    landingPage.whatsappNumber
  ) {
    aiContent.whatsappNumber = landingPage.whatsappNumber;
  }

  return {
    ...landingPage,
    aiContent: aiContent,
    testimonials: testimonials,
    socialLinks: socialLinks,
    colorTheme: colorThemeTyped, // Return the correctly typed colorTheme
  };
}

// Komponen Halaman (Server Component)
export default async function PublicLandingPage({ params }: Props) {
  const { slug } = await params;
  // Ambil data di server
  const pageData = await getLandingPageData(slug);
  const session = await auth();

  // Render Client Component dan oper data sebagai props
  return <LandingPageDisplay pageData={pageData} session={session} />;
}

// Fungsi generateMetadata tetap di sini (Server Side)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pageData = await getLandingPageData(slug);

  const aiContent = pageData.aiContent;
  const title = aiContent?.headline || pageData.businessName;
  const description =
    aiContent?.subheadline || `Lihat penawaran dari ${pageData.businessName}`;
  const imageUrl = pageData.images?.[0];

  return {
    title: `${title} | umkmcepat.com`,
    description: description,
    openGraph: {
      title: title,
      description: description,
      images: imageUrl ? [{ url: imageUrl }] : [],
      url: `/p/${slug}`,
      siteName: "umkmcepat.com",
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

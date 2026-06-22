import { Plus_Jakarta_Sans } from "next/font/google";

import { AppProviders } from "@/components/providers/AppProviders";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import type { Metadata } from "next";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

const siteUrl = "https://umkmcepat.com";
const siteDescription =
  "AI Website Builder untuk UMKM. Buat website dan alat digital dari kebutuhan usahamu, cepat, rapi, dan siap dipakai.";

export const metadata: Metadata = {
  title: "UMKM Cepat - AI Website Builder untuk UMKM",
  description: siteDescription,
  openGraph: {
    title: "UMKM Cepat - AI Website Builder untuk UMKM",
    description: siteDescription,
    url: siteUrl,
    siteName: "UMKM Cepat",
    images: [
      {
        url: `${siteUrl}/logo.svg`,
        alt: "Logo UMKM Cepat",
      },
    ],
    locale: "id_ID",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "UMKM Cepat",
  url: siteUrl,
  description: siteDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={cn(
          "min-h-screen bg-surface-warm-white font-sans antialiased",
          plusJakartaSans.variable,
        )}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AppProviders>{children}</AppProviders>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}

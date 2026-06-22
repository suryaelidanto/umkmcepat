import { Plus_Jakarta_Sans } from "next/font/google";

import { AppProviders } from "@/components/providers/AppProviders";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import type { Metadata } from "next";
import "./globals.css";
// import { auth } from "@/lib/auth";
// import QueryProvider from "@/components/providers/QueryProvider";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UMKM Cepat - AI Landing Page Generator untuk UMKM",
  description:
    "Buat landing page promosi instan dengan AI. Mudah, cepat, tanpa login.",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning={true}
        className={cn(
          "min-h-screen bg-surface-warm-white font-sans antialiased",
          plusJakartaSans.variable,
        )}
      >
        {/* REMOVED wrapper div, Header, main wrapper, Footer */}
        <AppProviders>{children}</AppProviders>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}

import { Inter } from "next/font/google";

import { AppProviders } from "@/components/providers/AppProviders";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import type { Metadata } from "next";
import "./globals.css";
// import { auth } from "@/lib/auth";
// import QueryProvider from "@/components/providers/QueryProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "umkmcepat.com - AI Landing Page Generator untuk UMKM",
  description:
    "Buat landing page promosi instan dengan AI. Mudah, cepat, tanpa login.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
          <head>
            <link
              rel="icon"
              href="/logo.svg"
              type="image/svg+xml"
              sizes="any"
            />
          </head>
          <body
            suppressHydrationWarning={true}
            className={cn(
              "min-h-screen bg-background font-sans antialiased",
              inter.variable
            )}
          >
            {/* REMOVED wrapper div, Header, main wrapper, Footer */}
            <AppProviders>{children}</AppProviders>
            <Toaster richColors position="bottom-right" />
          </body>
        </html>
  );
}

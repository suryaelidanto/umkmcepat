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

export const metadata: Metadata = {
  title: "UMKM Cepat - AI Builder untuk UMKM",
  description:
    "Buat website promosi untuk UMKM dari prompt sederhana berbahasa Indonesia.",
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
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={cn(
          "min-h-screen bg-surface-warm-white font-sans antialiased",
          plusJakartaSans.variable,
        )}
      >
        <AppProviders>{children}</AppProviders>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}

import QueryProvider from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Inter } from "next/font/google";
import "./globals.css";
// import { auth } from "@/lib/auth";
// import QueryProvider from "@/components/providers/QueryProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "tokko.online - AI Landing Page Generator untuk UMKM",
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
    <SessionProvider>
      <QueryProvider>
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
            {children} { /* Render children directly */}
            <Toaster richColors position="bottom-right" />
          </body>
        </html>
      </QueryProvider>
    </SessionProvider>
  );
}

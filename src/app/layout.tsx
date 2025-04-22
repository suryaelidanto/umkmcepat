import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Footer } from "@/components/common/Footer";
import { Toaster } from "@/components/ui/sonner";
import QueryProvider from "@/components/providers/QueryProvider";
import { SessionProvider } from "next-auth/react";
import { Header } from '@/components/common/Header';
// import { auth } from "@/lib/auth";
// import QueryProvider from "@/components/providers/QueryProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "tokko.online - AI Landing Page Generator untuk UMKM",
  description: "Buat landing page promosi instan dengan AI. Mudah, cepat, tanpa login.",
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
          <body
            className={cn(
              "min-h-screen bg-background font-sans antialiased",
              inter.variable
            )}
          >
            <div className="relative flex min-h-screen flex-col bg-background">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
            <Toaster richColors position="bottom-right" />
          </body>
        </html>
      </QueryProvider>
    </SessionProvider>
  );
}

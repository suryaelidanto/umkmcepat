"use client"; // Jadikan Client Component

import React from "react";

import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";
// import { usePathname } from 'next/navigation'; // Remove pathname

// Layout untuk grup (main) yang SELALU menyertakan Header dan Footer
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Remove conditional logic
  // const pathname = usePathname();
  // const isPublicLandingPage = pathname.startsWith('/p/');
  // if (isPublicLandingPage) {
  //   return <>{children}</>;
  // }

  // Always render with Header and Footer
  return (
    <div className="relative flex min-h-screen flex-col bg-surface-warm-white">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

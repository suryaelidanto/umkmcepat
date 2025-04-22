import React from "react";
// import { Header } from "@/components/common/Header"; // Optional Header

export default function MainLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* <Header /> */}
      <main className="flex-grow">{children}</main>
    </div>
  );
} 
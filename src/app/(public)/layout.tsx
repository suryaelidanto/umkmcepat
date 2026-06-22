import React from "react";

// Layout untuk grup (public) yang TIDAK menyertakan Header/Footer
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

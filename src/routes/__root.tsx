import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/AppProviders";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import globalCss from "@/styles/globals.css?url";

const siteUrl = "https://umkmcepat.com";
const siteDescription =
  "AI Website Builder untuk UMKM. Buat website dan alat digital dari kebutuhan usahamu, cepat, rapi, dan siap dipakai.";
const siteTitle = "UMKM Cepat - AI Website Builder untuk UMKM";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "UMKM Cepat",
  url: siteUrl,
  description: siteDescription,
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: siteTitle },
      { name: "description", content: siteDescription },
      { property: "og:title", content: siteTitle },
      { property: "og:description", content: siteDescription },
      { property: "og:url", content: siteUrl },
      { property: "og:site_name", content: "UMKM Cepat" },
      { property: "og:image", content: `${siteUrl}/logo.svg` },
      { property: "og:locale", content: "id_ID" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: globalCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
      { rel: "icon", type: "image/svg+xml", href: "/logo.svg" },
      { rel: "shortcut icon", href: "/logo.svg" },
      { rel: "apple-touch-icon", href: "/logo.svg" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-warm-white px-4 text-center">
      <AlertTriangle className="mb-6 size-16 text-yellow-600" />
      <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground-primary sm:text-6xl">
        404 - Halaman tidak ditemukan
      </h1>
      <p className="mt-4 max-w-md text-lg leading-8 text-text-secondary">
        URL salah ketik atau halaman ini sudah tidak tersedia.
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Button asChild size="lg">
          <Link href="/">Kembali ke beranda</Link>
        </Button>
      </div>
    </div>
  );
}

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        suppressHydrationWarning
        className={cn(
          "min-h-screen bg-surface-warm-white font-sans antialiased",
        )}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AppProviders>{children}</AppProviders>
        <Toaster richColors position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}

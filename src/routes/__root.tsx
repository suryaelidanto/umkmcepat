import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRoute,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";

import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/AppProviders";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { Toaster } from "@/components/ui/sonner";
import { getSetting } from "@/lib/config/app-settings";
import { cn } from "@/lib/utils";
import "@/styles/globals.css";

const loadRootConfig = createServerFn({ method: "GET" }).handler(async () => {
  const [defaultTheme, maintenanceMode, maintenanceMessage] = await Promise.all(
    [
      getSetting("feature.default_theme", "dark").catch(() => "dark"),
      getSetting("feature.maintenance_mode", false).catch(() => false),
      getSetting(
        "feature.maintenance_message",
        "Sistem sedang dalam pemeliharaan berkala untuk peningkatan server. Semua data website Anda tetap aman.",
      ).catch(() => "Sistem sedang dalam pemeliharaan berkala."),
    ],
  );
  return {
    defaultTheme: String(defaultTheme),
    maintenanceMode: Boolean(maintenanceMode),
    maintenanceMessage: String(maintenanceMessage),
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
  };
});

const siteUrl = "https://umkmcepat.com";
const siteTitle = "Bikin Website UMKM dalam 5 Menit | UMKM Cepat";
const siteDescription =
  "Tulis infomu, dapatkan website usaha rapi dengan daftar produk, promo, dan tombol pesan WhatsApp. 100% gratis, siap dipakai promosi hari ini.";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      logo: `${siteUrl}/brand/umkmcepat-logo.svg`,
      name: "UMKM Cepat",
      sameAs: ["https://github.com/suryaelidanto/umkmcepat"],
      url: siteUrl,
    },
    {
      "@type": "WebSite",
      description: siteDescription,
      name: "UMKM Cepat",
      potentialAction: {
        "@type": "SearchAction",
        "query-input": "required name=search_term_string",
        target: `${siteUrl}/?q={search_term_string}`,
      },
      url: siteUrl,
    },
    {
      "@type": "SoftwareApplication",
      applicationCategory: "BusinessApplication",
      name: "UMKM Cepat",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "IDR",
      },
      operatingSystem: "Web",
      url: siteUrl,
    },
  ],
};

export const Route = createRootRoute({
  loader: async () => {
    return await loadRootConfig();
  },
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
      { property: "og:image", content: `${siteUrl}/brand/og-preview.svg` },
      { property: "og:locale", content: "id_ID" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Birthstone&family=Manrope:wght@400..800&display=swap",
      },
      { rel: "icon", type: "image/svg+xml", href: "/logo.svg" },
      { rel: "shortcut icon", href: "/logo.svg" },
      { rel: "apple-touch-icon", href: "/logo.svg" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#eceae4] px-4 text-center text-[#1c1c1c] transition-colors duration-200 dark:bg-[#151515] dark:text-surface-warm-white">
      <AlertTriangle className="mb-6 size-16 text-yellow-600" />
      <h1 className="mb-4 text-4xl font-bold tracking-tight text-[#1c1c1c] dark:text-white sm:text-6xl">
        404 - Halaman tidak ditemukan
      </h1>
      <p className="mt-4 max-w-md text-lg leading-8 text-[#5f5f5d] dark:text-gray-300">
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

function isDbUnavailableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    return (
      msg.includes("Can't reach database server") ||
      msg.includes("P1001") ||
      msg.includes("database_unavailable") ||
      msg.includes("ECONNREFUSED")
    );
  }
  return false;
}

function RootError({ error, reset }: { error: Error; reset: () => void }) {
  const isDbDown = isDbUnavailableError(error);
  if (isDbDown) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#eceae4] px-4 text-center text-[#1c1c1c] transition-colors duration-200 dark:bg-[#151515] dark:text-surface-warm-white">
        <AlertTriangle className="mb-6 size-16 text-yellow-600" />
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-[#1c1c1c] dark:text-white sm:text-4xl">
          Layanan sedang pemeliharaan
        </h1>
        <p className="mt-4 max-w-md text-lg leading-8 text-[#5f5f5d] dark:text-gray-300">
          Database sedang tidak tersedia. Coba lagi sebentar atau jalankan{" "}
          <code className="rounded bg-black/10 px-1.5 py-0.5 text-sm text-[#1c1c1c] dark:bg-white/10 dark:text-white">
            bun run infra
          </code>{" "}
          jika di lokal.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Button onClick={() => reset()} size="lg">
            Coba lagi
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Kembali ke beranda</Link>
          </Button>
        </div>
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-6 max-w-md text-xs text-gray-500">
            DB error: {error.message.slice(0, 300)}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#eceae4] px-4 text-center text-[#1c1c1c] transition-colors duration-200 dark:bg-[#151515] dark:text-surface-warm-white">
      <AlertTriangle className="mb-6 size-16 text-red-600" />
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-[#1c1c1c] dark:text-white sm:text-4xl">
        Terjadi kesalahan
      </h1>
      <p className="mt-4 max-w-md text-lg leading-8 text-[#5f5f5d] dark:text-gray-300">
        Maaf, terjadi kesalahan tak terduga. Coba lagi.
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Button onClick={() => reset()} size="lg">
          Coba lagi
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/">Kembali ke beranda</Link>
        </Button>
      </div>
      {process.env.NODE_ENV !== "production" && (
        <pre className="mt-6 max-h-40 max-w-md overflow-auto rounded bg-black/5 p-3 text-left text-xs text-[#1c1c1c] dark:bg-white/10 dark:text-gray-300">
          {error.message}
        </pre>
      )}
    </div>
  );
}

function RootComponent() {
  const router = useRouter();
  const nonce = router.options.ssr?.nonce;
  const loaderData = Route.useLoaderData();
  const defaultTheme = loaderData?.defaultTheme || "dark";
  const maintenanceMode = loaderData?.maintenanceMode || false;
  const maintenanceMessage = loaderData?.maintenanceMessage || "";
  const turnstileSiteKey = loaderData?.turnstileSiteKey || "";

  return (
    <RootDocument
      defaultTheme={defaultTheme}
      maintenanceMode={maintenanceMode}
      maintenanceMessage={maintenanceMessage}
      nonce={nonce}
      turnstileSiteKey={turnstileSiteKey}
    >
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({
  children,
  defaultTheme,
  maintenanceMode = false,
  maintenanceMessage = "",
  nonce,
  turnstileSiteKey = "",
}: Readonly<{
  children: ReactNode;
  defaultTheme: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  nonce?: string;
  turnstileSiteKey?: string;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `!function(){try{var d=document.documentElement,c=d.classList;c.remove('dark','light');var e=localStorage.getItem('theme');var t=e||${JSON.stringify(defaultTheme)};if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}c.add(t);d.style.colorScheme=t;window.__PUBLIC_CONFIG__={NEXT_PUBLIC_TURNSTILE_SITE_KEY:${JSON.stringify(turnstileSiteKey)},turnstileSiteKey:${JSON.stringify(turnstileSiteKey)}};}catch(e){}}();`,
          }}
        />
        <HeadContent />
      </head>
      <body
        suppressHydrationWarning
        className={cn("min-h-screen font-sans antialiased")}
      >
        <script
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {process.env.NEXT_PUBLIC_UMAMI_SCRIPT_SRC &&
        process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ? (
          <script
            nonce={nonce}
            suppressHydrationWarning
            defer
            src={process.env.NEXT_PUBLIC_UMAMI_SCRIPT_SRC}
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          />
        ) : null}
        <AppProviders
          initialTheme={defaultTheme}
          maintenanceMode={maintenanceMode}
          maintenanceMessage={maintenanceMessage}
          turnstileSiteKey={turnstileSiteKey}
        >
          {children}
        </AppProviders>
        <Toaster richColors position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}

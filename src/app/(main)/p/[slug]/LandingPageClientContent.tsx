"use client";

import React, { useState } from "react"; // Removed useEffect as it's no longer needed for token
import { TweakDialog } from "@/components/landing-page/TweakDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Bot, Edit, Info, Loader2, Lock } from "lucide-react";
import { Session } from "next-auth"; // Ensure Session type is imported
import { signIn } from "next-auth/react"; // Ensure signIn is imported
import Link from "next/link";

// Define TPageData based on expected props (simplified version)
interface TPageData {
  slug: string;
  isClaimed: boolean;
  userId?: string | null;
  tweaksLeft?: number | null;
  // Include other fields from pageData if LandingPageClientContent uses them directly
}

// Define props interface
interface LandingPageClientContentProps {
  pageData: TPageData;
  session: Session | null; // Use the imported Session type
}

export function LandingPageClientContent({
  pageData: initialPageData,
  session,
}: LandingPageClientContentProps) {
  const slug = initialPageData.slug;

  const handleClaim = () => {
    // Always trigger Google Sign In
    // Redirect to claim API after login
    signIn("google", { callbackUrl: `/api/landing/${slug}/claim` });
  };

  // Determine user/ownership status
  const isLoggedIn = !!session;
  const isOwner = isLoggedIn && session?.user?.id === initialPageData?.userId;
  const isPageClaimed = initialPageData?.isClaimed ?? false;
  const canTweak = isOwner && (initialPageData?.tweaksLeft ?? 0) > 0;

  return (
    <div className="container mx-auto max-w-4xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className={`mb-6 flex flex-wrap items-center justify-end gap-2`}>
        {!isPageClaimed && (
          <>
            <Alert variant="destructive" className="w-full text-sm mb-2">
              <Info className="h-4 w-4" />
              <AlertTitle>Perhatian!</AlertTitle>
              <AlertDescription>
                Halaman ini belum diklaim dan bisa diedit oleh siapa saja yang
                punya link khusus.
              </AlertDescription>
            </Alert>
            <Button onClick={handleClaim} size="sm">
              <Lock className="mr-2 h-4 w-4" /> Klaim dengan Google
            </Button>
          </>
        )}

        {isPageClaimed && isOwner && (
          <TweakDialog slug={slug} tweaksLeft={initialPageData.tweaksLeft ?? 0}>
            <Button
              variant="outline"
              size="sm"
              disabled={!canTweak}
              aria-label="Tweak Konten"
            >
              <Bot className="mr-2 h-4 w-4" />
              Tweak Konten (Sisa {initialPageData.tweaksLeft}x)
            </Button>
          </TweakDialog>
        )}
      </div>
    </div>
  );
}

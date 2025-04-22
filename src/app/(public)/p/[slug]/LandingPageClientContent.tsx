"use client";

// import { TweakDialog } from "@/components/landing-page/TweakDialog"; // Remove this import
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { /* Bot, */ Info, Lock } from "lucide-react"; // Remove Bot import
import { Session } from "next-auth"; // Ensure Session type is imported
import { signIn } from "next-auth/react"; // Ensure signIn is imported

// Define TPageData based on expected props (simplified version)
interface TPageData {
  slug: string;
  isClaimed: boolean;
  userId?: string | null;
  // tweaksLeft?: number | null; // No longer needed here if button is removed
  // Include other fields from pageData if LandingPageClientContent uses them directly
}

// Define props interface
interface LandingPageClientContentProps {
  pageData: TPageData;
  session: Session | null; // Use the imported Session type
}

export function LandingPageClientContent({
  pageData: initialPageData,
}: LandingPageClientContentProps) {
  const slug = initialPageData.slug;

  const handleClaim = () => {
    // Always trigger Google Sign In
    // Redirect to claim API after login
    signIn("google", { callbackUrl: `/api/landing/${slug}/claim` });
  };

  // Determine user/ownership status
  // const isLoggedIn = !!session;
  const isPageClaimed = initialPageData?.isClaimed ?? false;
  // const canTweak = isOwner && (initialPageData?.tweaksLeft ?? 0) > 0; // No longer needed

  // If the page is claimed and the current user is not the owner,
  // or if the page is not claimed and the user is not logged in,
  // we don't need to render anything here (or render minimal info if desired).
  // For now, let's only render the claim button if applicable.
  if (isPageClaimed) {
    // If claimed, this component currently doesn't render anything specific
    // Later, it might hold owner-specific controls if not handled by inline editing directly
    return null;
  }

  // Render only the claim section if the page is not claimed
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

        {/* {isPageClaimed && isOwner && ( // REMOVE Tweak Dialog Section
          <TweakDialog slug={slug} tweaksLeft={initialPageData.tweaksLeft ?? 0}>
            <Button
              variant="outline"
              size="sm"
              disabled={!canTweak}
              aria-label="Ubah Konten dengan AI"
            >
              <Bot className="mr-2 h-4 w-4" />
              Ubah Konten dengan AI (Sisa {initialPageData.tweaksLeft}x)
            </Button>
          </TweakDialog>
        )} */}
      </div>
    </div>
  );
}

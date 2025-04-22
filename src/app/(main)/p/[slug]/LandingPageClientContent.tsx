"use client";

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Session } from 'next-auth'; // Import Session type
import { LandingPage } from '@prisma/client'; // Import Prisma type
import { AiGeneratedContent } from '@/lib/ai';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lock, Edit, Bot, Info, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { TweakDialog } from '@/components/landing-page/TweakDialog'; // Correct import path

// Define a more specific type for the data passed from server
// Note: aiContent is already parsed in the server component
type PageData = Omit<LandingPage, 'aiContent' | 'editToken'> & {
    aiContent: AiGeneratedContent;
};

interface LandingPageClientContentProps {
    pageData: PageData;
    session: Session | null; // Pass session from server
}

// API fetcher function (example, might not be needed if only mutating)
// const fetchPageData = async (slug: string): Promise<PageData> => {
//   const res = await fetch(`/api/landing/${slug}`); // Assuming a GET endpoint exists
//   if (!res.ok) throw new Error('Failed to fetch page data');
//   return res.json();
// };

// Mutation function for claiming
const claimPage = async (slug: string): Promise<{ message: string }> => {
    const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.message || 'Gagal mengklaim halaman');
    }
    return data;
};

export function LandingPageClientContent({ pageData: initialPageData, session }: LandingPageClientContentProps) {
    const queryClient = useQueryClient();
    const slug = initialPageData.slug;
    const queryKey = ['landingPage', slug];
    const [retrievedEditToken, setRetrievedEditToken] = useState<string | null>(null);

    // Use TanStack Query to manage page data state, initialized from server props
    // This allows client-side updates after mutations (claim, tweak)
    const { data: pageData } = useQuery({
        queryKey: queryKey,
        queryFn: async () => initialPageData, // Provide a minimal queryFn using initial data
        initialData: initialPageData,
        refetchOnWindowFocus: false, // Keep server data initially
        staleTime: Infinity, // Data from server is considered fresh initially
    });

    const claimMutation = useMutation({
        mutationFn: claimPage,
        onSuccess: (data) => {
            toast.success('Berhasil Diklaim!', { description: data.message });
            // Invalidate and refetch the landing page data to reflect the claimed status
            queryClient.invalidateQueries({ queryKey: queryKey });
            // Refetch session potentially? Or just rely on UI update based on pageData
        },
        onError: (error) => {
            toast.error('Gagal Mengklaim', { description: error.message });
        },
    });

    // Attempt to retrieve the edit token from sessionStorage on mount
    useEffect(() => {
        if (!initialPageData.isClaimed && initialPageData.slug) {
            const storedToken = sessionStorage.getItem(`editToken_${initialPageData.slug}`);
            if (storedToken) {
                setRetrievedEditToken(storedToken);
                // Optional: Remove the token after retrieving it?
                // sessionStorage.removeItem(`editToken_${initialPageData.slug}`);
            }
        }
    }, [initialPageData.isClaimed, initialPageData.slug]);

    const handleClaim = async () => {
        if (!session) {
            // If not logged in, initiate Google Sign In
            // Redirect back to this page after successful login (handled by NextAuth default)
            signIn('google');
        } else {
            // If already logged in, proceed with claim mutation
            claimMutation.mutate(slug);
        }
    };

    // Determine user/ownership status
    const isLoggedIn = !!session;
    const isOwner = isLoggedIn && session?.user?.id === pageData?.userId;
    const isPageClaimed = pageData?.isClaimed ?? false;
    const canTweak = isOwner && (pageData?.tweaksLeft ?? 0) > 0;

    // Show loading skeleton or spinner if needed
    // if (isQueryLoading && !pageData) return <div className="container mx-auto p-4">Memuat data halaman...</div>;

    // Display loading state during claim mutation if needed (Button already shows spinner)
    // if (claimMutation.isPending) { ... }

    return (
        <div className="container mx-auto max-w-4xl px-4 pt-4 sm:px-6 lg:px-8">
            {/* Edit/Claim/Tweak Controls */}
            {/* Add opacity change during claim mutation for visual feedback */}
            <div className={`mb-6 flex flex-wrap items-center justify-end gap-2 transition-opacity ${claimMutation.isPending ? 'opacity-70 pointer-events-none' : 'opacity-100'}`}>
                {!isPageClaimed && (
                    <>
                        <Alert variant="destructive" className="w-full text-sm mb-2">
                            <Info className="h-4 w-4" />
                            <AlertTitle>Perhatian!</AlertTitle>
                            <AlertDescription>
                                Halaman ini belum diklaim dan bisa diedit oleh siapa saja yang punya link khusus.
                            </AlertDescription>
                        </Alert>
                        {retrievedEditToken && ( // Only show button if token was retrieved
                            <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="border-dashed border-yellow-600 text-yellow-700 hover:bg-yellow-50"
                            >
                                <Link href={`/edit/${slug}?token=${retrievedEditToken}`}> 
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit via Token
                                </Link>
                            </Button>
                        )}
                        <Button onClick={handleClaim} size="sm" disabled={claimMutation.isPending}>
                            {claimMutation.isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mengklaim...</>
                            ) : (
                                <><Lock className="mr-2 h-4 w-4" /> Klaim Halaman Ini</>
                            )}
                        </Button>
                    </>
                )}

                {isPageClaimed && isOwner && (
                    <TweakDialog slug={slug} tweaksLeft={pageData.tweaksLeft}>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!canTweak} // Disable if tweaksLeft is 0
                            aria-label="Tweak Konten"
                        >
                            <Bot className="mr-2 h-4 w-4" />
                            Tweak Konten (Sisa {pageData.tweaksLeft}x)
                        </Button>
                    </TweakDialog>
                )}
            </div>
        </div>
    );
} 
"use client";

import { TweakDialog } from '@/components/landing-page/TweakDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Check, Edit } from 'lucide-react';
import Link from 'next/link';

interface PageData {
  id: string;
  slug: string;
  userId: string;
  isClaimed: boolean;
  tweaksLeft: number;
}

interface LandingPageClientContentProps {
  pageData: PageData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
}

export function LandingPageClientContent({ pageData, session }: LandingPageClientContentProps) {
  const { id, slug, userId, tweaksLeft } = pageData;
  const isLoggedIn = !!session?.user;
  const isOwner = isLoggedIn && session.user.id === userId;

  const shouldShowControls = isLoggedIn && (!userId || isOwner);

  if (!shouldShowControls) {
    return null;
  }

  const handleClaim = async () => {
    // ... existing handleClaim logic ...
  };

  return (
    <Card className="mb-6 border-dashed border-blue-500 bg-blue-50/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-blue-800">
          {isOwner ? "Panel Pemilik" : "Halaman Belum Diklaim"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-4">
          {isOwner ? (
            <>
              <p className="text-xs text-muted-foreground flex-shrink-0">
                Anda adalah pemilik halaman ini.
              </p>
              <div className="flex-grow flex justify-end gap-2">
                <TweakDialog slug={slug} tweaksLeft={tweaksLeft}>
                  <Button variant="outline" size="sm" disabled={tweaksLeft <= 0}>
                    <Bot className="mr-1.5 h-4 w-4" />
                    Tweak ({tweaksLeft})
                  </Button>
                </TweakDialog>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/my-pages/${id}/edit`}>
                    <Edit className="mr-1.5 h-4 w-4" />
                    Ubah Halaman
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground flex-shrink-0">
                Klaim halaman ini untuk mengedit dan mengelolanya.
              </p>
              <div className="flex-grow flex justify-end">
                <Button onClick={handleClaim} size="sm">
                  <Check className="mr-1.5 h-4 w-4" /> Klaim Halaman
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 
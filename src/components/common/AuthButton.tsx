"use client";

import Image from "next/image";
import { signIn, signOut, useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div
        className="h-9 w-20 rounded-radius-lg bg-surface-warm-white/8"
        aria-hidden="true"
      />
    );
  }

  if (!session?.user) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="rounded-radius-lg border-surface-warm-white/16 bg-surface-warm-white/8 px-spacing-8 text-surface-warm-white hover:bg-surface-warm-white/14 focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515]"
      >
        Masuk
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="flex items-center gap-spacing-4 rounded-full border border-surface-warm-white/16 bg-surface-warm-white/8 px-spacing-4 py-spacing-3 text-sm text-surface-warm-white transition hover:bg-surface-warm-white/14"
      aria-label="Keluar"
    >
      {session.user.image ? (
        <Image
          src={session.user.image}
          alt="Foto profil"
          width={24}
          height={24}
          className="rounded-full"
        />
      ) : (
        <span className="flex size-6 items-center justify-center rounded-full bg-surface-warm-white text-xs font-semibold text-foreground-primary">
          {session.user.name?.[0] || "U"}
        </span>
      )}
      <span className="hidden sm:inline">Keluar</span>
    </button>
  );
}

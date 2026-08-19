"use client";

import { Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";

import { AvatarFrame } from "@/components/ui/avatar-frame";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/auth-client";
import { useRouter } from "@/lib/navigation";
import { fetchJson, useCacheMutation } from "@/lib/query-client";

export function ProfileNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const { update } = useSession();
  const [savedName, setSavedName] = useState(normalizeName(initialName));
  const [name, setName] = useState(normalizeName(initialName));
  const [error, setError] = useState("");
  const normalizedName = normalizeName(name);
  const isChanged = normalizedName !== savedName;

  const saveMutation = useCacheMutation<
    { user: { name?: string | null } },
    { name: string }
  >({
    mutationFn: async (payload) =>
      fetchJson<{ user: { name?: string | null } }>("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    successMessage: "Profil disimpan.",
    errorMessage: "Profil belum berhasil disimpan.",
    onSuccess: async (result) => {
      if (!result.user?.name) {
        setError("Profil belum berhasil disimpan.");
        return;
      }

      const nextName = normalizeName(result.user.name);
      setSavedName(nextName);
      setName(nextName);
      await update({ name: nextName });
      router.refresh();
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Profil belum berhasil disimpan.",
      );
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!normalizedName) {
      setError("Nama tidak boleh kosong.");
      return;
    }

    if (saveMutation.isPending) {
      return;
    }

    saveMutation.mutate({
      name: normalizedName,
    });
  }

  const isSaving = saveMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-spacing-7">
      <div className="flex flex-col gap-spacing-6 sm:flex-row sm:items-center">
        <AvatarFrame
          seed={name}
          className="grid size-20 place-items-center border border-black/10 bg-black/[0.03] text-[#1c1c1c] dark:border-white/10 dark:bg-white/[0.04] dark:text-surface-warm-white"
        />
      </div>

      <div className="border-t border-black/10 pt-spacing-7 dark:border-white/[0.07]">
        <label
          htmlFor="profile-name"
          className="text-sm font-medium text-[#1c1c1c] dark:text-surface-warm-white"
        >
          Nama
        </label>
        <input
          id="profile-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          autoComplete="name"
          className="mt-spacing-3 w-full rounded-lg border border-black/15 bg-transparent px-spacing-5 py-spacing-4 text-base text-[#1c1c1c] outline-none transition placeholder:text-black/30 focus:border-aurora-orange/60 focus:ring-1 focus:ring-aurora-orange/30 dark:border-white/10 dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/34 dark:focus:border-white/30 dark:focus:ring-white/20"
          placeholder="Nama kamu"
        />
      </div>

      {error ? <p className="text-sm text-aurora-rose">{error}</p> : null}

      <div className="flex justify-end border-t border-black/10 pt-spacing-7 dark:border-white/[0.07]">
        <Button
          type="submit"
          disabled={!isChanged || isSaving}
          className="rounded-lg bg-[#1c1c1c] px-spacing-8 text-white hover:bg-[#1c1c1c]/90 disabled:opacity-40 dark:bg-white dark:text-[#141413] dark:hover:bg-white/90"
        >
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Menyimpan...
            </>
          ) : (
            "Simpan profil"
          )}
        </Button>
      </div>
    </form>
  );
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

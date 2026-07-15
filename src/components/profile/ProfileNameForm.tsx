"use client";

import { useMutation } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { AvatarFrame } from "@/components/ui/avatar-frame";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "@/lib/navigation";
import { fetchJson } from "@/lib/query-client";

const PROFILE_IMAGE_MAX_BYTES = 1_000_000;

export function ProfileNameForm({
  initialImage,
  initialName,
}: {
  initialImage: string;
  initialName: string;
}) {
  const router = useRouter();
  const { update } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedName, setSavedName] = useState(normalizeName(initialName));
  const [name, setName] = useState(normalizeName(initialName));
  const [imagePreview, setImagePreview] = useState(initialImage);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [error, setError] = useState("");
  const normalizedName = normalizeName(name);
  const isChanged = normalizedName !== savedName || Boolean(imageDataUrl);
  const initial = normalizedName[0]?.toUpperCase() || "U";

  const saveMutation = useMutation({
    mutationFn: async (payload: { imageDataUrl?: string; name: string }) =>
      fetchJson<{ user: { image?: string | null; name?: string | null } }>(
        "/api/profile",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: async (result) => {
      if (!result.user?.name) {
        setError("Profil belum berhasil disimpan.");
        return;
      }

      const nextName = normalizeName(result.user.name);
      const nextImage = result.user.image || imagePreview;
      setSavedName(nextName);
      setName(nextName);
      setImageDataUrl("");
      setImagePreview(nextImage);
      toast.success("Profil disimpan.");
      await update({ image: nextImage, name: nextName });
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

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");

    if (!file) {
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Foto harus berupa PNG, JPG, atau WebP.");
      return;
    }

    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      setError("Ukuran foto maksimal 1 MB.");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setImageDataUrl(dataUrl);
    setImagePreview(dataUrl);
  }

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
      imageDataUrl: imageDataUrl || undefined,
      name: normalizedName,
    });
  }

  const isSaving = saveMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-spacing-7">
      <div className="flex flex-col gap-spacing-6 sm:flex-row sm:items-center">
        <AvatarFrame
          image={imagePreview}
          initial={initial}
          className="grid size-24 place-items-center border border-surface-warm-white/12 bg-surface-warm-white/8 text-3xl font-semibold text-surface-warm-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-surface-warm-white">
            Foto profil
          </p>
          <div className="mt-spacing-4 flex flex-wrap gap-spacing-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-radius-lg border-surface-warm-white/12 bg-surface-warm-white/8 text-surface-warm-white hover:bg-surface-warm-white/12"
            >
              <Camera className="size-4" />
              Ganti foto
            </Button>
          </div>
          <input
            ref={fileInputRef}
            aria-label="Unggah foto profil"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={handleImageChange}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="profile-name"
          className="text-sm font-medium text-surface-warm-white"
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
          className="mt-spacing-3 w-full rounded-radius-lg border border-surface-warm-white/10 bg-[#1b1b19] px-spacing-6 py-spacing-5 text-base text-surface-warm-white outline-none transition placeholder:text-surface-warm-white/34 focus:border-surface-warm-white/28 focus:ring-2 focus:ring-surface-warm-white/10"
          placeholder="Nama kamu"
        />
      </div>

      {error ? <p className="text-sm text-[#ffb4a6]">{error}</p> : null}

      <div className="flex flex-col-reverse gap-spacing-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="submit"
          disabled={!isChanged || isSaving}
          className="rounded-radius-lg bg-surface-warm-white px-spacing-8 text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-45"
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
}

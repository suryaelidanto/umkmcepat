"use client";

import { Camera, Loader2 } from "lucide-react";
import { ChangeEvent, FormEvent, useRef, useState } from "react";

import { AvatarFrame } from "@/components/ui/avatar-frame";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "@/lib/navigation";
import { fetchJson, useCacheMutation } from "@/lib/query-client";

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

  const saveMutation = useCacheMutation<
    { user: { image?: string | null; name?: string | null } },
    { imageDataUrl?: string; name: string }
  >({
    mutationFn: async (payload) =>
      fetchJson<{ user: { image?: string | null; name?: string | null } }>(
        "/api/profile",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    successMessage: "Profil disimpan.",
    errorMessage: "Profil belum berhasil disimpan.",
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
          className="grid size-20 place-items-center border border-white/10 bg-white/[0.04] text-2xl font-semibold text-surface-warm-white"
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
              className="rounded-md border border-white/14 bg-transparent text-surface-warm-white hover:bg-white/[0.06]"
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

      <div className="border-t border-white/[0.07] pt-spacing-7">
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
          className="mt-spacing-3 w-full rounded-lg border border-white/10 bg-transparent px-spacing-5 py-spacing-4 text-base text-surface-warm-white outline-none transition placeholder:text-surface-warm-white/34 focus:border-white/30 focus:ring-1 focus:ring-white/20"
          placeholder="Nama kamu"
        />
      </div>

      {error ? <p className="text-sm text-[#ffb4a6]">{error}</p> : null}

      <div className="flex justify-end border-t border-white/[0.07] pt-spacing-7">
        <Button
          type="submit"
          disabled={!isChanged || isSaving}
          className="rounded-lg bg-white px-spacing-8 text-[#141413] hover:bg-white/90 disabled:opacity-40"
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

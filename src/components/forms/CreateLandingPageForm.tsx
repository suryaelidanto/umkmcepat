"use client";

import React, { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router
import { landingPageSchema, LandingPageSchema } from '@/lib/zod-schemas';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';
import { toast } from "sonner"; // Use sonner directly
// import { createLandingPageAction } from '@/app/_actions/landingPageActions'; // Example if using Server Action
import Image from 'next/image'; // For image previews

const KATEGORI_OPTIONS = [
  'Makanan & Minuman',
  'Fashion',
  'Jasa Digital',
  'Jasa Kreatif',
  'Kesehatan & Kecantikan',
  'Edukasi',
  'Lainnya'
];

interface CreateLandingPageFormProps {
  // Props to pre-fill form for editing (optional)
  initialData?: Partial<LandingPageSchema>; // Keep it simple, handle images separately
  existingImageUrls?: string[]; // URLs of images already uploaded (for edit mode preview)
  slug?: string; // Needed if editing or updating
  editToken?: string; // Passed from edit page for API verification
  isEditMode?: boolean;
}

export function CreateLandingPageForm({
  initialData = {},
  existingImageUrls = [], // Initialize existingImageUrls
  slug,
  editToken, // Receive editToken
  isEditMode = false,
}: CreateLandingPageFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>(existingImageUrls);

  const form = useForm<LandingPageSchema>({
    resolver: zodResolver(landingPageSchema),
    defaultValues: {
      namaUsaha: initialData.namaUsaha || '',
      kategori: initialData.kategori || undefined,
      kategoriLainnya: initialData.kategoriLainnya || '',
      deskripsi_user: initialData.deskripsi_user || '',
      whatsapp: initialData.whatsapp || '',
      images: undefined, // File input always starts empty
    },
  });

  const selectedKategori = form.watch("kategori");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(files);
      const previews = Array.from(files).map(file => URL.createObjectURL(file));
      setImagePreviews(previews);
      form.setValue('images', files, { shouldValidate: true }); // Update RHF state
    } else {
      setSelectedFiles(null);
      setImagePreviews([]);
      form.setValue('images', undefined, { shouldValidate: true });
    }
  };

  const onSubmit = (data: LandingPageSchema) => {
    // Clear previous toasts if any
    toast.dismiss();

    startTransition(async () => {
      try {
        // Use FormData to send data including files
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
          if (key === 'images') {
            // Append files from state if they exist
            if (selectedFiles) {
              Array.from(selectedFiles).forEach(file => {
                formData.append('images', file);
              });
            }
          } else if (value !== undefined && value !== null && value !== '') {
            formData.append(key, String(value));
          }
        });

        // Add slug and token for edit mode if applicable
        if (isEditMode && slug && editToken) {
          formData.append('slug', slug);
          // Don't append token to FormData, pass via query param
          // formData.append('token', editToken);

          toast.info("Menyimpan perubahan...", { description: "Mohon tunggu sebentar." });

          // Call the PUT API route for updating
          const response = await fetch(`/api/landing/${slug}?token=${editToken}`, {
            method: 'PUT',
            body: formData,
          });

          const result = await response.json();

          if (!response.ok) {
            console.error("API Update Error:", result);
            throw new Error(result.message || `Gagal menyimpan perubahan (${response.status})`);
          }

          // Handle success for update
          toast.success("Sukses!", {
              description: result.message || "Landing page berhasil diperbarui.",
          });
          router.push(`/p/${slug}`); // Redirect to public view
          return; // Exit after successful update

        } else if (!isEditMode) {
          // Call the POST API route for creation
          toast.info("Landing page sedang dibuat...", { description: "AI sedang bekerja... ✨" });
          const response = await fetch('/api/landing', {
            method: 'POST',
            body: formData,
          });

          const result = await response.json();

          if (!response.ok) {
            console.error("API Error:", result);
            throw new Error(result.message || `Gagal membuat landing page (${response.status})`);
          }

          // Handle success for creation
          toast.success("Sukses!", {
              description: result.message || "Landing page berhasil dibuat.",
              action: {
                label: "Lihat Halaman",
                onClick: () => {
                    // Store token before redirecting
                    sessionStorage.setItem(`editToken_${result.slug}`, result.editToken);
                    router.push(`/p/${result.slug}`);
                }
              },
              duration: 8000, // Give user more time to click
          });

          // Store token in sessionStorage immediately as a fallback
          // in case the user doesn't click the toast action
          try {
            sessionStorage.setItem(`editToken_${result.slug}`, result.editToken);
          } catch (e) {
            console.error("Failed to save edit token to sessionStorage:", e);
            // Inform user they need to save the edit link manually?
            // toast.warning("Gagal menyimpan link edit otomatis. Salin link dari sini jika perlu.");
          }

          // Optional: Auto-redirect after a delay
          // setTimeout(() => {
          //    if (window.location.pathname !== `/p/${result.slug}`) {
          //       router.push(`/p/${result.slug}`);
          //    }
          // }, 7500);

          return; // Exit after starting success flow
        }

        // Remove placeholder success for edit mode
        // await new Promise(resolve => setTimeout(resolve, 1500));
        // const resultSlug = slug || "placeholder-slug";
        // toast.success("Sukses!", {
        //     description: `Landing page diperbarui. Mengalihkan...`,
        // });
        // router.push(`/p/${resultSlug}`);

      } catch (error) {
        console.error("Form submission error:", error);
        const errorMessage = error instanceof Error ? error.message : "Terjadi kesalahan saat mengirim data.";
        // TODO: Error Handling - Provide more specific user-friendly messages.
        toast.error("Gagal Membuat Halaman", { description: errorMessage });
      }
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Nama Usaha */}
      <div>
        <Label htmlFor="namaUsaha">Nama Usaha / Toko / Brand</Label>
        <Input
          id="namaUsaha"
          placeholder="Contoh: Kedai Kopi Senja"
          {...form.register("namaUsaha")}
          className="mt-1"
          disabled={isPending}
        />
        {form.formState.errors.namaUsaha && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.namaUsaha.message}</p>
        )}
      </div>

      {/* Kategori */}
      <div>
        <Label htmlFor="kategori">Kategori Usaha</Label>
        <Select
          onValueChange={(value: string) => form.setValue("kategori", value as LandingPageSchema['kategori'], { shouldValidate: true })}
          defaultValue={form.getValues("kategori")}
          disabled={isPending}
        >
          <SelectTrigger id="kategori" className="mt-1">
            <SelectValue placeholder="Pilih kategori" />
          </SelectTrigger>
          <SelectContent>
            {KATEGORI_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.kategori && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.kategori.message}</p>
        )}
      </div>

      {/* Kategori Lainnya (Conditional) */}
      {selectedKategori === 'Lainnya' && (
        <div>
          <Label htmlFor="kategoriLainnya">Nama Kategori Lainnya</Label>
          <Input
            id="kategoriLainnya"
            placeholder="Contoh: Servis Elektronik"
            {...form.register("kategoriLainnya")}
            className="mt-1"
            disabled={isPending}
          />
          {form.formState.errors.kategoriLainnya && (
            <p className="mt-1 text-sm text-red-600">{form.formState.errors.kategoriLainnya.message}</p>
          )}
        </div>
      )}

      {/* Deskripsi User (Opsional) */}
      <div>
        <Label htmlFor="deskripsi_user">Deskripsi Singkat (Opsional)</Label>
        <Textarea
          id="deskripsi_user"
          placeholder="Jelaskan sedikit tentang produk/jasa unggulanmu. Biarkan kosong jika ingin AI yang buatkan sepenuhnya."
          {...form.register("deskripsi_user")}
          className="mt-1"
          rows={4}
          disabled={isPending}
        />
        {form.formState.errors.deskripsi_user && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.deskripsi_user.message}</p>
        )}
      </div>

      {/* Upload Gambar */}
      <div>
        <Label htmlFor="images">Gambar Produk/Jasa (Maks 3, Opsional)</Label>
        <Input
          id="images"
          type="file"
          accept="image/jpeg, image/png, image/webp, image/jpg"
          multiple
          onChange={handleFileChange}
          className="mt-1 file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
          disabled={isPending}
        />
         {/* Image Previews - Show existing or newly selected */}
         {imagePreviews.length > 0 && (
           <div className="mt-2 flex flex-wrap gap-2">
             {imagePreviews.map((src, index) => (
               <div key={index} className="relative h-20 w-20 overflow-hidden rounded border">
                 <Image
                    src={src} // Can be object URL or existing Cloudinary URL
                    alt={`Preview ${index + 1}`}
                    fill
                    style={{ objectFit: 'cover' }}
                    // Only revoke object URLs
                    onLoad={() => { if (src.startsWith('blob:')) URL.revokeObjectURL(src); }}
                  />
               </div>
             ))}
           </div>
         )}
        {form.formState.errors.images && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.images.message}</p>
        )}
      </div>

      {/* Nomor WhatsApp (Opsional) */}
      <div>
        <Label htmlFor="whatsapp">Nomor WhatsApp (Opsional)</Label>
        <Input
          id="whatsapp"
          placeholder="Contoh: 6281234567890"
          {...form.register("whatsapp")}
          className="mt-1"
          type="tel" // Use tel type for better mobile UX
          disabled={isPending}
        />
        {form.formState.errors.whatsapp && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.whatsapp.message}</p>
        )}
      </div>

      {/* Submit Button */}
      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mohon Tunggu...</>
        ) : isEditMode ? (
          'Simpan Perubahan'
        ) : (
          'Buat Landing Page Otomatis Pakai AI ✨'
        )}
      </Button>
    </form>
  );
} 
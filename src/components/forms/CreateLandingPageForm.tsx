"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  landingPageSchema,
  LandingPageSchema,
  SOCIAL_PLATFORMS,
} from "@/lib/zod-schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ListChecks,
  Loader2,
  Palette,
  PlusCircle,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation"; // Use next/navigation for App Router
import React, { useState, useTransition, useRef, useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner"; // Use sonner directly
// import { createLandingPageAction } from '@/app/_actions/landingPageActions'; // Example if using Server Action
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"; // Import Accordion
import { Card, CardContent } from "@/components/ui/card"; // Optional: Use Card for better structure
import { cn } from "@/lib/utils"; // Import cn utility
import Image from "next/image"; // For image previews

// Define type for a single social link item based on Zod schema
// type SocialLinkItem = { platform: typeof SOCIAL_PLATFORMS[number]; url: string }; // Keep commented out for now

const KATEGORI_OPTIONS = [
  "Makanan & Minuman",
  "Fashion",
  "Jasa Digital",
  "Jasa Kreatif",
  "Kesehatan & Kecantikan",
  "Edukasi",
  "Lainnya",
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
  const [imagePreviews, setImagePreviews] =
    useState<string[]>(existingImageUrls);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isGeneratingColors, setIsGeneratingColors] = useState(false);
  const [generatedPrimaryColor, setGeneratedPrimaryColor] = useState<
    string | null
  >(null);
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null); // Ref to store timer ID

  // Cleanup timer on component unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const form = useForm<LandingPageSchema>({
    resolver: zodResolver(landingPageSchema),
    defaultValues: {
      namaUsaha: initialData.namaUsaha || "",
      kategori: initialData.kategori || undefined,
      kategoriLainnya: initialData.kategoriLainnya || "",
      deskripsi_user: initialData.deskripsi_user || "",
      whatsapp: initialData.whatsapp || "",
      images: undefined, // File input always starts empty
      testimonials: initialData.testimonials || [], // Initialize as empty array
      address: initialData.address || "",
      socialLinks: initialData.socialLinks || [], // Initialize as empty array
      colorThemeJson: undefined, // Initialize color theme field
    },
  });

  // === Field Array Hooks ===
  const {
    fields: testimonialFields,
    append: appendTestimonial,
    remove: removeTestimonial,
  } = useFieldArray<LandingPageSchema>({
    control: form.control,
    name: "testimonials",
  });

  const {
    fields: socialLinkFields,
    append: appendSocialLink,
    remove: removeSocialLink,
  } = useFieldArray<LandingPageSchema>({
    control: form.control,
    name: "socialLinks",
  });

  const selectedKategori = form.watch("kategori");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(files);
      const previews = Array.from(files).map((file) =>
        URL.createObjectURL(file)
      );
      setImagePreviews(previews);
      form.setValue("images", files, { shouldValidate: true }); // Update RHF state
    } else {
      setSelectedFiles(null);
      setImagePreviews([]);
      form.setValue("images", undefined, { shouldValidate: true });
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    // Create new arrays/FileList excluding the item at indexToRemove
    const remainingPreviews = imagePreviews.filter(
      (_, index) => index !== indexToRemove
    );
    let remainingFiles: FileList | null = null;

    if (selectedFiles) {
      const dataTransfer = new DataTransfer();
      Array.from(selectedFiles)
        .filter((_, index) => index !== indexToRemove)
        .forEach((file) => dataTransfer.items.add(file));
      remainingFiles =
        dataTransfer.files.length > 0 ? dataTransfer.files : null;
    }

    setImagePreviews(remainingPreviews);
    setSelectedFiles(remainingFiles);
    form.setValue("images", remainingFiles as FileList | undefined, {
      shouldValidate: true,
    });
  };

  // Function to handle AI Color Generation
  const handleGenerateColors = async () => {
    const namaUsaha = form.getValues("namaUsaha");
    const kategori = form.getValues("kategori");

    if (!namaUsaha || !kategori) {
      toast.warning("Input Diperlukan", {
        description:
          "Masukkan Nama Usaha dan Kategori terlebih dahulu untuk generate warna.",
      });
      return;
    }

    setIsGeneratingColors(true);
    setGeneratedPrimaryColor(null);
    toast.info("AI sedang meracik warna...", {
      description: "Mohon tunggu sebentar 🎨",
    });

    try {
      const response = await fetch("/api/ai/generate-colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namaUsaha, kategori }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Gagal generate warna AI.");
      }

      // Store the entire JSON string in the form state
      form.setValue("colorThemeJson", JSON.stringify(result), {
        shouldValidate: true,
      });
      setGeneratedPrimaryColor(result.primary); // Show primary color as feedback
      toast.success("Skema Warna Dihasilkan!", {
        description: "Warna utama yang disarankan telah ditampilkan.",
      });
    } catch (error) {
      console.error("Color generation error:", error);
      toast.error("Generate Warna Gagal", {
        description:
          error instanceof Error ? error.message : "Terjadi kesalahan.",
      });
    } finally {
      setIsGeneratingColors(false);
    }
  };

  const onSubmit = (data: LandingPageSchema) => {
    // Clear previous toasts if any
    toast.dismiss();
    // Clear any existing redirect timer before starting a new one
    if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        // --- Loop to append data (adjust for colorThemeJson) ---
        Object.entries(data).forEach(([key, value]) => {
          if (key === "images") {
            if (selectedFiles) {
              Array.from(selectedFiles).forEach((file) => {
                formData.append("images", file);
              });
            }
          } else if (key === "testimonials" || key === "socialLinks") {
            // Handle arrays of objects by stringifying
            if (value && Array.isArray(value) && value.length > 0) {
              formData.append(key, JSON.stringify(value));
            }
          } else if (key === "colorThemeJson") {
            // Only append if it has a value (stringified JSON)
            if (typeof value === "string" && value.length > 2) {
              // Check if not undefined/empty string/empty JSON
              formData.append(key, value);
            }
          } else if (value !== undefined && value !== null && value !== "") {
            // Append other simple values
            formData.append(key, String(value));
          }
        });

        // === Handle Social Links Object ===
        // Stringify arrays for FormData
        if (data.testimonials && data.testimonials.length > 0) {
          formData.append("testimonials", JSON.stringify(data.testimonials));
        }
        if (data.socialLinks && data.socialLinks.length > 0) {
          formData.append("socialLinks", JSON.stringify(data.socialLinks));
        }

        // Add slug and token for edit mode if applicable
        if (isEditMode && slug && editToken) {
          formData.append("slug", slug);
          // Don't append token to FormData, pass via query param
          // formData.append('token', editToken);

          toast.info("Menyimpan perubahan...", {
            description: "Mohon tunggu sebentar.",
          });

          // Call the PUT API route for updating
          const response = await fetch(
            `/api/landing/${slug}?token=${editToken}`,
            {
              method: "PUT",
              body: formData,
            }
          );

          const result = await response.json();

          if (!response.ok) {
            console.error("API Update Error:", result);
            throw new Error(
              result.message || `Gagal menyimpan perubahan (${response.status})`
            );
          }

          // Handle success for update
          toast.success("Sukses!", {
            description: result.message || "Landing page berhasil diperbarui.",
          });
          router.push(`/p/${slug}`); // Redirect to public view
          return; // Exit after successful update
        } else if (!isEditMode) {
          // Call the POST API route for creation
          toast.info("Landing page sedang dibuat...", {
            description: "AI sedang bekerja... ✨",
          });
          const response = await fetch("/api/landing", {
            method: "POST",
            body: formData,
          });

          const result = await response.json();

          if (!response.ok) {
            console.error("API Error Response:", result);
            throw new Error(result.message || "Gagal membuat landing page.");
          }

          // --- Success Handling with Button and Countdown --- 
          const newSlug = result.slug;
          if (!newSlug) {
               console.error("Slug not found in API response after creation.");
               toast.error("Gagal Mendapatkan Alamat Halaman", {
                   description: "Tidak dapat memproses hasil pembuatan halaman."
               });
               return; // Stop if slug is missing
          }

          const redirectUrl = `/p/${newSlug}`;

          // Set timeout for automatic redirect
          redirectTimerRef.current = setTimeout(() => {
              router.push(redirectUrl);
              redirectTimerRef.current = null; // Clear ref after execution
          }, 5000); // 5 seconds

          // Show toast with action button
          toast.success("🎉 Landing Page Berhasil Dibuat!", {
              description:
                "Klik tombol atau tunggu 5 detik untuk melihat halaman.",
              duration: 5500, // Keep toast visible slightly longer than redirect
              action: {
                label: "Lihat Halaman",
                onClick: () => {
                  // Clear the automatic redirect timer
                  if (redirectTimerRef.current) {
                     clearTimeout(redirectTimerRef.current);
                     redirectTimerRef.current = null;
                  }
                  // Redirect immediately
                  router.push(redirectUrl);
                  // Optionally dismiss the toast explicitly if needed
                  // toast.dismiss(); 
                },
              },
          });
          // No return here, let the timer run unless button is clicked
        }

      } catch (error) {
        // Clear timer on error as well
        if (redirectTimerRef.current) {
            clearTimeout(redirectTimerRef.current);
            redirectTimerRef.current = null;
        }
        console.error("Form submission error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat mengirim data.";
        // TODO: Error Handling - Provide more specific user-friendly messages.
        toast.error("Gagal Membuat Halaman", { description: errorMessage });
      }
    });
  };

  // === Handler for AI Description Generation ===
  const handleGenerateDescription = async () => {
    if (isGeneratingDesc) return;

    const namaUsaha = form.getValues("namaUsaha");
    const kategori = form.getValues("kategori");

    if (!namaUsaha || !kategori) {
      toast.error(
        "Isi Nama Usaha dan Kategori terlebih dahulu untuk generate deskripsi."
      );
      return;
    }

    setIsGeneratingDesc(true);
    const genToastId = toast.loading("AI sedang membuatkan deskripsi...");

    try {
      const response = await fetch("/api/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namaUsaha, kategori }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Gagal menghubungi AI.");
      }

      form.setValue("deskripsi_user", result.description, {
        shouldValidate: true,
      });
      toast.success("Deskripsi berhasil dibuat oleh AI!", {
        id: genToastId,
        description: "Anda masih bisa mengeditnya jika perlu.",
      });
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: any
    ) {
      console.error("Description generation error:", error);
      toast.error("Gagal Generate Deskripsi", {
        id: genToastId,
        description: error.message || "Terjadi kesalahan.",
      });
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {/* --- Bagian Utama --- */}
      <Card className="border-none shadow-none p-0">
        {/* <CardHeader className="p-0 mb-6">
          <CardTitle>Informasi Utama</CardTitle>
        </CardHeader> */}
        <CardContent className="space-y-6 p-0">
          {/* Nama Usaha */}
          <div>
            <Label htmlFor="namaUsaha">Nama Usaha / Toko / Brand</Label>
            <Input
              id="namaUsaha"
              placeholder="Contoh: Kedai Kopi Senja"
              {...form.register("namaUsaha")}
              className="mt-1.5"
              disabled={isPending}
            />
            {form.formState.errors.namaUsaha && (
              <p className="text-sm text-red-600">
                {form.formState.errors.namaUsaha.message}
              </p>
            )}
          </div>

          {/* Kategori & Kategori Lainnya (Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
            <div>
              <Label htmlFor="kategori">Kategori Usaha</Label>
              <Select
                onValueChange={(value: string) =>
                  form.setValue(
                    "kategori",
                    value as LandingPageSchema["kategori"],
                    { shouldValidate: true }
                  )
                }
                defaultValue={form.getValues("kategori")}
                disabled={isPending}
              >
                <SelectTrigger id="kategori" className="mt-1.5">
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
                <p className="text-sm text-red-600">
                  {form.formState.errors.kategori.message}
                </p>
              )}
            </div>

            {selectedKategori === "Lainnya" && (
              <div>
                <Label htmlFor="kategoriLainnya">Nama Kategori Lainnya</Label>
                <Input
                  id="kategoriLainnya"
                  placeholder="Contoh: Servis Elektronik"
                  {...form.register("kategoriLainnya")}
                  className="mt-1.5"
                  disabled={isPending}
                />
                {form.formState.errors.kategoriLainnya && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.kategoriLainnya.message}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Deskripsi User (Opsional) */}
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="deskripsi_user">Deskripsi Singkat (Opsional)</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateDescription}
              disabled={isPending || isGeneratingDesc}
              className="text-xs"
            >
              {isGeneratingDesc ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Generate AI
            </Button>
          </div>
          <Textarea
            id="deskripsi_user"
            placeholder="Jelaskan produk/jasa unggulanmu. AI akan gunakan info ini untuk membuat konten yang lebih baik."
            {...form.register("deskripsi_user")}
            className="mt-1.5"
            rows={3}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Maks. 500 karakter.
          </p>
          {form.formState.errors.deskripsi_user && (
            <p className="text-sm text-red-600">
              {form.formState.errors.deskripsi_user.message}
            </p>
          )}
        </CardContent>
      </Card>
      {/* Upload Gambar - Refined Dropzone Style */}
      <div>
        <Label htmlFor="images">Gambar Produk/Jasa (Maks 3, Opsional)</Label>
        <div className="mt-1.5 flex flex-col items-center justify-center w-full">
          <label
            htmlFor="images-input"
            className={cn(
              "flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-lg cursor-pointer",
              "bg-muted/50 hover:bg-muted/80 transition-colors",
              isPending ? "cursor-not-allowed opacity-60" : "",
              form.formState.errors.images ? "border-red-500" : "border-border"
            )}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
              <UploadCloud className="w-8 h-8 mb-3 text-muted-foreground" />
              <p className="mb-1 text-sm text-muted-foreground">
                <span className="font-semibold">
                  Klik atau jatuhkan gambar di sini
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WEBP (Maks 3 file, @ 2MB)
              </p>
            </div>
            <Input
              id="images-input"
              type="file"
              accept="image/jpeg, image/png, image/webp, image/jpg"
              multiple
              onChange={handleFileChange}
              className="hidden"
              disabled={isPending}
            />
          </label>
        </div>
        {/* Image Previews */}
        {imagePreviews.length > 0 && (
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {imagePreviews.map((src, index) => (
              <div
                key={index}
                className="relative aspect-square w-full overflow-hidden rounded border group"
              >
                <Image
                  src={src}
                  alt={`Preview ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 33vw, 20vw"
                  className="object-cover transition-opacity group-hover:opacity-70"
                  onError={() =>
                    console.warn(`Failed to load image preview: ${src}`)
                  } // Handle broken images
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                  onClick={() => handleRemoveImage(index)}
                  disabled={isPending}
                  aria-label="Hapus gambar"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {form.formState.errors.images && (
          <p className="text-sm text-red-600 mt-1">
            {form.formState.errors.images.message}
          </p>
        )}
      </div>
      {/* Nomor WhatsApp (Opsional) */}
      <div>
        <Label htmlFor="whatsapp">Nomor WhatsApp (Opsional)</Label>
        <Input
          id="whatsapp"
          placeholder="Contoh: 6281234567890"
          {...form.register("whatsapp")}
          className="mt-1.5"
          type="tel"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Jika diisi, AI bisa menambahkan tombol chat WA.
        </p>
        {form.formState.errors.whatsapp && (
          <p className="text-sm text-red-600">
            {form.formState.errors.whatsapp.message}
          </p>
        )}
      </div>
      {/* --- Bagian Opsional (Accordion) --- */}
      <Accordion type="multiple" className="w-full border-t pt-4 space-y-2">
        <AccordionItem value="item-details" className="border-b-0">
          <AccordionTrigger className="text-base font-medium hover:no-underline py-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" /> Detail Tambahan (Opsional)
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-6">
              {/* Testimoni - Dynamic */}
              <div className="space-y-4">
                <Label>Testimoni (Maks 3)</Label>
                {testimonialFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex items-start gap-3 p-3 border rounded-md bg-muted/30"
                  >
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Nama Pelanggan"
                        {...form.register(
                          `testimonials.${index}.name` as const
                        )}
                        disabled={isPending}
                      />
                      {form.formState.errors.testimonials?.[index]?.name && (
                        <p className="text-sm text-red-600">
                          {
                            form.formState.errors.testimonials[index]?.name
                              ?.message
                          }
                        </p>
                      )}
                      <Textarea
                        placeholder="Komentar Testimoni"
                        {...form.register(
                          `testimonials.${index}.comment` as const
                        )}
                        rows={2}
                        disabled={isPending}
                      />
                      {form.formState.errors.testimonials?.[index]?.comment && (
                        <p className="text-sm text-red-600">
                          {
                            form.formState.errors.testimonials[index]?.comment
                              ?.message
                          }
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTestimonial(index)}
                      disabled={isPending}
                      aria-label="Hapus Testimoni"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendTestimonial({ name: "", comment: "" })}
                  disabled={isPending || testimonialFields.length >= 3}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Tambah Testimoni
                </Button>
                {form.formState.errors.testimonials?.root && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.testimonials.root.message}
                  </p>
                )}
              </div>

              {/* Alamat */}
              <div>
                <Label htmlFor="address">Alamat (jika ada lokasi fisik)</Label>
                <Input
                  id="address"
                  placeholder="Contoh: Jl. Merdeka No. 10, Jakarta"
                  {...form.register("address")}
                  className="mt-1.5"
                  disabled={isPending}
                />
                {form.formState.errors.address && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.address.message}
                  </p>
                )}
              </div>

              {/* Social Media Links - Dynamic */}
              <div className="space-y-4">
                <Label>Link Sosial Media (Maks 3)</Label>
                {socialLinkFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex items-start gap-3 p-3 border rounded-md bg-muted/30"
                  >
                    <div className="flex-1 grid grid-cols-3 gap-3">
                      <div className="col-span-1">
                        <Select
                          onValueChange={(value) =>
                            form.setValue(
                              `socialLinks.${index}.platform`,
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              value as any
                            )
                          }
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          defaultValue={(field as any).platform}
                          disabled={isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Platform..." />
                          </SelectTrigger>
                          <SelectContent>
                            {SOCIAL_PLATFORMS.map((platform) => (
                              <SelectItem key={platform} value={platform}>
                                {platform}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {form.formState.errors.socialLinks?.[index]
                          ?.platform && (
                          <p className="text-sm text-red-600 mt-1">
                            {
                              form.formState.errors.socialLinks[index]?.platform
                                ?.message
                            }
                          </p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <Input
                          placeholder="URL Lengkap (contoh: https://...)"
                          {...form.register(
                            `socialLinks.${index}.url` as const
                          )}
                          disabled={isPending}
                        />
                        {form.formState.errors.socialLinks?.[index]?.url && (
                          <p className="text-sm text-red-600 mt-1">
                            {
                              form.formState.errors.socialLinks[index]?.url
                                ?.message
                            }
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSocialLink(index)}
                      disabled={isPending}
                      aria-label="Hapus Link"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendSocialLink({ platform: SOCIAL_PLATFORMS[0], url: "" })
                  } // Default to first platform
                  disabled={isPending || socialLinkFields.length >= 3} // Ensure correct limit check
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Tambah Link Media Sosial
                </Button>
                {form.formState.errors.socialLinks?.root && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.socialLinks.root.message}
                  </p>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* --- Optional Color Theme AccordionItem (Pindahkan ke sini) --- */}
        <AccordionItem value="item-colors" className="border-b-0">
          <AccordionTrigger className="text-base font-medium hover:no-underline py-3">
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" /> Desain & Warna (Opsional)
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Biarkan AI memilihkan skema warna terbaik berdasarkan usaha Anda,
              atau kosongkan untuk menggunakan tema default.
            </p>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateColors}
                disabled={
                  isGeneratingColors ||
                  !form.watch("namaUsaha") ||
                  !form.watch("kategori")
                }
              >
                {isGeneratingColors ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Generate Warna Otomatis (AI)
              </Button>
              {generatedPrimaryColor && (
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className="h-5 w-5 rounded border border-border inline-block"
                    style={{ backgroundColor: generatedPrimaryColor }}
                  ></span>
                  <span>Warna utama: {generatedPrimaryColor}</span>
                </div>
              )}
            </div>
            {/* Hidden field to store the generated JSON string */}
            <input type="hidden" {...form.register("colorThemeJson")} />
          </AccordionContent>
        </AccordionItem>
        {/* Akhir dari item warna */}
      </Accordion>{" "}
      {/* Pastikan ini adalah penutup Accordion yang benar */}
      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full !mt-8"
        size="lg"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mohon Tunggu...
          </>
        ) : isEditMode ? (
          "Simpan Perubahan"
        ) : (
          "Buat Landing Page Otomatis Pakai AI ✨"
        )}
      </Button>
    </form>
  );
}

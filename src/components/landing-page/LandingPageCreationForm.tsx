"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { landingPageSchema, KATEGORI_USAHA } from "@/lib/zod-schemas"; // Assuming zod-schemas exports these


// Define the form schema based on landingPageSchema, excluding AI content etc.
// We only need the fields the user inputs initially.
// Access the base object schema before picking if landingPageSchema is a ZodEffects
const baseSchema =
  landingPageSchema instanceof z.ZodEffects
    ? landingPageSchema.sourceType()
    : landingPageSchema;

const creationFormSchema = baseSchema
  .pick({
    businessName: true,
    category: true,
    userDescription: true,
    whatsappNumber: true,
    // images are handled separately
  })
  .extend({
    otherCategory: z.string().optional(), // Add this for conditional logic
    images: z
      .custom<FileList | null>(
        (val) => val instanceof FileList || val === null,
        "Input harus berupa file"
      )
      .optional(), // For file input
  });

type CreationFormInput = z.infer<typeof creationFormSchema>;

export function LandingPageCreationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [showKategoriLainnya, setShowKategoriLainnya] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<CreationFormInput>({
    resolver: zodResolver(creationFormSchema),
    defaultValues: {
      businessName: "",
      category: undefined,
      userDescription: "",
      whatsappNumber: "",
      otherCategory: "",
      images: null,
    },
  });

  const selectedCategory = watch("category");

  // Show/hide 'Kategori Lainnya' input based on selection
  React.useEffect(() => {
    setShowKategoriLainnya(selectedCategory === "Lainnya");
    if (selectedCategory !== "Lainnya") {
      setValue("otherCategory", ""); // Clear the value if another category is selected
    }
  }, [selectedCategory, setValue]);

  const onSubmit: SubmitHandler<CreationFormInput> = async (data) => {
    setIsSubmitting(true);
    const toastId = toast.loading(
      "Sedang membuat halaman landing page AI Anda..."
    );

    const formData = new FormData();
    formData.append("businessName", data.businessName);
    formData.append("category", data.category);
    if (data.category === "Lainnya" && data.otherCategory) {
      formData.append("otherCategory", data.otherCategory);
    }
    if (data.userDescription) {
      formData.append("userDescription", data.userDescription);
    }
    if (data.whatsappNumber) {
      formData.append("whatsappNumber", data.whatsappNumber);
    }
    if (selectedFiles) {
      for (let i = 0; i < selectedFiles.length; i++) {
        if (i < 3) {
          // Limit to 3 files as per backend
          formData.append("images", selectedFiles[i]);
        }
      }
    }

    try {
      const response = await fetch("/api/landing", {
        method: "POST",
        body: formData, // Send as FormData
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("API Error Data:", result);
        throw new Error(result.message || "Gagal membuat halaman.");
      }

      toast.success("Halaman berhasil dibuat!", {
        id: toastId,
        description: "Anda akan diarahkan ke halaman baru Anda.",
      });

      // Store the edit token in sessionStorage before redirecting
      if (result.slug && result.editToken) {
        try {
          sessionStorage.setItem(`editToken_${result.slug}`, result.editToken);
        } catch (e) {
          console.warn("Gagal menyimpan edit token ke sessionStorage:", e);
          toast.info(
            "Token edit gagal disimpan otomatis, simpan link edit manual jika perlu.",
            { duration: 10000 }
          );
        }
        router.push(`/p/${result.slug}`);
      } else {
        throw new Error("Respons API tidak valid setelah pembuatan halaman.");
      }
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: any
    ) {
      console.error("Form Submission Error:", error);
      toast.error("Gagal Membuat Halaman", {
        id: toastId,
        description: error.message || "Terjadi kesalahan yang tidak diketahui.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      if (event.target.files.length > 3) {
        toast.error("Maksimal 3 gambar yang bisa diupload.");
        // Optionally clear the input or just take the first 3
        const input = event.target;
        input.value = ""; // Clear the selection
        setSelectedFiles(null);
      } else {
        setSelectedFiles(event.target.files);
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 w-full max-w-2xl bg-card p-8 rounded-lg shadow-md border"
    >
      <div className="space-y-2">
        <Label htmlFor="businessName">
          Business Name/Produk <span className="text-red-500">*</span>
        </Label>
        <Input
          id="businessName"
          placeholder="Contoh: Kopi Kenangan Senja"
          {...register("businessName")}
        />
        {errors.businessName && (
          <p className="text-sm text-red-600">{errors.businessName.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">
            Business Category <span className="text-red-500">*</span>
          </Label>
          <Select
            onValueChange={(value) =>
              setValue("category", value as CreationFormInput["category"])
            }
            value={selectedCategory}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Pilih category..." />
            </SelectTrigger>
            <SelectContent>
              {KATEGORI_USAHA.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
              <SelectItem value="Lainnya">Lainnya...</SelectItem>
            </SelectContent>
          </Select>
          {errors.category && (
            <p className="text-sm text-red-600">{errors.category.message}</p>
          )}
        </div>

        {showKategoriLainnya && (
          <div className="space-y-2">
            <Label htmlFor="otherCategory">
              Sebutkan Kategori Lainnya <span className="text-red-500">*</span>
            </Label>
            <Input
              id="otherCategory"
              placeholder="Contoh: Jasa Desain Grafis"
              {...register("otherCategory")}
            />
            {errors.otherCategory && (
              <p className="text-sm text-red-600">
                {errors.otherCategory.message}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="userDescription">Deskripsi Singkat (Opsional)</Label>
        <Textarea
          id="userDescription"
          placeholder="Jelaskan sedikit tentang usaha/produk Anda (misal: Keunggulan, target pasar). AI akan menggunakan ini."
          {...register("userDescription")}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">Maksimal 500 karakter.</p>
        {errors.userDescription && (
          <p className="text-sm text-red-600">
            {errors.userDescription.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsappNumber">Nomor WhatsApp (Opsional)</Label>
        <Input
          id="whatsappNumber"
          type="tel"
          placeholder="Contoh: 6281234567890"
          {...register("whatsappNumber")}
        />
        <p className="text-xs text-muted-foreground">
          Awali dengan kode negara (misal: 62). Jika diisi, AI bisa menambahkan
          tombol chat WhatsApp.
        </p>
        {errors.whatsappNumber && (
          <p className="text-sm text-red-600">{errors.whatsappNumber.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="images">Gambar Produk/Usaha (Opsional, Max 3)</Label>
        <div className="flex items-center justify-center w-full">
          <label
            htmlFor="images"
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <UploadCloud className="w-8 h-8 mb-4 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">
                <span className="font-semibold">Klik untuk upload</span> atau
                drag and drop
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WEBP (MAX. 2MB per file)
              </p>
              {selectedFiles && (
                <p className="text-xs text-green-600 mt-2">
                  {selectedFiles.length} file terpilih
                </p>
              )}
            </div>
            <Input
              id="images"
              type="file"
              className="hidden"
              multiple
              accept="image/png, image/jpeg, image/webp"
              onChange={handleFileChange}
            />
          </label>
        </div>
        {errors.images && (
          <p className="text-sm text-red-600">{errors.images.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Membuat Halaman AI...
          </>
        ) : (
          "Buat Landing Page Sekarang ✨"
        )}
      </Button>
    </form>
  );
}

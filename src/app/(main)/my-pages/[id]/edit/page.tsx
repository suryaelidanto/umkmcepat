"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LandingPage } from "@prisma/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Save } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AiGeneratedContent, ColorThemeJson } from "@/lib/ai";

// Tipe data lengkap untuk halaman edit
interface EditPageData extends Omit<
  LandingPage,
  | "aiContent"
  | "testimonials"
  | "socialLinks"
  | "colorTheme"
  | "createdAt"
  | "updatedAt"
> {
  aiContent: AiGeneratedContent;
  testimonials: { name: string; comment: string }[];
  socialLinks: { platform: string; url: string }[];
  colorTheme: ColorThemeJson | null;
  createdAt: string; // Keep as string from fetch
  updatedAt: string;
}

// Skema Zod untuk validasi form update (harus cocok dengan API PUT)
const updateLandingPageSchema = z.object({
  businessName: z.string().min(3, "Nama usaha minimal 3 karakter").max(100),
  category: z.string().min(1, "Kategori wajib diisi"),
  whatsappNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

type UpdateLandingPageFormData = z.infer<typeof updateLandingPageSchema>;

// Fungsi fetch data untuk satu halaman
const fetchPageData = async (pageId: string): Promise<EditPageData> => {
  const res = await fetch(`/api/my-pages/${pageId}`);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Unauthorized");
    }
    if (res.status === 404) {
      throw new Error("Not Found");
    }
    throw new Error("Gagal mengambil data halaman");
  }
  return res.json();
};

// --- Update Mutation ---
const updatePage = async ({
  pageId,
  data,
}: {
  pageId: string;
  data: UpdateLandingPageFormData;
}): Promise<LandingPage> => {
  const res = await fetch(`/api/my-pages/${pageId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.message || "Gagal menyimpan perubahan");
  }
  return result;
};

export default function EditLandingPage() {
  const params = useParams();
  const router = useRouter();
  const pageId = params.id as string;
  const queryClient = useQueryClient();
  const { status: sessionStatus } = useSession();

  const {
    data: pageData,
    isLoading,
    error,
    isError,
  } = useQuery<EditPageData, Error>({
    queryKey: ["editPage", pageId],
    queryFn: () => fetchPageData(pageId),
    enabled: !!pageId && sessionStatus === "authenticated",
    retry: false,
  });

  // Setup react-hook-form
  const form = useForm<UpdateLandingPageFormData>({
    resolver: zodResolver(updateLandingPageSchema),
    defaultValues: {
      businessName: "",
      category: "",
      whatsappNumber: "",
      address: "",
    },
  });

  // Populate form once data is loaded
  React.useEffect(() => {
    if (pageData) {
      form.reset({
        businessName: pageData.businessName,
        category: pageData.category,
        whatsappNumber: pageData.whatsappNumber || "",
        address: pageData.address || "",
      });
    }
  }, [pageData, form]);

  // Mutation hook for updating page
  const updateMutation = useMutation({
    mutationFn: updatePage,
    onSuccess: () => {
      toast.success("Perubahan Berhasil Disimpan");
      // Invalidate query for this specific page to refetch fresh data if needed
      queryClient.invalidateQueries({ queryKey: ["editPage", pageId] });
      // Optionally invalidate the list query as well
      queryClient.invalidateQueries({ queryKey: ["myPages"] });
      // Redirect back to my-pages list
      router.push("/my-pages");
    },
    onError: (error) => {
      toast.error("Gagal Menyimpan Perubahan", { description: error.message });
    },
  });

  // Handle form submission
  const onSubmit = (data: UpdateLandingPageFormData) => {
    updateMutation.mutate({ pageId, data });
  };

  // Handle session loading
  if (sessionStatus === "loading" || isLoading) {
    return (
      <div className="container mx-auto p-spacing-10">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Handle errors *after* loading is complete
  if (isError || !pageData) {
    // Explicitly check if pageData is falsy after loading/auth checks
    return (
      <div className="container mx-auto p-spacing-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {/* Provide specific messages based on error or if pageData is missing */}
            {error?.message === "Unauthorized"
              ? "Anda harus login sebagai pemilik halaman untuk mengedit."
              : error?.message === "Not Found"
                ? "Halaman yang ingin Anda edit tidak ditemukan."
                : error?.message || "Gagal memuat data halaman."}
            <Button asChild variant="link" className="p-0 h-auto ml-1">
              <Link href="/my-pages">Kembali ke Halaman Saya</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Main component return (now we know pageData exists)
  return (
    <div className="container mx-auto max-w-2xl py-8 px-4">
      <div className="mb-6">
        <Button variant="outline" size="sm" asChild>
          <Link href="/my-pages">&larr; Kembali ke Halaman Saya</Link>
        </Button>
      </div>

      <h1 className="text-3xl font-bold mb-2">Ubah Informasi Halaman</h1>
      <p className="text-text-secondary mb-6">
        Ubah detail dasar untuk halaman &ldquo;{pageData.businessName}&rdquo;.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Informasi Dasar</CardTitle>
            <CardDescription>Nama usaha, category, dan kontak.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Business Name */}
            <div>
              <Label htmlFor="businessName">Business Name</Label>
              <Input id="businessName" {...form.register("businessName")} />
              {form.formState.errors.businessName && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.businessName.message}
                </p>
              )}
            </div>

            {/* Kategori */}
            <div>
              <Label htmlFor="category">Kategori</Label>
              {/* TODO: Ganti dengan Select jika category sudah baku */}
              <Input id="category" {...form.register("category")} />
              {form.formState.errors.category && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.category.message}
                </p>
              )}
            </div>

            {/* WhatsApp */}
            <div>
              <Label htmlFor="whatsappNumber">Nomor WhatsApp (Opsional)</Label>
              <Input
                id="whatsappNumber"
                type="tel"
                placeholder="+628123..."
                {...form.register("whatsappNumber")}
              />
              {form.formState.errors.whatsappNumber && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.whatsappNumber.message}
                </p>
              )}
            </div>

            {/* Alamat */}
            <div>
              <Label htmlFor="address">Alamat Singkat (Opsional)</Label>
              <Input id="address" {...form.register("address")} />
              {form.formState.errors.address && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.address.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Placeholder for other editable sections (Testimonials, Social Links etc.) */}

        {/* Save Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <span className="animate-spin mr-2">⏳</span> Menyimpan...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" /> Simpan Perubahan
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

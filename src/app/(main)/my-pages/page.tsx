"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  AlertCircle,
  Copy,
  ExternalLink,
  PlusCircle,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Tipe data yang diharapkan dari API /api/my-pages
interface MyPageData {
  id: string;
  slug: string;
  businessName: string;
  createdAt: string; // Atau Date jika dikonversi
}

// Fungsi untuk fetch data
const fetchMyPages = async (): Promise<MyPageData[]> => {
  const res = await fetch("/api/my-pages");
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized");
    }
    throw new Error("Gagal mengambil data halaman");
  }
  return res.json();
};

// --- Delete Mutation ---
const deletePage = async (pageId: string): Promise<{ message: string }> => {
  const res = await fetch(`/api/my-pages/${pageId}`, {
    method: "DELETE",
  });
  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.message || "Gagal menghapus halaman");
  }
  return result;
};

export default function MyPagesDashboard() {
  const { status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  // State for managing which page is targeted for deletion
  const [pageToDelete, setPageToDelete] = useState<MyPageData | null>(null);

  const {
    data: pages,
    isLoading,
    error,
    isError,
  } = useQuery<MyPageData[], Error>({
    queryKey: ["myPages"],
    queryFn: fetchMyPages,
    enabled: sessionStatus === "authenticated",
  });

  // Mutation hook for deleting pages
  const deleteMutation = useMutation({
    mutationFn: deletePage,
    onSuccess: (data) => {
      toast.success("Halaman Berhasil Dihapus", { description: data.message });
      queryClient.invalidateQueries({ queryKey: ["myPages"] }); // Refetch the list
      setPageToDelete(null); // Close the dialog implicitly by resetting state
    },
    onError: (error) => {
      toast.error("Gagal Menghapus Halaman", { description: error.message });
      setPageToDelete(null);
    },
  });

  const handleDeleteConfirm = () => {
    if (pageToDelete) {
      deleteMutation.mutate(pageToDelete.id);
    }
  };

  // --- Copy Link Handler ---
  const handleCopyLink = (slug: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://umkmcepat.com";
    const pageUrl = `${baseUrl}/p/${slug}`;
    navigator.clipboard
      .writeText(pageUrl)
      .then(() => {
        toast.success("Link halaman berhasil disalin!");
      })
      .catch((err) => {
        console.error("Gagal menyalin link:", err);
        toast.error("Gagal menyalin link.");
      });
  };
  // --- End Copy Link Handler ---

  // Handle loading state for session
  if (sessionStatus === "loading") {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-8 w-1/4 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle unauthenticated state
  if (sessionStatus === "unauthenticated") {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Akses Ditolak</AlertTitle>
          <AlertDescription>
            Anda harus login terlebih dahulu untuk melihat halaman ini.
            <Button asChild variant="link" className="p-0 h-auto ml-1">
              <Link href="/login">Login di sini</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Handle error state from query
  if (isError) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error?.message === "Unauthorized"
              ? "Sesi Anda mungkin telah berakhir. Silakan login kembali."
              : error?.message || "Terjadi kesalahan saat mengambil data."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Handle loading state from query
  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Halaman Saya</h1>
        <Card>
          <CardHeader>
            <CardTitle>Daftar Landing Page</CardTitle>
            <CardDescription>
              Sedang memuat halaman yang telah Anda buat...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Base URL for constructing links
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://umkmcepat.com";

  return (
    <AlertDialog
      open={!!pageToDelete}
      onOpenChange={(open: boolean) => !open && setPageToDelete(null)}
    >
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Halaman Saya</h1>
          <Button asChild>
            <Link href="/create">
              <PlusCircle className="mr-2 h-4 w-4" /> Buat Halaman Baru
            </Link>
          </Button>
        </div>

        {pages && pages.length > 0 ? (
          <>
            {/* Desktop View: Table */}
            <div className="hidden md:block">
              <Card>
                <CardHeader>
                  <CardTitle>Daftar Landing Page</CardTitle>
                  <CardDescription>
                    Berikut adalah daftar landing page yang telah Anda buat.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business Name</TableHead>
                        <TableHead>Link Publik</TableHead>
                        <TableHead>Tanggal Dibuat</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pages.map((page) => {
                        const pageUrl = `${baseUrl}/p/${page.slug}`;
                        return (
                          <TableRow key={page.id}>
                            <TableCell className="font-medium">
                              {page.businessName}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={pageUrl}
                                target="_blank"
                                className="hover:underline text-blue-600 text-sm break-all"
                              >
                                {pageUrl}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {format(
                                new Date(page.createdAt),
                                "dd MMMM yyyy, HH:mm",
                                { locale: localeId },
                              )}
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                asChild
                                title="Lihat Halaman"
                              >
                                <Link href={pageUrl} target="_blank">
                                  <ExternalLink className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                title="Salin Link"
                                onClick={() => handleCopyLink(page.slug)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Hapus Halaman"
                                  onClick={() => setPageToDelete(page)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Mobile View: Cards */}
            <div className="block md:hidden space-y-4">
              <h2 className="text-xl font-semibold mb-4">
                Daftar Landing Page
              </h2>
              {pages.map((page) => {
                const pageUrl = `${baseUrl}/p/${page.slug}`;
                return (
                  <Card key={page.id}>
                    <CardHeader>
                      <CardTitle>{page.businessName}</CardTitle>
                      <CardDescription>
                        Dibuat:{" "}
                        {format(
                          new Date(page.createdAt),
                          "dd MMM yyyy, HH:mm",
                          { locale: localeId },
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Label className="text-xs text-text-secondary">
                        Link Publik:
                      </Label>
                      <Link
                        href={pageUrl}
                        target="_blank"
                        className="block text-sm text-blue-600 hover:underline break-all"
                      >
                        {pageUrl}
                      </Link>
                    </CardContent>
                    <CardFooter className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        title="Lihat Halaman"
                      >
                        <Link href={pageUrl} target="_blank">
                          <ExternalLink className="mr-1 h-4 w-4" /> Lihat
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title="Salin Link"
                        onClick={() => handleCopyLink(page.slug)}
                      >
                        <Copy className="mr-1 h-4 w-4" /> Salin
                      </Button>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-9 w-9"
                          title="Hapus Halaman"
                          onClick={() => setPageToDelete(page)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-10 border rounded-radius-lg bg-surface-warm-white">
            <p className="text-text-secondary mb-4">
              Anda belum membuat landing page.
            </p>
            <Button asChild>
              <Link href="/create">
                <PlusCircle className="mr-2 h-4 w-4" /> Buat Halaman Pertama
                Anda
              </Link>
            </Button>
          </div>
        )}
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Konfirmasi Penghapusan</AlertDialogTitle>
          <AlertDialogDescription>
            Apakah Anda yakin ingin menghapus halaman &quot;
            {pageToDelete?.businessName}&quot;? Tindakan ini tidak dapat
            dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPageToDelete(null)}>
            Batal
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteConfirm}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus Halaman"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

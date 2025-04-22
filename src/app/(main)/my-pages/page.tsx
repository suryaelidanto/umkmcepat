"use client";

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { AlertCircle, Edit, ExternalLink, PlusCircle, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

// Tipe data yang diharapkan dari API /api/my-pages
interface MyPageData {
  id: string;
  slug: string;
  namaUsaha: string;
  createdAt: string; // Atau Date jika dikonversi
}

// Fungsi untuk fetch data
const fetchMyPages = async (): Promise<MyPageData[]> => {
  const res = await fetch('/api/my-pages');
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Unauthorized');
    }    
    throw new Error('Gagal mengambil data halaman');
  }
  return res.json();
};

// --- Delete Mutation ---
const deletePage = async (pageId: string): Promise<{ message: string }> => {
  const res = await fetch(`/api/my-pages/${pageId}`, {
    method: 'DELETE',
  });
  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.message || 'Gagal menghapus halaman');
  }
  return result;
};

export default function MyPagesDashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  // State for managing which page is targeted for deletion
  const [pageToDelete, setPageToDelete] = useState<MyPageData | null>(null);

  const { data: pages, isLoading, error, isError } = useQuery<MyPageData[], Error>({ 
    queryKey: ['myPages'], 
    queryFn: fetchMyPages, 
    enabled: sessionStatus === 'authenticated',
  });

  // Mutation hook for deleting pages
  const deleteMutation = useMutation({ 
    mutationFn: deletePage, 
    onSuccess: (data) => {
      toast.success('Halaman Berhasil Dihapus', { description: data.message });
      queryClient.invalidateQueries({ queryKey: ['myPages'] }); // Refetch the list
      setPageToDelete(null); // Close the dialog implicitly by resetting state
    },
    onError: (error) => {
       toast.error('Gagal Menghapus Halaman', { description: error.message });
       setPageToDelete(null);
    }
  });

  const handleDeleteConfirm = () => {
    if (pageToDelete) {
      deleteMutation.mutate(pageToDelete.id);
    }
  };

  // Handle loading state for session
  if (sessionStatus === 'loading') {
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
  if (sessionStatus === 'unauthenticated') {
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
            {error?.message === 'Unauthorized' 
              ? 'Sesi Anda mungkin telah berakhir. Silakan login kembali.' 
              : error?.message || 'Terjadi kesalahan saat mengambil data.'}
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
            <CardDescription>Sedang memuat halaman yang telah Anda buat...</CardDescription>
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

  return (
    <AlertDialog open={!!pageToDelete} onOpenChange={(open: boolean) => !open && setPageToDelete(null)}> 
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Halaman Saya</h1>
          <Button asChild>
            <Link href="/create"> 
              <PlusCircle className="mr-2 h-4 w-4" /> Buat Halaman Baru
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Landing Page</CardTitle>
            <CardDescription>
              Berikut adalah daftar landing page yang telah Anda buat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pages && pages.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Usaha</TableHead>
                    <TableHead>Alamat (Slug)</TableHead>
                    <TableHead>Tanggal Dibuat</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page) => (
                    <TableRow key={page.id}>
                      <TableCell className="font-medium">{page.namaUsaha}</TableCell>
                      <TableCell>
                         <Link href={`/p/${page.slug}`} target="_blank" className="hover:underline text-blue-600">
                           /p/{page.slug}
                         </Link>
                      </TableCell>
                      <TableCell>
                        {format(new Date(page.createdAt), 'dd MMMM yyyy, HH:mm', { locale: localeId })}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" asChild title="Lihat Halaman">
                          <Link href={`/p/${page.slug}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                        {/* <Button variant="outline" size="sm" asChild title="Ubah Halaman">
                           <Link href={`/dashboard/my-pages/${page.id}/edit`}> 
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button> */}
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" title="Hapus Halaman" onClick={() => setPageToDelete(page)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-10">
                <p className="text-muted-foreground mb-4">Anda belum membuat landing page.</p>
                 <Button asChild>
                  <Link href="/"> 
                    <PlusCircle className="mr-2 h-4 w-4" /> Buat Halaman Pertama Anda
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Konfirmasi Penghapusan</AlertDialogTitle>
          <AlertDialogDescription>
            Apakah Anda yakin ingin menghapus halaman "{pageToDelete?.namaUsaha}"? Tindakan ini tidak dapat dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPageToDelete(null)}>Batal</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDeleteConfirm}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? 'Menghapus...' : 'Ya, Hapus Halaman'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 
import { CreateLandingPageForm } from '@/components/forms/CreateLandingPageForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiGeneratedContent } from '@/lib/ai';
import { prisma } from '@/lib/prisma';
import { LandingPageSchema } from '@/lib/zod-schemas';
import { AlertCircle } from 'lucide-react';
import { notFound } from 'next/navigation';

// Gunakan nama standar 'Props' dan buat searchParams opsional
type Props = {
    params: { slug: string };
    searchParams?: { [key: string]: string | string[] | undefined }; // Opsional
};

// Function to verify token and fetch data server-side
async function verifyTokenAndGetData(slug: string, token?: string | string[]) {
    const providedToken = Array.isArray(token) ? token[0] : token;

    if (!providedToken) {
        return { error: 'Token edit tidak ditemukan.' };
    }

    const landingPage = await prisma.landingPage.findUnique({
        where: { slug },
        select: {
            id: true,
            namaUsaha: true,
            kategori: true,
            aiContent: true, // Need aiContent to potentially get description
            whatsapp: true,
            images: true,
            isClaimed: true,
        },
    });

    if (!landingPage) {
        notFound(); // Or return { error: 'Halaman tidak ditemukan.' };
    }

    if (landingPage.isClaimed) {
        return { error: 'Halaman ini sudah diklaim dan tidak bisa diedit via token.' };
    }

    // Token is valid, return data needed for the form
    const aiContent = (landingPage.aiContent || {}) as unknown as AiGeneratedContent;
    const deskripsi_user_or_ai = aiContent.heroDescription || '';

    // Ensure kategori is one of the allowed enum values or handle 'Lainnya'
    const standardKategori = [
        'Makanan & Minuman',
        'Fashion',
        'Jasa Digital',
        'Jasa Kreatif',
        'Kesehatan & Kecantikan',
        'Edukasi',
        'Lainnya'
    ];
    const isStandardKategori = standardKategori.includes(landingPage.kategori);
    const kategoriForForm = isStandardKategori ? landingPage.kategori as LandingPageSchema['kategori'] : 'Lainnya';
    const kategoriLainnyaForForm = !isStandardKategori ? landingPage.kategori : ''; // Use DB value if not standard

    return {
        success: true,
        initialData: {
            namaUsaha: landingPage.namaUsaha,
            kategori: kategoriForForm,
            kategoriLainnya: kategoriLainnyaForForm, // Pass the custom category name
            deskripsi_user: deskripsi_user_or_ai,
            whatsapp: landingPage.whatsapp || '',
        },
        existingImageUrls: landingPage.images,
        slug: slug,
        token: providedToken
    };
}

// Gunakan tipe Props di default export
export default async function EditLandingPage({ params, searchParams }: Props) {
    const { slug } = params;
    const token = searchParams?.token; // Akses token dengan optional chaining

    const verificationResult = await verifyTokenAndGetData(slug, token);

    if (verificationResult.error) {
        return (
            <div className="container mx-auto max-w-2xl px-4 py-12">
                <Card className="w-full border-destructive">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center">
                            <AlertCircle className="mr-2 h-5 w-5" /> Akses Ditolak
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>{verificationResult.error}</p>
                        {/* Optionally link back to home or the public page */}
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!verificationResult.success || !verificationResult.initialData) {
        // Handle unexpected cases, maybe show a generic error
        notFound();
    }

    // If verification is successful, render the form
    return (
        <div className="container mx-auto max-w-2xl px-4 py-12">
            <Card className="w-full border border-border/60 shadow-none">
                <CardHeader>
                    <CardTitle className="text-2xl">✏️ Edit Landing Page</CardTitle>
                    <CardDescription>
                        Perbarui detail usahamu di bawah ini.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <CreateLandingPageForm
                        initialData={verificationResult.initialData}
                        existingImageUrls={verificationResult.existingImageUrls}
                        slug={verificationResult.slug}
                        editToken={verificationResult.token}
                        isEditMode={true}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

// Gunakan tipe Props yang sama di generateMetadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `Edit Halaman ${params.slug} | tokko.online`,
    robots: { index: false, follow: false }, // Prevent indexing of edit pages
  };
}

import type { Metadata } from 'next'; // Ensure Metadata type is imported 

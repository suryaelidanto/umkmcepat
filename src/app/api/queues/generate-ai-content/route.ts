import { generateLandingPageContent } from '@/lib/ai';
import { prisma } from '@/lib/prisma';
// Impor wrapper verifikasi untuk App Router
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from 'next/server';

// Definisikan tipe data yang diharapkan dari QStash message body
interface QstashPayload {
    pageId: string;
    namaUsaha: string;
    finalKategori: string;
    deskripsi_user?: string;
    hasWhatsApp: boolean;
    whatsapp?: string | null; // Kirim juga nomor WA untuk koreksi AI
}

// Fungsi handler asli
async function handler(request: Request) {
    try {
        // Tidak perlu verifikasi manual di sini, sudah ditangani wrapper

        // Langsung parse body
        // NOTE: Wrapper MUNGKIN sudah mem-parse body, cek dokumentasi/contoh QStash jika ini error
        // Untuk amannya, kita coba parse lagi dari teks mentah
        const bodyText = await request.text();
        const body = JSON.parse(bodyText) as QstashPayload;
        const { pageId, namaUsaha, finalKategori, deskripsi_user, hasWhatsApp, whatsapp } = body;

        if (!pageId || !namaUsaha || !finalKategori) {
            console.error("QStash Handler: Missing required fields in payload", body);
            return NextResponse.json({ message: "Bad Request: Missing required fields" }, { status: 400 });
        }

        console.log(`QStash Handler: Received job for pageId: ${pageId}`);

        // Update status ke PROCESSING
        await prisma.landingPage.update({
            where: { id: pageId },
            data: { generationStatus: 'PROCESSING' },
        });

        // Panggil fungsi AI generation
        console.time(`AI Generation Job ${pageId}`);
        const aiContent = await generateLandingPageContent(
            namaUsaha,
            finalKategori,
            deskripsi_user,
            hasWhatsApp
        );
        console.timeEnd(`AI Generation Job ${pageId}`);

        // Koreksi nomor WhatsApp jika perlu
        if (aiContent.whatsappCTA && hasWhatsApp && whatsapp) {
            aiContent.whatsappNumber = whatsapp;
        } else if (aiContent.whatsappCTA && !hasWhatsApp) {
            aiContent.whatsappCTA = false;
            delete aiContent.whatsappNumber;
        } else {
            delete aiContent.whatsappNumber;
        }

        // Update database dengan hasil AI dan status COMPLETED
        await prisma.landingPage.update({
            where: { id: pageId },
            data: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                aiContent: aiContent as any,
                generationStatus: 'COMPLETED',
            },
        });

        console.log(`QStash Handler: Successfully processed job for pageId: ${pageId}`);
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error(`QStash Handler: Error processing job:`, error);
        try {
            // Coba dapatkan pageId dari body jika error terjadi setelah parsing
            const requestClone = request.clone();
            const body = JSON.parse(await requestClone.text()) as QstashPayload;
            if (body?.pageId) {
                await prisma.landingPage.update({
                    where: { id: body.pageId },
                    data: { generationStatus: 'FAILED' },
                }).catch(updateErr => console.error("QStash Handler: Failed to mark page as FAILED after initial error", updateErr));
                console.error(`QStash Handler: Marked pageId ${body.pageId} as FAILED`);
            } else {
                console.error("QStash Handler: Could not identify pageId in error handler.");
            }
        } catch (parseOrUpdateError) {
            console.error("QStash Handler: Critical error during error handling (parsing or marking as FAILED)", parseOrUpdateError);
        }
        return NextResponse.json({ message: "Internal Server Error processing job" }, { status: 500 });
    }
}

// Bungkus handler dengan verifikasi signature untuk App Router
export const POST = verifySignatureAppRouter(handler);

// Konfigurasi Edge Runtime
export const runtime = 'edge'; 
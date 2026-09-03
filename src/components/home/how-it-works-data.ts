export const HOW_IT_WORKS_STEPS = [
  {
    id: "describe",
    number: "01",
    title: "Ceritakan usaha",
    description:
      "Jawab pertanyaan santai tentang nama toko, jasa yang kamu tawarkan, dan kontak WhatsApp.",
    imageSrc: ["/brand/step-chat.png"],
    imageAlt: "Percakapan dengan AI untuk mengisi data usaha",
  },
  {
    id: "generate",
    number: "02",
    title: "AI susun websitenya",
    description:
      "Workspace langsung membuat pratinjau website dan tata letak penawaran bisnismu.",
    imageSrc: ["/brand/step-workspace.png"],
    imageAlt:
      "Workspace pembuatan website UMKM Cepat dengan pratinjau langsung",
  },
  {
    id: "share",
    number: "03",
    title: "Bagikan ke pembeli",
    description:
      "Dapatkan tautan website publik yang siap kamu pasang di bio Instagram atau kirim ke pelanggan.",
    imageSrc: ["/brand/step-preview.png", "/brand/step-share.png"],
    imageAlt: "Tautan website publik yang siap dibagikan",
  },
] as const;

export function nextHowItWorksIndex(
  currentIndex: number,
  stepCount: number,
): number {
  if (stepCount <= 0 || currentIndex < 0 || currentIndex >= stepCount) {
    return 0;
  }

  return (currentIndex + 1) % stepCount;
}

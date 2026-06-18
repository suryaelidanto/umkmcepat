"use client";

import { Copy, Facebook, Twitter } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShareButtonsProps {
  url: string;
  title?: string; // Optional title for sharing
  className?: string;
}

export function ShareButtons({
  url,
  title = "Lihat Halaman Ini",
  className,
}: ShareButtonsProps) {
  const handleCopy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success("Link berhasil disalin!");
      })
      .catch((err) => {
        console.error("Gagal menyalin link:", err);
        toast.error("Gagal menyalin link.");
      });
  };

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const shareOptions = [
    {
      name: "WhatsApp",
      icon: () => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          className="bi bi-whatsappNumber"
          viewBox="0 0 16 16"
        >
          <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z" />
        </svg>
      ), // SVG for WhatsApp
      url: `https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}`,
    },
    {
      name: "Facebook",
      icon: Facebook,
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      name: "Twitter",
      icon: Twitter,
      url: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    },
    // Tambahkan platform lain jika perlu (Telegram, LinkedIn)
  ];

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span className="text-sm font-medium text-muted-foreground mr-2">
        Bagikan:
      </span>
      {shareOptions.map((option) => {
        const IconComponent = option.icon;
        return (
          <Button
            key={option.name}
            variant="outline"
            size="icon"
            className="h-8 w-8 cursor-pointer"
            onClick={() =>
              window.open(option.url, "_blank", "noopener,noreferrer")
            }
            aria-label={`Bagikan ke ${option.name}`}
            title={`Bagikan ke ${option.name}`}
          >
            <IconComponent />
          </Button>
        );
      })}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 cursor-pointer"
        onClick={handleCopy}
        aria-label="Salin Link"
        title="Salin Link"
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

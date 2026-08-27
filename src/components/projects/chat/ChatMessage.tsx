"use client";

import { type UIMessage } from "ai";
import { useState } from "react";

import {
  ImageLightbox,
  type LightboxImage,
} from "@/components/ui/image-lightbox";
import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";

export const chatBubbleClass = (
  role: "user" | "assistant" | "system",
): string =>
  `max-w-[88%] overflow-hidden break-words rounded-2xl px-spacing-4 py-spacing-3 sm:px-spacing-6 sm:py-spacing-5 transition-colors ${
    role === "user"
      ? "border border-black/10 bg-[#fcfbf8] text-[#1c1c1c] shadow-xs dark:border-surface-warm-white/12 dark:bg-[#30302c] dark:text-surface-warm-white/88"
      : "border border-black/8 bg-[#f5f3ec] text-[#1c1c1c] shadow-xs dark:border-surface-warm-white/10 dark:bg-[#242421] dark:text-surface-warm-white/80"
  }`;

export function ChatMessages({ messages }: { messages: UIMessage[] }) {
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!messages.length) {
    return null;
  }

  function openLightbox(images: LightboxImage[], index: number) {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  }

  return (
    <>
      <div className="space-y-spacing-8">
        {messages.map((message, messageIndex) => {
          const textParts = message.parts.filter(
            (
              part,
            ): part is Extract<
              (typeof message.parts)[number],
              { type: "text" }
            > => part.type === "text" && Boolean(part.text.trim()),
          );

          const fileParts = message.parts.filter(
            (
              part,
            ): part is Extract<
              (typeof message.parts)[number],
              { type: "file" }
            > => part.type === "file" && Boolean(part.url),
          );

          if (!textParts.length && !fileParts.length) {
            return null;
          }

          const messageImages: LightboxImage[] = fileParts.map((file, idx) => {
            const normalizedUrl = file.url.startsWith("/media/")
              ? file.url.replace(/^\/media\//, "/api/media/")
              : file.url;
            return {
              src: normalizedUrl,
              alt: `Gambar ${idx + 1}`,
            };
          });

          return (
            <div
              key={`${message.id || message.role}-${messageIndex}`}
              className={`flex max-w-full text-base leading-7 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={chatBubbleClass(message.role)}>
                {/* Images grid if message has file parts */}
                {fileParts.length > 0 ? (
                  <div
                    className={`flex flex-wrap gap-2 ${textParts.length > 0 ? "mb-2.5" : ""}`}
                  >
                    {fileParts.map((file, fileIdx) => {
                      const normalizedUrl = file.url.startsWith("/media/")
                        ? file.url.replace(/^\/media\//, "/api/media/")
                        : file.url;
                      return (
                        <ImageUploadThumb
                          key={`${file.url}-${fileIdx}`}
                          src={normalizedUrl}
                          alt={`Gambar ${fileIdx + 1}`}
                          onClick={() => openLightbox(messageImages, fileIdx)}
                          className="size-20 rounded-xl cursor-pointer"
                        />
                      );
                    })}
                  </div>
                ) : null}

                {textParts.map((part, index) => (
                  <MessageText key={index} text={part.text} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxIndex}
      />
    </>
  );
}

function MessageText({ text }: { text: string }) {
  const lines = stripDecorativeSymbols(text)
    .split("\n")
    .filter((line) => line.trim());

  return (
    <div className="space-y-spacing-4">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const listMatch = trimmed.match(/^(\d+\.|[-*])\s+(.*)$/);

        if (listMatch) {
          return (
            <p
              key={index}
              className="break-words pl-spacing-4 text-surface-warm-white/72"
            >
              <span className="text-[#ffb38d]">{listMatch[1]}</span>{" "}
              {formatInlineMarkdown(listMatch[2])}
            </p>
          );
        }

        if (trimmed.startsWith("###")) {
          return (
            <p
              key={index}
              className="break-words font-semibold text-[#1c1c1c] dark:text-surface-warm-white"
            >
              {formatInlineMarkdown(trimmed.replace(/^#+\s*/, ""))}
            </p>
          );
        }

        return (
          <p key={index} className="break-words">
            {formatInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function stripDecorativeSymbols(text: string) {
  return text.replace(
    /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu,
    "",
  );
}

function formatInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-surface-warm-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

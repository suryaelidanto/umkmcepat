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

type BuildSessionLogOperation = {
  detail: string;
  id: string;
  path?: string;
  state: "succeeded" | "failed" | "active";
  title: string;
  type: string;
};

type BuildSessionLogData = {
  failed: boolean;
  kind: "build" | "edit";
  operations: BuildSessionLogOperation[];
  skillDigestVersion: string;
  skillsRead: string[];
  stopped: boolean;
  touchedFiles: string[];
};

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
          if (isReadinessCheckMessage(message)) {
            return (
              <div
                key={`${message.id || message.role}-${messageIndex}`}
                className="flex max-w-full justify-end text-base leading-7"
              >
                <div
                  className={`${chatBubbleClass("user")} flex items-center gap-2.5`}
                  role="status"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full bg-amber-500"
                  />
                  <span>
                    <span className="block text-xs font-semibold leading-5">
                      Memeriksa kelengkapan data
                    </span>
                    <span className="block text-xs leading-5 opacity-65">
                      Website belum dibuat sampai data wajib siap.
                    </span>
                  </span>
                </div>
              </div>
            );
          }

          const rawTextParts = message.parts.filter(
            (
              part,
            ): part is Extract<
              (typeof message.parts)[number],
              { type: "text" }
            > => part.type === "text" && Boolean(part.text.trim()),
          );

          // Deduplicate consecutive identical text parts within the same message
          const textParts = rawTextParts.filter((part, idx) => {
            if (idx === 0) {
              return true;
            }
            return part.text.trim() !== rawTextParts[idx - 1]?.text.trim();
          });

          const fileParts = message.parts.filter(
            (
              part,
            ): part is Extract<
              (typeof message.parts)[number],
              { type: "file" }
            > => part.type === "file" && Boolean(part.url),
          );
          const sessionLog = readBuildSessionLog(message);

          if (!textParts.length && !fileParts.length && !sessionLog) {
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
                {sessionLog ? <BuildSessionDetails data={sessionLog} /> : null}
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

function isReadinessCheckMessage(message: UIMessage): boolean {
  const metadata = asRecord(message.metadata);
  if (metadata?.ui === "readiness_check") {
    return true;
  }
  if (message.role !== "user") {
    return false;
  }
  return getMessageText(message)
    .toLocaleLowerCase("id-ID")
    .startsWith("cek dulu kelengkapan data website");
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
}

function readBuildSessionLog(message: UIMessage): BuildSessionLogData | null {
  for (const part of message.parts) {
    const partRecord = asRecord(part);
    if (partRecord?.type !== "data-buildSessionLog") {
      continue;
    }

    const data = asRecord(partRecord.data);
    if (!data) {
      return null;
    }

    return {
      failed: data.failed === true,
      kind: data.kind === "edit" ? "edit" : "build",
      operations: readSessionOperations(data.operations),
      skillDigestVersion:
        typeof data.skillDigestVersion === "string"
          ? data.skillDigestVersion
          : "",
      skillsRead: readStringList(data.skillsRead, 20),
      stopped: data.stopped === true,
      touchedFiles: readStringList(data.touchedFiles, 40),
    };
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function readSessionOperations(value: unknown): BuildSessionLogOperation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const operation = asRecord(item);
    const state = operation?.state;
    if (
      typeof operation?.detail !== "string" ||
      typeof operation.id !== "string" ||
      typeof operation.title !== "string" ||
      typeof operation.type !== "string" ||
      (state !== "succeeded" && state !== "failed" && state !== "active")
    ) {
      return [];
    }

    return [
      {
        detail: operation.detail.trim(),
        id: operation.id.trim(),
        ...(typeof operation.path === "string"
          ? { path: operation.path.trim() }
          : {}),
        state,
        title: operation.title.trim(),
        type: operation.type.trim(),
      },
    ];
  });
}

function BuildSessionDetails({ data }: { data: BuildSessionLogData }) {
  const status = data.stopped
    ? "Dihentikan"
    : data.failed
      ? "Belum selesai"
      : "Selesai";
  const operation = data.kind === "edit" ? "Perubahan" : "Pembuatan";

  return (
    <div className="mt-spacing-4 space-y-spacing-3 border-t border-black/10 pt-spacing-3 text-sm dark:border-surface-warm-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 text-surface-warm-white/65">
        <span className="font-medium">{operation} website</span>
        <span>{status}</span>
      </div>
      {data.operations.length ? (
        <details className="text-surface-warm-white/65">
          <summary className="cursor-pointer select-none">
            {data.operations.length} langkah tercatat
          </summary>
          <ol className="mt-2 space-y-2 pl-5 text-xs">
            {data.operations.map((operation, index) => (
              <li key={`${operation.id}-${index}`}>
                <span className="font-medium text-surface-warm-white/80">
                  {operation.title}
                </span>
                {operation.path ? (
                  <span className="ml-1 break-all font-mono">
                    {operation.path}
                  </span>
                ) : null}
                {operation.detail && operation.detail !== operation.title ? (
                  <span className="block text-surface-warm-white/50">
                    {operation.detail}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {data.touchedFiles.length ? (
        <details className="text-surface-warm-white/65">
          <summary className="cursor-pointer select-none">
            {data.touchedFiles.length} bagian diperbarui
          </summary>
          <ul
            className="mt-2 space-y-1 pl-4 text-xs"
            aria-label="Bagian website yang diperbarui"
          >
            {data.touchedFiles.map((path) => (
              <li key={path} className="break-all font-mono">
                {path}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {data.skillsRead.length ? (
        <p className="text-xs text-surface-warm-white/55">
          Panduan dibaca: {data.skillsRead.join(", ")}
        </p>
      ) : data.skillDigestVersion ? (
        <p className="text-xs text-surface-warm-white/55">
          Panduan tersimpan digunakan
        </p>
      ) : null}
    </div>
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

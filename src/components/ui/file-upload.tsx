"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type FileUploadResult = {
  id: string;
  ref: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

export type FileUploadProps = {
  /** Endpoint that accepts multipart `file` + `purpose`. */
  endpoint: string;
  /** Allowlisted upload purpose sent to the server. */
  purpose: string;
  /** Called when the upload completes. */
  onUploaded?: (result: FileUploadResult) => void;
  /** Called when the upload fails. */
  onError?: (message: string) => void;
  /** Label shown in the dropzone. */
  label?: string;
  /** Hint shown under the label. */
  hint?: string;
  className?: string;
  disabled?: boolean;
  /** Max bytes the server will accept (used for client-side guard). */
  maxSizeBytes?: number;
};

/**
 * Accessible drag-and-drop + click file upload dropzone. Posts multipart form
 * data to `endpoint` with fields `file` and `purpose`. Shows the chosen image
 * as a preview. Designed warm-neutral per DESIGN.md (Warm Control Plane): no
 * gradients, hairline border, near-black focus ring.
 */
export function FileUpload({
  endpoint,
  purpose,
  onUploaded,
  onError,
  label = "Unggah foto",
  hint = "PNG, JPG, atau WEBP. Maksimal 5 MB.",
  className,
  disabled,
  maxSizeBytes = 5 * 1024 * 1024,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const accept = "image/png,image/jpeg,image/webp";

  function handleError(message: string) {
    setError(message);
    onError?.(message);
  }

  async function upload(file: File) {
    setError(null);
    if (file.size > maxSizeBytes) {
      handleError(`Ukuran file melebihi ${maxSizeBytes} byte.`);
      return;
    }
    setUploading(true);
    setPreview(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", purpose);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const json = (await response.json().catch(() => ({}))) as {
        message?: string;
      } & Partial<FileUploadResult>;
      if (!response.ok) {
        handleError(json.message ?? "Upload gagal.");
        return;
      }
      if (json.id && json.url && json.ref) {
        onUploaded?.(json as FileUploadResult);
      } else {
        handleError("Upload gagal.");
      }
    } catch {
      handleError("Upload gagal.");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) {
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void upload(file);
    }
  }

  return (
    <div className={cn("flex flex-col gap-spacing-3", className)}>
      <label
        htmlFor="file-upload-input"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-spacing-2 rounded-radius-lg border border-dashed border-foreground-primary/15 bg-surface-warm-white px-spacing-8 py-spacing-10 text-center transition-colors",
          "hover:border-foreground-primary/30 hover:bg-surface-muted",
          "focus-within:ring-2 focus-within:ring-action-primary focus-within:ring-offset-2 focus-within:ring-offset-background",
          dragging && "border-action-primary bg-surface-muted",
          disabled && "pointer-events-none opacity-50",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {preview && !uploading ? (
          <img
            alt="Pratinjau unggahan"
            src={preview}
            className="max-h-32 max-w-full rounded-radius-md object-contain"
          />
        ) : (
          <span className="text-body-small text-muted-foreground">
            {uploading ? "Mengunggah..." : label}
          </span>
        )}
        <span className="text-body-small text-muted-foreground">{hint}</span>
        <input
          ref={inputRef}
          id="file-upload-input"
          type="file"
          accept={accept}
          disabled={disabled || uploading}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void upload(file);
            }
            event.target.value = "";
          }}
        />
      </label>
      {error ? (
        <p className="text-body-small text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

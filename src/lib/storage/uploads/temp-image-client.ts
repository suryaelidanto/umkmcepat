export async function uploadTempImageFile(file: File) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/uploads/temp-images", {
    body: form,
    method: "POST",
  });
  const json = (await response.json().catch(() => null)) as {
    assetId?: string;
    message?: string;
    url?: string;
  } | null;

  if (!response.ok || !json?.assetId || !json.url) {
    throw new Error(json?.message || "Gagal mengunggah gambar.");
  }

  return { assetId: json.assetId, url: json.url };
}

export async function deleteTempImageAsset(assetId: string): Promise<void> {
  await fetch(`/api/uploads/temp-images/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}

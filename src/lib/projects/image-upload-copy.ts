export function imageUploadAnswerText(count: number): string {
  return `${count} gambar diunggah.`;
}

export function isImageUploadBoilerplateText(text: string): boolean {
  return /^\d+ gambar diunggah\.$/.test(text);
}

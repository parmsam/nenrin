/** Saves a file through the browser's download flow (on iOS: the share sheet / Files). */
export function downloadFile(contents: BlobPart, filename: string, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contents], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

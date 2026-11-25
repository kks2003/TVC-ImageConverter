// Saves a Blob as a file via a temporary <a download> link. The object URL is
// revoked a bit later rather than immediately: revoking synchronously after
// click() can cancel the download in Firefox and Safari.
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

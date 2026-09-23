/** Hands a finished archive to the browser as a download; DOM plumbing kept out of data/. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked next tick: Safari cancels a download whose object URL is released in the click's tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

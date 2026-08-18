/* v8 ignore start -- DOM anchor click, not logic; exercised by the
 * signed-in e2e export spec, not by a unit test. */
// Stryker disable all: DOM plumbing only.
/** Hands a finished archive to the browser as a download -- DOM plumbing
 * kept separate from `data/exportCategory.ts`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked next turn, not immediately: Safari has cancelled downloads
  // whose object URL is released in the same tick as the triggering click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
// Stryker restore all
/* v8 ignore stop */

/**
 * Force a file download with a chosen filename.
 * Cross-origin `<a download>` is ignored by browsers — fetch (or our proxy) first.
 */

export const MISSING_FILE_MESSAGE = 'This file is missing or unreachable.';

export function aspirePdfFilename(label: string): string {
  const base =
    (label || 'document')
      .replace(/[^\w\s-]+/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'document';
  return `AspireTSS_${base}.pdf`;
}

function clickBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

async function downloadFromApi(apiUrl: string): Promise<void> {
  const res = await fetch(apiUrl, { credentials: 'same-origin' });
  if (res.status === 404) throw new Error(MISSING_FILE_MESSAGE);
  if (!res.ok) {
    let detail = MISSING_FILE_MESSAGE;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const cd = res.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/i.exec(cd);
  const filename = match?.[1] || 'download.pdf';
  clickBlob(await res.blob(), filename);
}

/**
 * Download a scene item PDF by resolving the href from sna_scenes (server SELECT).
 */
export async function triggerItemDownload(opts: {
  sceneId: string;
  itemId: string;
  filename: string;
}): Promise<void> {
  const u = new URL('/api/scene/download', window.location.origin);
  u.searchParams.set('sceneId', opts.sceneId);
  u.searchParams.set('itemId', opts.itemId);
  u.searchParams.set('filename', opts.filename);
  await downloadFromApi(u.toString());
}

/** Download `href` as `filename`. Uses same-origin proxy when direct fetch fails. */
export async function triggerDownload(href: string, filename: string): Promise<void> {
  const src = (href || '').trim();
  if (!src) throw new Error('Nothing to download');

  const absolute =
    src.startsWith('/') && !src.startsWith('//')
      ? new URL(src, window.location.origin).toString()
      : src;

  try {
    const res = await fetch(absolute, { credentials: 'omit', mode: 'cors' });
    if (res.status === 404) throw new Error(MISSING_FILE_MESSAGE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    clickBlob(await res.blob(), filename);
    return;
  } catch (err) {
    if (err instanceof Error && err.message === MISSING_FILE_MESSAGE) throw err;
    /* CORS or network — fall through to proxy */
  }

  const u = new URL('/api/scene/download', window.location.origin);
  u.searchParams.set('url', absolute);
  u.searchParams.set('filename', filename);
  await downloadFromApi(u.toString());
}

/** Resolve a PDF file URL from a scene item for the modal Download button. */
export function pdfHrefForItem(item: {
  kind: string;
  src?: string;
  download?: { href?: string };
  as?: string;
}): string | null {
  if (item.kind === 'pdf' && typeof item.src === 'string' && item.src) {
    return item.download?.href || item.src;
  }
  if (item.kind === 'auto' && typeof item.src === 'string' && item.src) {
    if (item.as === 'pdf' || /\.pdf($|\?)/i.test(item.src)) {
      return item.download?.href || item.src;
    }
  }
  if (item.download?.href && /\.pdf($|\?)/i.test(item.download.href)) {
    return item.download.href;
  }
  return null;
}

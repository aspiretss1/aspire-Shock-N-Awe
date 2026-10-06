import { NextResponse } from 'next/server';

import { pdfHrefForItem } from 'scene/downloadFile';
import { isSafeUrl } from 'scene/schema';
import { loadSceneConfigById } from 'scene/source/supabase';

const MISSING = 'This file is missing or unreachable.';

function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  try {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabase) hosts.add(new URL(supabase).hostname.toLowerCase());
  } catch {
    /* ignore */
  }
  for (const raw of (process.env.SCENE_IMAGE_HOSTS ?? '').split(',')) {
    const h = raw.trim().toLowerCase();
    if (h) hosts.add(h);
  }
  return hosts;
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  for (const allowed of allowedHosts()) {
    const a = allowed.replace(/^www\./, '');
    if (host === a || host.endsWith(`.${a}`)) return true;
  }
  return false;
}

function safeFilename(raw: string): string {
  const name = (raw || 'download.pdf').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120);
  return name || 'download.pdf';
}

async function resolveHrefFromDb(
  sceneId: string,
  itemId: string,
): Promise<{ href: string } | { error: string; status: number }> {
  let config;
  try {
    config = await loadSceneConfigById(sceneId);
  } catch (err) {
    console.error('[scene/download] select failed', err);
    return { error: 'database unavailable', status: 502 };
  }
  if (!config) return { error: 'scene not found', status: 404 };

  const item = config.items.find(it => it.id === itemId);
  if (!item) return { error: 'item not found', status: 404 };

  const href = pdfHrefForItem(item)?.trim() ?? '';
  if (!href) return { error: MISSING, status: 404 };

  // Relative /scene/shared/… paths are not served — only absolute Storage URLs.
  if (href.startsWith('/') && !href.startsWith('//')) {
    return { error: MISSING, status: 404 };
  }
  if (!isSafeUrl(href)) return { error: 'invalid url', status: 400 };

  return { href };
}

async function streamAttachment(
  target: string,
  filename: string,
  reqOrigin: string,
): Promise<NextResponse> {
  let parsed: URL;
  try {
    parsed = new URL(target, reqOrigin);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid url' }, { status: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ ok: false, error: 'invalid protocol' }, { status: 400 });
  }

  const sameOrigin = parsed.origin === reqOrigin;
  if (!sameOrigin && !hostAllowed(parsed.hostname)) {
    return NextResponse.json({ ok: false, error: 'host not allowed' }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: { accept: '*/*' },
      redirect: 'follow',
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'upstream unreachable' }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    return NextResponse.json(
      {
        ok: false,
        error: upstream.status === 404 ? MISSING : `upstream ${upstream.status}`,
      },
      { status },
    );
  }

  const headers = new Headers();
  const type = upstream.headers.get('content-type') || 'application/octet-stream';
  headers.set('content-type', type);
  headers.set('content-disposition', `attachment; filename="${filename}"`);
  headers.set('cache-control', 'private, no-store');
  const len = upstream.headers.get('content-length');
  if (len) headers.set('content-length', len);

  return new NextResponse(upstream.body, { status: 200, headers });
}

/**
 * Stream a file as an attachment.
 *
 * Preferred: `?sceneId=&itemId=&filename=` — SELECT href from sna_scenes, then fetch.
 * Legacy: `?url=&filename=` — proxy an allowlisted URL (no DB lookup).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sceneId = (url.searchParams.get('sceneId') ?? '').trim();
  const itemId = (url.searchParams.get('itemId') ?? '').trim();
  const filename = safeFilename(url.searchParams.get('filename') ?? 'download.pdf');

  if (sceneId && itemId) {
    const resolved = await resolveHrefFromDb(sceneId, itemId);
    if ('error' in resolved) {
      return NextResponse.json(
        { ok: false, error: resolved.error },
        { status: resolved.status },
      );
    }
    return streamAttachment(resolved.href, filename, url.origin);
  }

  const target = (url.searchParams.get('url') ?? '').trim();
  if (!target || !isSafeUrl(target)) {
    return NextResponse.json({ ok: false, error: 'invalid url' }, { status: 400 });
  }

  return streamAttachment(target, filename, url.origin);
}

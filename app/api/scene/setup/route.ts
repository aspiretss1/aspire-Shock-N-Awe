import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import { setupAuthorized, setupDeny, setupFail } from 'scene/setup/guard';
import { getById, isRemoteSource, list } from 'scene/source/store';
import { create, remove, update } from 'scene/source/storeWrite';
import { isSupabaseConfigured } from 'scene/source/supabase';
import type { SceneConfig } from 'scene/types';

/**
 * Scene anatomy CRUD. Writes go to sna_scenes. Gated by an admin Auth session.
 */

function touch(scene: SceneConfig, extra: string[] = []) {
  const slugs = [
    ...scene.routes.map(r => r.slug),
    ...(scene.routes.flatMap(r => r.slugHistory ?? [])),
    ...extra,
  ];
  for (const slug of new Set(slugs)) revalidatePath(`/${slug}`);
  revalidatePath('/');
  revalidatePath('/setup');
  revalidatePath(`/setup/${scene.id}`);
}

function needSupabase() {
  if (isRemoteSource()) {
    return NextResponse.json(
      { ok: false, error: 'cannot write to a remote scene source' },
      { status: 501 },
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(req: Request) {
  if (!(await setupAuthorized())) return setupDeny();

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      const scene = await getById(id);
      if (!scene) {
        return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, scene });
    }
    return NextResponse.json({ ok: true, scenes: await list() });
  } catch (err) {
    return setupFail(err);
  }
}

export async function POST(req: Request) {
  if (!(await setupAuthorized())) return setupDeny();
  const blocked = needSupabase();
  if (blocked) return blocked;

  try {
    let body: Partial<SceneConfig> = {};
    const text = await req.text();
    if (text) body = JSON.parse(text) as Partial<SceneConfig>;
    const scene = await create(body);
    touch(scene);
    return NextResponse.json({ ok: true, scene }, { status: 201 });
  } catch (err) {
    return setupFail(err);
  }
}

export async function PUT(req: Request) {
  if (!(await setupAuthorized())) return setupDeny();
  const blocked = needSupabase();
  if (blocked) return blocked;

  try {
    const body = (await req.json()) as SceneConfig;
    if (!body?.id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }
    const scene = await update(body.id, body);
    touch(scene);
    return NextResponse.json({ ok: true, scene });
  } catch (err) {
    return setupFail(err);
  }
}

export async function DELETE(req: Request) {
  if (!(await setupAuthorized())) return setupDeny();
  const blocked = needSupabase();
  if (blocked) return blocked;

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }
    const scene = await remove(id);
    touch(scene, []);
    revalidatePath(`/setup/${id}`);
    return NextResponse.json({ ok: true, scene });
  } catch (err) {
    return setupFail(err);
  }
}

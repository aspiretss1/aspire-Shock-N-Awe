import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { parseScenes, type ValidatedScene } from '../schema';
import type { SceneConfig } from '../types';

/**
 * Postgres + Storage backend.
 *
 * URL + service role only (Setup, engine, and the host helper). Never a
 * browser/publishable key. Marketing hosts call `get_live_post` with the same pair.
 */

export const TABLE_SCENES = 'sna_scenes';
export const TABLE_MEDIA = 'sna_media';
export const BUCKET_IMAGES = 'scene-images';
export const BUCKET_DOCS = 'scene-docs';
export const BUCKET_VIDEO = 'scene-video';
export const BUCKET_AUDIO = 'scene-audio';
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type MediaKind = 'image' | 'pdf' | 'video' | 'audio';

export const MEDIA_KINDS: MediaKind[] = ['image', 'pdf', 'video', 'audio'];

export type MediaRow = {
  id: string;
  scene_id: string;
  kind: MediaKind;
  path: string;
  mime: string | null;
  bytes: number | null;
  label: string | null;
};

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function requireSupabase(): void {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
}

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bucketForKind(kind: MediaKind): string {
  switch (kind) {
    case 'pdf':
      return BUCKET_DOCS;
    case 'video':
      return BUCKET_VIDEO;
    case 'audio':
      return BUCKET_AUDIO;
    default:
      return BUCKET_IMAGES;
  }
}

export function publicMediaUrl(kind: MediaKind, path: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  return `${url}/storage/v1/object/public/${bucketForKind(kind)}/${path}`;
}

export async function loadScenesFromSupabase(): Promise<ValidatedScene[] | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await admin().from(TABLE_SCENES).select('config');
  if (error) throw new Error(error.message);
  if (!data?.length) return [];
  const report = parseScenes(data.map(row => row.config));
  if (report.issues.length) {
    console.warn(
      `[scene] supabase: ${report.issues.length} config issue(s), ` +
        `${report.droppedItems} item(s) dropped`,
    );
  }
  return report.scenes;
}

/** Fresh SELECT of one scene config by id (no list cache). */
export async function loadSceneConfigById(
  id: string,
): Promise<ValidatedScene | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await admin()
    .from(TABLE_SCENES)
    .select('config')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.config) return null;
  const report = parseScenes([data.config]);
  return report.scenes[0] ?? null;
}

export async function saveScenesToSupabase(scenes: SceneConfig[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const db = admin();
  const now = new Date().toISOString();
  const rows = scenes.map(s => ({ id: s.id, config: s, updated_at: now }));
  const { error } = await db.from(TABLE_SCENES).upsert(rows);
  if (error) throw new Error(error.message);

  const { data, error: readErr } = await db.from(TABLE_SCENES).select('id');
  if (readErr) throw new Error(readErr.message);
  const keep = new Set(scenes.map(s => s.id));
  const extra = (data ?? []).map(r => r.id as string).filter(id => !keep.has(id));
  if (extra.length) {
    const { error: delErr } = await db.from(TABLE_SCENES).delete().in('id', extra);
    if (delErr) throw new Error(delErr.message);
  }
}

export async function insertMediaRow(
  row: MediaRow,
): Promise<void> {
  const { error } = await admin().from(TABLE_MEDIA).insert(row);
  if (error) throw new Error(error.message);
}

export async function listMediaRows(): Promise<MediaRow[]> {
  const { data, error } = await admin().from(TABLE_MEDIA).select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaRow[];
}

export async function deleteMediaRows(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await admin().from(TABLE_MEDIA).delete().in('id', ids);
  if (error) throw new Error(error.message);
}

async function ensureBucket(kind: MediaKind): Promise<void> {
  const id = bucketForKind(kind);
  const db = admin();
  const existing = await db.storage.getBucket(id);
  if (existing.data) return;
  const { error } = await db.storage.createBucket(id, { public: true });
  if (!error) return;
  const status = (error as { statusCode?: string | number }).statusCode;
  if (status === 409 || status === '409') return;
  if (/already exists/i.test(error.message)) return;
  throw new Error(error.message);
}

export async function uploadObject(
  kind: MediaKind,
  path: string,
  body: Buffer,
  mime: string,
): Promise<void> {
  await ensureBucket(kind);
  const { error } = await admin()
    .storage.from(bucketForKind(kind))
    .upload(path, body, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
}

export async function removeObjects(kind: MediaKind, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await admin().storage.from(bucketForKind(kind)).remove(paths);
  if (error) throw new Error(error.message);
}

async function listPrefix(bucket: string, prefix: string): Promise<string[]> {
  const db = admin();
  const { data, error } = await db.storage.from(bucket).list(prefix || undefined, {
    limit: 1000,
  });
  if (error) throw new Error(error.message);
  const out: string[] = [];
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (!item.id) {
      out.push(...(await listPrefix(bucket, path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

export async function listBucketPaths(kind: MediaKind): Promise<string[]> {
  return listPrefix(bucketForKind(kind), '');
}

const STORAGE_RE =
  /storage\/v1\/object\/public\/(scene-images|scene-docs|scene-video|scene-audio)\/([^\s"'?]+)/g;

/** Collect Storage object keys referenced by scene configs. */
export function collectStorageRefs(configs: unknown[]): Set<string> {
  const refs = new Set<string>();

  function walk(value: unknown) {
    if (typeof value === 'string') {
      STORAGE_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = STORAGE_RE.exec(value))) {
        refs.add(`${match[1]}/${match[2]}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  }

  configs.forEach(walk);
  return refs;
}

export function mediaRefKey(row: MediaRow): string {
  return `${bucketForKind(row.kind)}/${row.path}`;
}

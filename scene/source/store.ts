import type { ValidatedScene } from '../schema';
import type { SceneConfig, SceneRoute, SiteKey } from '../types';
import { isSupabaseConfigured, loadScenesFromSupabase } from './supabase';

/**
 * Scene store (read path). Live configs are sna_scenes in Supabase. No
 * local JSON catalog and no import of compiled `/scene/shared/` files.
 *
 * Kept free of Node built-ins (`node:fs`, `node:path`) on purpose — this
 * module is reachable from `middleware.ts` (via `sceneSource()` ->
 * `supabaseSource`/`jsonSource`), which runs on the Edge runtime and cannot
 * bundle `node:` scheme imports. Write operations (create/update/remove),
 * which do need `node:fs/promises` for the reserved-slugs file, live in
 * `./storeWrite` instead and are never imported by middleware.
 */

export class StoreError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

export function isRemoteSource(): boolean {
  return /^https?:\/\//i.test(process.env.SCENE_SOURCE_URL ?? '');
}

let cache: { at: number; scenes: ValidatedScene[] } | null = null;

export function invalidateSceneCache() {
  cache = null;
}

/** Internal: lets `./storeWrite` push freshly-persisted scenes into the cache. */
export function setCache(scenes: ValidatedScene[]) {
  cache = { at: Date.now(), scenes };
}

export async function readAll(): Promise<ValidatedScene[]> {
  if (cache) return cache.scenes;
  if (isRemoteSource() || !isSupabaseConfigured()) {
    cache = { at: Date.now(), scenes: [] };
    return cache.scenes;
  }

  const remote = await loadScenesFromSupabase();
  const scenes = remote ?? [];
  cache = { at: Date.now(), scenes };
  return scenes;
}

export function asConfig(scene: ValidatedScene): SceneConfig {
  return scene as unknown as SceneConfig;
}

export async function list(): Promise<SceneConfig[]> {
  return (await readAll()).map(asConfig);
}

export async function getById(id: string): Promise<SceneConfig | null> {
  const scene = (await readAll()).find(s => s.id === id);
  return scene ? asConfig(scene) : null;
}

export async function getByRoute(
  site: SiteKey,
  slug: string,
  liveOnly = true,
): Promise<{ config: SceneConfig; route: SceneRoute } | null> {
  for (const scene of await readAll()) {
    const route = scene.routes.find(
      r =>
        r.site === site &&
        r.slug === slug &&
        (!liveOnly || r.status === 'live'),
    );
    if (route) return { config: asConfig(scene), route: route as SceneRoute };
  }
  return null;
}

export function newSceneId(): string {
  return `s-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function blankScene(id: string): SceneConfig {
  const slug = `untitled-${id.slice(2, 8)}`;
  return {
    id,
    routes: [{ site: 'asat', slug, status: 'draft' }],
    preset: 'custom',
    layout: 'freeform',
    audience: { nameplate: 'Untitled scene' },
    stage: {},
    items: [],
    seo: { title: 'Untitled scene', description: '' },
  };
}

export async function redirects(): Promise<Record<SiteKey, Record<string, string>>> {
  const map: Record<SiteKey, Record<string, string>> = { asat: {}, aspire: {} };
  for (const scene of await readAll()) {
    for (const route of scene.routes) {
      for (const old of route.slugHistory ?? []) {
        map[route.site][old] = route.slug;
      }
    }
  }
  return map;
}

export async function liveLinks(
  site: SiteKey,
): Promise<Record<string, string>> {
  const links: Record<string, string> = {};
  for (const scene of await readAll()) {
    const route = scene.routes.find(r => r.site === site && r.status === 'live');
    if (route) links[scene.id] = route.slug;
  }
  return links;
}

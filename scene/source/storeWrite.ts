import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { sceneConfigSchema, type ValidatedScene } from '../schema';
import type { SceneConfig } from '../types';
import {
  StoreError,
  asConfig,
  blankScene,
  isRemoteSource,
  newSceneId,
  readAll,
  setCache,
} from './store';
import { isSupabaseConfigured, saveScenesToSupabase } from './supabase';

/**
 * Scene store (write path). Node-only — uses `node:fs/promises` to read the
 * reserved-slugs file, so this module must never be imported by
 * `middleware.ts` or anything else bundled for the Edge runtime. API routes
 * and server components (Node runtime) are the only intended callers.
 */

const ALWAYS_RESERVED = ['api', 'setup', 'scene', 'images', 'assets', 'static'];

let writeChain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function assertWritable() {
  if (isRemoteSource()) {
    throw new StoreError('cannot write to a remote scene source', 501);
  }
  if (!isSupabaseConfigured()) {
    throw new StoreError(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      503,
    );
  }
}

async function reservedSlugs(): Promise<Set<string>> {
  try {
    const raw = JSON.parse(
      await readFile(resolve(process.cwd(), 'scene/reserved.json'), 'utf8'),
    );
    const fromFile = Array.isArray(raw) ? (raw as string[]) : [];
    return new Set([...ALWAYS_RESERVED, ...fromFile]);
  } catch {
    return new Set(ALWAYS_RESERVED);
  }
}

async function assertRoutes(scenes: ValidatedScene[]) {
  const reservedSet = await reservedSlugs();
  const claimed = new Map<string, string>();

  for (const scene of scenes) {
    for (const route of scene.routes) {
      if (reservedSet.has(route.slug)) {
        throw new StoreError(
          `slug "${route.slug}" is reserved and will never render`,
        );
      }
      const key = `${route.site}:${route.slug}`;
      const owner = claimed.get(key);
      if (owner && owner !== scene.id) {
        throw new StoreError(
          `slug "${route.slug}" on ${route.site} is already used by "${owner}"`,
        );
      }
      claimed.set(key, scene.id);
    }
  }
}

async function persist(scenes: ValidatedScene[]) {
  assertWritable();
  await assertRoutes(scenes);
  const parsed = scenes.map(s => {
    const result = sceneConfigSchema.safeParse(s);
    if (!result.success) {
      const msg = result.error.issues[0];
      throw new StoreError(
        `${s.id}: ${msg?.path.join('.') || 'config'} — ${msg?.message ?? 'invalid'}`,
      );
    }
    return result.data;
  });

  try {
    await saveScenesToSupabase(parsed as unknown as SceneConfig[]);
  } catch (err) {
    throw new StoreError(
      `supabase write failed: ${err instanceof Error ? err.message : 'unknown'}`,
      500,
    );
  }
  setCache(parsed);
}

function withSlugHistory(
  previous: ValidatedScene | undefined,
  next: ValidatedScene,
): ValidatedScene {
  if (!previous) return next;

  const routes = next.routes.map(route => {
    const old = previous.routes.find(r => r.site === route.site);
    if (!old || old.slug === route.slug) return route;
    const history = [
      ...new Set([...(route.slugHistory ?? []), ...(old.slugHistory ?? []), old.slug]),
    ].filter(s => s !== route.slug);
    return { ...route, slugHistory: history };
  });

  return { ...next, routes };
}

export async function create(input?: Partial<SceneConfig>): Promise<SceneConfig> {
  assertWritable();

  return locked(async () => {
    const scenes = await readAll();
    const id = input?.id && !scenes.some(s => s.id === input.id)
      ? input.id
      : newSceneId();
    const draft = { ...blankScene(id), ...input, id };
    const parsed = sceneConfigSchema.safeParse(draft);
    if (!parsed.success) {
      const msg = parsed.error.issues[0];
      throw new StoreError(
        `${msg?.path.join('.') || 'config'} — ${msg?.message ?? 'invalid'}`,
      );
    }
    await persist([...scenes, parsed.data]);
    return asConfig(parsed.data);
  });
}

export async function update(id: string, input: SceneConfig): Promise<SceneConfig> {
  assertWritable();
  if (input.id !== id) {
    throw new StoreError('scene id is immutable');
  }

  return locked(async () => {
    const scenes = await readAll();
    const index = scenes.findIndex(s => s.id === id);
    if (index === -1) throw new StoreError(`scene "${id}" not found`, 404);

    const parsed = sceneConfigSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues[0];
      throw new StoreError(
        `${msg?.path.join('.') || 'config'} — ${msg?.message ?? 'invalid'}`,
      );
    }

    const next = withSlugHistory(scenes[index], parsed.data);
    const copy = [...scenes];
    copy[index] = next;
    await persist(copy);
    return asConfig(next);
  });
}

export async function remove(id: string): Promise<SceneConfig> {
  assertWritable();

  return locked(async () => {
    const scenes = await readAll();
    const scene = scenes.find(s => s.id === id);
    if (!scene) throw new StoreError(`scene "${id}" not found`, 404);
    await persist(scenes.filter(s => s.id !== id));
    return asConfig(scene);
  });
}

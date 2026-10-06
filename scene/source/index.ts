import { jsonSource } from './jsonSource';
import { isSupabaseConfigured } from './supabase';
import { supabaseSource } from './supabaseSource';
import type { SceneSource } from './types';

/**
 * Where scene config comes from.
 *
 * Supabase when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 * Otherwise no live catalog (Setup cannot write either).
 */

let cached: SceneSource | null = null;

export function sceneSource(): SceneSource {
  if (!cached) cached = isSupabaseConfigured() ? supabaseSource : jsonSource;
  return cached;
}

export type { SceneSource } from './types';
export { invalidateSceneCache } from './store';

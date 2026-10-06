import { parseScenes } from '../schema';
import type { ResolvedScene, SceneConfig, SceneRoute, SiteKey } from '../types';
import {
  getById as storeGetById,
  getByRoute as storeGetByRoute,
  list as storeList,
  redirects as storeRedirects,
} from './store';
import type { SceneSource } from './types';

/**
 * Optional HTTPS catalog. Local JSON files are not a media source.
 */

async function loadRemote(): Promise<SceneConfig[]> {
  const src = process.env.SCENE_SOURCE_URL;
  if (!src || !/^https?:\/\//i.test(src)) return storeList();

  const res = await fetch(src, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`scene source responded ${res.status}`);
  const report = parseScenes(await res.json());
  if (report.issues.length) {
    console.warn(
      `[scene] ${report.issues.length} config issue(s), ` +
        `${report.droppedItems} item(s) dropped:\n  ` +
        report.issues.slice(0, 20).join('\n  '),
    );
  }
  return report.scenes as unknown as SceneConfig[];
}

export const jsonSource: SceneSource = {
  async list() {
    return loadRemote();
  },

  async getByRoute(site: SiteKey, slug: string): Promise<ResolvedScene | null> {
    if (!/^https?:\/\//i.test(process.env.SCENE_SOURCE_URL ?? '')) {
      const hit = await storeGetByRoute(site, slug, true);
      if (!hit) return null;
      return {
        config: hit.config,
        route: hit.route,
        items: hit.config.items,
      };
    }

    for (const config of await loadRemote()) {
      const route = config.routes.find(
        r => r.site === site && r.slug === slug && r.status === 'live',
      );
      if (route) {
        return { config, route, items: config.items };
      }
    }
    return null;
  },

  async getById(id: string, site: SiteKey): Promise<ResolvedScene | null> {
    if (!/^https?:\/\//i.test(process.env.SCENE_SOURCE_URL ?? '')) {
      const config = await storeGetById(id);
      if (!config) return null;
      const route = config.routes.find(r => r.site === site && r.status === 'live');
      if (!route) return null;
      return { config, route, items: config.items };
    }

    const config = (await loadRemote()).find(s => s.id === id);
    if (!config) return null;
    const route = config.routes.find(r => r.site === site && r.status === 'live');
    if (!route) return null;
    return { config, route, items: config.items };
  },

  async allLiveRoutes(): Promise<SceneRoute[]> {
    return (await loadRemote()).flatMap(s =>
      s.routes.filter(r => r.status === 'live'),
    );
  },

  async redirects(): Promise<Record<SiteKey, Record<string, string>>> {
    if (!/^https?:\/\//i.test(process.env.SCENE_SOURCE_URL ?? '')) {
      return storeRedirects();
    }
    const map: Record<SiteKey, Record<string, string>> = { asat: {}, aspire: {} };
    for (const scene of await loadRemote()) {
      for (const route of scene.routes) {
        for (const old of route.slugHistory ?? []) {
          map[route.site][old] = route.slug;
        }
      }
    }
    return map;
  },
};

export { invalidateSceneCache } from './store';

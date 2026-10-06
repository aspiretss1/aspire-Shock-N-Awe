import { sceneSource } from './index';
import type { ResolvedItem, SceneConfig, SiteKey, TrailNode } from '../types';

export interface NavigatedScene {
  config: SceneConfig;
  route: SceneConfig['routes'][number];
  items: ResolvedItem[];
  links: Record<string, string>;
  trail: TrailNode[];
}

function liveSlug(scene: SceneConfig, site: SiteKey): string | null {
  return scene.routes.find(r => r.site === site && r.status === 'live')?.slug ?? null;
}

function linksFor(scenes: SceneConfig[], site: SiteKey): Record<string, string> {
  const links: Record<string, string> = {};
  for (const scene of scenes) {
    const slug = liveSlug(scene, site);
    if (slug) links[scene.id] = slug;
  }
  return links;
}

function trailFor(
  scenes: SceneConfig[],
  scene: SceneConfig,
  site: SiteKey,
): TrailNode[] {
  const byId = new Map(scenes.map(s => [s.id, s]));
  const chain: SceneConfig[] = [];
  const seen = new Set<string>();
  let cursor: SceneConfig | undefined = scene;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parent ? byId.get(cursor.parent) : undefined;
  }

  return chain.reverse().flatMap(s => {
    const slug = liveSlug(s, site);
    if (!slug) return [];
    return [{ id: s.id, slug, label: s.audience.nameplate }];
  });
}

export async function resolveNavigation(
  site: SiteKey,
  query: { slug?: string; id?: string },
): Promise<NavigatedScene | null> {
  const source = sceneSource();
  const resolved = query.id
    ? await source.getById(query.id, site)
    : query.slug
      ? await source.getByRoute(site, query.slug)
      : null;

  if (!resolved) return null;

  const all = await source.list();
  return {
    ...resolved,
    links: linksFor(all, site),
    trail: trailFor(all, resolved.config, site),
  };
}

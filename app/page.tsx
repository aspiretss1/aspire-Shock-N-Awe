import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BrandMark } from 'components/BrandMark';
import { DashboardLink } from 'components/DashboardLink';
import { LogoutButton } from 'components/LogoutButton';
import { Button } from 'components/ui/Button';
import { isAdmin } from 'scene/auth/session';
import { currentSite, currentSiteKey, SITES } from 'scene/sites';
import { sceneSource } from 'scene/source';
import type { SceneConfig, SiteKey } from 'scene/types';

export const metadata = { robots: { index: false, follow: false } };

function liveOn(scene: SceneConfig, site: SiteKey) {
  return scene.routes.find(r => r.site === site && r.status === 'live');
}

export default async function Home() {
  if (!(await isAdmin())) redirect('/login?next=/');

  const siteKey = currentSiteKey();
  const site = currentSite();
  const scenes = await sceneSource().list();
  const mine = scenes.flatMap(scene => {
    const route = liveOn(scene, siteKey);
    return route ? [{ scene, route }] : [];
  });
  const others = scenes.flatMap(scene =>
    scene.routes
      .filter(r => r.site !== siteKey && r.status === 'live')
      .map(route => ({ scene, route })),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between gap-4">
        <BrandMark />
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/setup">Setup</Link>
          </Button>
          <DashboardLink />
          <LogoutButton />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent)]">
          {site.name}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Live scenes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Interactive desks and boards on this brand. Open Setup to assign a
          scene to SAT and Aspire.
        </p>
      </div>

      <ul className="mt-10 space-y-2">
        {mine.length === 0 && (
          <li className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
            Nothing live here yet. Setup → chip a scene onto this brand.
          </li>
        )}
        {mine.map(({ scene, route }) => (
          <li key={`${route.site}:${route.slug}`}>
            <Link
              href={`/${route.slug}`}
              className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4 transition hover:border-[var(--brand-accent)]"
            >
              <span>
                <span className="block font-medium">{scene.audience.nameplate}</span>
                <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                  /{route.slug}
                </span>
              </span>
              <span className="text-sm text-[var(--brand-accent)]">View</span>
            </Link>
          </li>
        ))}
      </ul>

      {others.length > 0 && (
        <div className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            On the other brand
          </h2>
          <ul className="mt-4 space-y-2">
            {others.map(({ scene, route }) => (
              <li
                key={`${route.site}:${route.slug}`}
                className="rounded-xl border bg-card/50 px-4 py-3 text-sm"
              >
                <span className="block font-medium">{scene.audience.nameplate}</span>
                <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                  {SITES[route.site].url}/{route.slug}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Localhost follows one brand. Set{' '}
            <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_FORCE_SITE</code> to
            switch.
          </p>
        </div>
      )}
    </main>
  );
}

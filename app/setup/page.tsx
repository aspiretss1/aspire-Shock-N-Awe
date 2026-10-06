import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BrandMark } from 'components/BrandMark';
import { DashboardLink } from 'components/DashboardLink';
import { LogoutButton } from 'components/LogoutButton';
import { Button } from 'components/ui/Button';
import { isAdmin } from 'scene/auth/session';
import { SITES } from 'scene/sites';
import { list } from 'scene/source/store';

import { SetupList } from './SetupList';

export const metadata = { robots: { index: false, follow: false }, title: 'Scene setup' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (!(await isAdmin())) redirect('/login?next=/setup');

  const scenes = await list();
  const brands = Object.values(SITES).map(s => ({
    key: s.key,
    name: s.name,
    url: s.url,
    apex: new URL(s.url).hostname.replace(/^www\./, ''),
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <BrandMark href="/setup" />
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/">Index</Link>
          </Button>
          <DashboardLink />
          <LogoutButton />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent)]">
          Setup
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Scenes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign each scene to SAT and Aspire. Stored in Supabase.
        </p>
      </div>
      <SetupList scenes={scenes} brands={brands} />
    </main>
  );
}

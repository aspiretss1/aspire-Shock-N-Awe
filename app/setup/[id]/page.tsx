import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { BrandMark } from 'components/BrandMark';
import { DashboardLink } from 'components/DashboardLink';
import { LogoutButton } from 'components/LogoutButton';
import { isAdmin } from 'scene/auth/session';
import { SITES } from 'scene/sites';
import { getById, list } from 'scene/source/store';

import { Editor } from './Editor';

export const metadata = { robots: { index: false, follow: false }, title: 'Edit scene' };
export const dynamic = 'force-dynamic';

export default async function EditScenePage({
  params,
}: {
  params: { id: string };
}) {
  if (!(await isAdmin())) redirect(`/login?next=/setup/${encodeURIComponent(params.id)}`);

  const scene = await getById(params.id);
  if (!scene) notFound();

  const brands = Object.values(SITES).map(s => ({
    key: s.key,
    name: s.name,
    url: s.url,
    apex: new URL(s.url).hostname.replace(/^www\./, ''),
  }));

  const all = (await list()).map(s => ({ id: s.id, label: s.audience.nameplate }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <BrandMark href="/setup" />
          <Link href="/setup" className="text-sm text-muted-foreground hover:text-foreground">
            ← Scenes
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <DashboardLink />
          <LogoutButton />
        </div>
      </div>
      <Editor scene={scene} brands={brands} all={all} />
    </main>
  );
}

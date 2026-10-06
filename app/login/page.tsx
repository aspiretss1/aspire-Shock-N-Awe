import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { BrandMark } from 'components/BrandMark';
import { DashboardLink } from 'components/DashboardLink';
import { isAdmin } from 'scene/auth/session';

import { LoginForm } from './LoginForm';

export const metadata = { robots: { index: false, follow: false }, title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await isAdmin()) redirect('/setup');

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <BrandMark href="/login" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Admin only. Live scenes stay public; this dashboard does not.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
      <div className="mt-6">
        <DashboardLink />
      </div>
    </main>
  );
}

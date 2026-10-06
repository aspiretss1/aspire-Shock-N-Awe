import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { adminRoleFor, createMiddlewareAuth, safeNextPath } from 'scene/auth/shared';
import { sceneSource } from 'scene/source';
import { SITES, siteFromHost } from 'scene/sites';
import type { SiteKey } from 'scene/types';

/**
 * Edge resolution, in order:
 *
 *  1. Host  → brand. Passed downstream as `x-site` so server components can
 *     read it without prop-drilling.
 *  2. Old slug → current slug, read from `sna_scenes.routes[].slugHistory`
 *     in the database — there is no compiled registry to fall back to.
 *  3. Operator paths (`/` and `/setup`) require an admin session.
 *
 * 301 rather than 302 — these are permanent moves and the search equity
 * should transfer.
 */

function isOperatorPath(pathname: string) {
  return pathname === '/' || pathname === '/setup' || pathname.startsWith('/setup/');
}

function sceneFrameAncestors() {
  const origins = new Set<string>([
    "'self'",
    'http://localhost:*',
    'http://127.0.0.1:*',
  ]);
  for (const site of Object.values(SITES)) {
    try {
      origins.add(new URL(site.url).origin);
    } catch {
      /* skip */
    }
    for (const host of site.hosts) {
      if (host.startsWith('*.')) continue;
      origins.add(`https://${host}`);
    }
  }
  return `frame-ancestors ${[...origins].join(' ')}`;
}

function withFrameCsp(req: NextRequest, res: NextResponse) {
  const path = req.nextUrl.pathname;
  if (isOperatorPath(path) || path === '/login' || path.startsWith('/login/')) {
    res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    res.headers.set('X-Frame-Options', 'DENY');
  } else {
    res.headers.set('Content-Security-Policy', sceneFrameAncestors());
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const forced = process.env.NEXT_PUBLIC_FORCE_SITE as SiteKey | undefined;
  const site = forced ?? siteFromHost(req.headers.get('host'));

  const slug = req.nextUrl.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const redirects = slug ? await sceneSource().redirects() : null;
  const moved = redirects ? redirects[site]?.[slug] : undefined;

  if (moved) {
    const url = req.nextUrl.clone();
    url.pathname = `/${moved}`;
    return withFrameCsp(req, NextResponse.redirect(url, 301));
  }

  const res = NextResponse.next();
  res.headers.set('x-site', site);

  if (isOperatorPath(req.nextUrl.pathname)) {
    const auth = createMiddlewareAuth(req, res);
    const {
      data: { user },
    } = auth
      ? await auth.auth.getUser()
      : { data: { user: null } };
    const admin = user ? await adminRoleFor(user.id) : false;
    if (!admin) {
      const login = req.nextUrl.clone();
      login.pathname = '/login';
      login.search = `?next=${encodeURIComponent(safeNextPath(req.nextUrl.pathname))}`;
      return withFrameCsp(req, NextResponse.redirect(login));
    }
  }

  return withFrameCsp(req, res);
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};

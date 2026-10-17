# Shock and Awe

A config-driven engine for **interactive scenes** (desk, board, office). It is a standalone Next.js app. SAT ([securityawarenesstraining.ai](https://www.securityawarenesstraining.ai)) and Aspire ([aspiretss.com](https://aspiretss.com)) stay their own codebases; they ask a fetch helper whether a slug is live, then iframe this engine.

How to use Setup: [`docs/ui.md`](docs/ui.md). Hub login: [`docs/login-channel.md`](docs/login-channel.md). Logout sync: [`docs/LogOut.md`](docs/LogOut.md). Engine internals: [`docs/Shock_and_Awe_Technical_Spec.md`](docs/Shock_and_Awe_Technical_Spec.md).

---

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev                    # http://localhost:5000
```

`/` and `/setup` are **admin-only** (Supabase Auth + `app_users.role = admin`). Live scenes are `/<slug>`. Sign in at `/login`.

| Command | What it does |
|---|---|
| `npm run dev` | Regenerates reserved slugs, then starts Next on port 5000 |
| `npm run build` | Same, then a production build |
| `npm run start` | Serves the production build on port 5000 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate:scenes` | Slug collisions, canonical integrity, schema |
| `npm run test:login` | Password, JWT, and optional one-time code handoff — see below |

On `localhost` the host matches neither brand, so resolution falls back to `asat`. Use `NEXT_PUBLIC_FORCE_SITE=aspire` to see the other brand.

---

## Environment

Copy [`.env.example`](.env.example). Required for Setup and live scenes:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Shared project URL (engine + host helper) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Scene data. Never `NEXT_PUBLIC_` |
| `SUPABASE_PUBLISHABLE_KEY` | Server-only. Admin login cookies (`sb_publishable_…`). Never `NEXT_PUBLIC_` |
| `SCENE_ENGINE_URL` | Public origin of this app, for SAT/Aspire iframes |

Optional:

| Variable | Purpose |
|---|---|
| `HANDOFF_SECRET` | Hub server mint for `POST /api/auth/handoff` and `POST /api/auth/logout/handoff` |
| `DASHBOARD_URL` | Hub URL for **Return to dashboard** and hub logout after Sign out |
| `NEXT_PUBLIC_GTM_ASAT` / `NEXT_PUBLIC_GTM_ASPIRE` | GTM containers. An unset id must render no tag |
| `NEXT_PUBLIC_FORCE_SITE` | `asat` \| `aspire` — override host resolution locally |
| `SKIP_ENV_CHECK=1` | Allow a production build with no analytics IDs |
| `SCENE_REVALIDATE_SECRET` | Shared secret for `POST /api/scene/revalidate` |
| `NEXT_PUBLIC_SCENE_EMBED_HOSTS` | Extra iframe hosts, comma separated |
| `SCENE_IMAGE_HOSTS` | Extra `next/image` hosts, comma separated |

`next.config.mjs` fails the production build when a brand GTM id is missing unless `SKIP_ENV_CHECK=1`. The Docker image sets `SKIP_ENV_CHECK=1` so analytics ids are optional at build; pass GTM as build args later if you want tags.

Local `npm run dev` reads `.env.local`. Docker Compose reads `.env` and inlines `NEXT_PUBLIC_SUPABASE_URL` at image build.

---

## Supabase

Without these env vars the catalog is empty.

1. The project should already be online. Contact an administrator if the database is not present.
2. Tables `sna_scenes` and `sna_media` (`scene_id` FK), `get_live_post` RPC, public buckets `scene-images`, `scene-docs`, `scene-video`, `scene-audio`.
3. Put the project **URL**, **service role** key, and **publishable** key (Auth only) in `.env.local`.
4. In Supabase Auth, create the operator user. Insert `app_users` with that user's `id`, `email`, and `role = 'admin'`. There is no signup in the app.

| Layer | Holds |
|---|---|
| Postgres `sna_scenes` | Full scene JSON, including brand routes |
| Postgres `sna_media` | Image/PDF/video/audio rows keyed by `scene_id` |
| Postgres `app_users` | Auth user id, email, `role` (`admin` for Setup) |
| Storage | File bytes in the four buckets |
| Not in Storage | YouTube / Vimeo URLs stay embeds |

Uploads create a missing bucket if needed (so an older project without `scene-audio` still works). If a public file 404s after upload, re-run the `storage.buckets` insert and the `public read scene media` policy from `schema.sql`.

Free-tier caps: 500 MB database, 1 GB file storage, **50 MB max upload**. Keep uploaded video small.

---

## Deploy

On a VPS, Compose runs only the **web** app on `127.0.0.1:5000`. The **host** Caddy (already on **80/443**) terminates Let’s Encrypt HTTPS and reverse-proxies to that port — same pattern as your other services. Supabase stays the hosted project (no database in Compose). Public origin is `https://shock-n-awe.duckdns.org` with `SCENE_ENGINE_URL=https://shock-n-awe.duckdns.org`.

1. Copy [`.env.example`](.env.example) to `.env`. Set URL, service role, publishable key, and `SCENE_ENGINE_URL=https://shock-n-awe.duckdns.org`.
2. Run `schema.sql` once on the production Supabase project if it is a new project (includes `app_users`).
3. Stop any old Compose Caddy from this project if it is still around: `docker compose down` then `docker compose up -d --build` (only `web` starts; binds localhost **5000**).
4. Add the site block from [`Caddyfile`](Caddyfile) to the host Caddy config (usually `/etc/caddy/Caddyfile`), validate, and reload:
   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```
5. Open `https://shock-n-awe.duckdns.org`. Sign in at `/login`, or open Setup from the hub via the [one-time code channel](docs/login-channel.md). Assign scenes **live** in `/setup`.

```
docker compose up -d --build    # web on 127.0.0.1:5000
# host Caddy: shock-n-awe.duckdns.org → 127.0.0.1:5000 (Let’s Encrypt)
```

The hub must not put JWTs in the page. It mints a one-time code on the server, then redirects the browser. Full contract: [`docs/login-channel.md`](docs/login-channel.md).

`POST /api/auth/login` still accepts `{ email, password }` or `{ access_token, refresh_token }` (tests / fallback). The user must have `app_users.role = admin`. Set `DASHBOARD_URL` to the hub origin so Setup shows **Return to dashboard** and Sign out can return to the hub’s logout fan-out.

```bash
npm run test:login -- --email you@example.com --password secret
npm run test:login -- --token "$ACCESS_TOKEN" --refresh "$REFRESH_TOKEN"
```

With `HANDOFF_SECRET` (or `--handoff-secret`), password mode also mints a code and consumes it. Default target is `http://localhost:5000`. Override with `--base` or `SCENE_ENGINE_URL`. Do not put real passwords or tokens in this file.

```
Setup (this repo) ──writes──► Supabase (config + Storage)
SAT / Aspire      ──fetch──► get_live_post(site, slug)
                  ──iframe─► SCENE_ENGINE_URL/{slug}
This engine       ──reads──► sna_scenes + Storage
```

---

## SAT and Aspire

Do not copy `scene/` into those apps. Copy [`scene/host/client.ts`](scene/host/client.ts) (or the local `host-kit/` drop-in) and set the same three env vars on **each host**.

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SCENE_ENGINE_URL=https://your-engine.example
```

One catch-all for a single unknown path segment (static routes still win). SAT uses `'asat'`; Aspire uses `'aspire'`. Do not list slugs in `next.config` rewrites.

```ts
import { getLiveRoute } from 'scene/host';

const SITE = 'asat'; // 'aspire' on Aspire

export default async function CatchAll({ params }: { params: { slug: string } }) {
  const route = await getLiveRoute(SITE, params.slug);
  if (!route) return null; // existing SAT/Aspire page or 404
  return (
    <iframe
      src={route.href}
      title={route.slug}
      className="h-screen w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation allow-downloads"
      allow="autoplay; fullscreen; encrypted-media"
    />
  );
}
```

`listLiveRoutes(site)` is the same RPC with slug omitted (sitemap / nav). Cache is ~45 seconds. Helper prefers `get_live_post`. The engine’s `GET /api/scene/navigate` catalog (no slug) is admin-only.

If you copied `host-kit/`, see [`host-kit/JOIN.md`](host-kit/JOIN.md).

---

## Project layout

```
Shock-and-Awe/
├── app/                      routes: /login, index, /setup, /[sceneSlug]
├── middleware.ts             host → brand; old slug → 301
├── scene/                    engine, Setup client, Supabase source, host helper
├── Dockerfile                production image, port 5000
├── docker-compose.yml        VPS: web on 127.0.0.1:5000
├── Caddyfile                 Host Caddy site snippet (TLS + proxy)
├── supabase/schema.sql       tables, RPC, buckets
├── docs/ui.md                how to use Setup
├── docs/login-channel.md     hub one-time code login
├── docs/LogOut.md            logout sync (hub + connected apps)
├── scripts/                  reserved slugs, validate, test-login
└── public/scene/stages/      optional local stage art for compiled examples
```

Scene `id` is immutable. `slug` is not — old slugs land in `slugHistory` and middleware 301s them. The root catch-all must not collide with app routes; `scripts/reserved-slugs.mjs` plus `validate:scenes` guard that.

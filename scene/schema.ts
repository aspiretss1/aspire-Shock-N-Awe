import { z } from 'zod';

/**
 * Runtime validation.
 *
 * While scenes lived in TypeScript files, the compiler guaranteed their shape.
 * The moment they arrive from a CMS, an API or a JSON file, that guarantee is
 * gone — the data is as trustworthy as whoever typed it. Everything crossing
 * the source boundary is parsed here.
 *
 * Two things this catches that types never could:
 *
 *  1. Malformed config — a missing `src`, an out-of-range hotspot, a bad enum.
 *     A single broken item is dropped rather than taking the page down.
 *  2. Hostile URLs — `javascript:` in an href, an arbitrary host in an iframe.
 *     An editable `src` field is an injection surface; treat it as one.
 */

/* ------------------------------------------------------------------ *
 * URL safety
 * ------------------------------------------------------------------ */

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Hosts permitted inside an iframe.
 *
 * An iframe runs third-party code in the visitor's session. Anything not on
 * this list is not framed at all — the hotspot redirects to it instead, so it
 * loads under its own origin. Extend deliberately, via
 * `NEXT_PUBLIC_SCENE_EMBED_HOSTS`, not by loosening this default.
 */
const DEFAULT_EMBED_HOSTS = [
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'player.vimeo.com',
  'vimeo.com',
  'loom.com',
  'wistia.net',
  'wistia.com',
  'dailymotion.com',
  'drive.google.com',
  'docs.google.com',
  'view.officeapps.live.com',
  'api.leadconnectorhq.com',
  'link.msgsndr.com',
];

export function embedHostAllowlist(): string[] {
  // NEXT_PUBLIC_ because `resolveAction()` needs this in the browser: the
  // hotspot decides between a modal and a redirect on the client. A non-public
  // var would be `undefined` there and every extra host would silently fall
  // back to opening in a new tab. The list is not a secret.
  const extra = (
    process.env.NEXT_PUBLIC_SCENE_EMBED_HOSTS ??
    process.env.SCENE_EMBED_HOSTS ??
    ''
  )
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_EMBED_HOSTS, ...extra];
}

/** Relative paths are ours; absolute URLs must use a safe protocol. */
export function isSafeUrl(value: string): boolean {
  const v = (value ?? '').trim();
  if (!v) return false;
  if (v.startsWith('/') && !v.startsWith('//')) return true;
  try {
    return SAFE_PROTOCOLS.has(new URL(v).protocol);
  } catch {
    return false;
  }
}

/** Is this URL allowed to be framed? Relative URLs always are. */
export function isEmbeddable(value: string): boolean {
  const v = (value ?? '').trim();
  if (v.startsWith('/') && !v.startsWith('//')) return true;
  try {
    const host = new URL(v).hostname.replace(/^www\./, '').toLowerCase();
    return embedHostAllowlist().some(
      allowed => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

const safeUrl = z
  .string()
  .min(1)
  .refine(isSafeUrl, { message: 'unsafe or malformed URL' });

/**
 * Content/media fields: no relative-path escape hatch.
 *
 * `safeUrl` deliberately allows a leading `/` because navigation hrefs
 * (`link.href`, `banner.cta.href`) point at real pages on this app. Anything
 * that is actually rendered or downloaded as a file — a PDF, an image, a
 * video, a photo — has no local counterpart to resolve a relative path
 * against, so it must be an absolute, safe-protocol URL: a Supabase Storage
 * object or an external host. The only exception in the whole schema is
 * `stage.background.src`, which keeps `safeUrl`.
 */
const mediaUrl = z
  .string()
  .min(1)
  .refine(
    v => {
      try {
        return SAFE_PROTOCOLS.has(new URL(v.trim()).protocol);
      } catch {
        return false;
      }
    },
    {
      message:
        'must be an absolute URL (Supabase Storage or external) — relative paths are not served',
    },
  );

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

const pct = z.number().min(-20).max(120);

const freeformPlacement = z.object({
  layout: z.literal('freeform'),
  x: pct,
  y: pct,
  w: z.number().min(0.5).max(120),
  h: z.number().min(0.5).max(120),
  rotate: z.number().min(-180).max(180).optional(),
  z: z.number().int().min(-20).max(50).optional(),
  shape: z.enum(['rect', 'ellipse']).optional(),
});

const gridPlacement = z.object({
  layout: z.literal('grid'),
  col: z.number().int().min(0),
  row: z.number().int().min(0),
  colSpan: z.number().int().min(1).optional(),
  rowSpan: z.number().int().min(1).optional(),
});

const panoramaPlacement = z.object({
  layout: z.literal('panorama'),
  yaw: z.number(),
  pitch: z.number(),
  size: z.number().positive(),
});

export const placementSchema = z.discriminatedUnion('layout', [
  freeformPlacement,
  gridPlacement,
  panoramaPlacement,
]);

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

const downloadConfig = z.object({
  href: mediaUrl,
  filename: z.string().optional(),
  sizeLabel: z.string().optional(),
  requiresLead: z.boolean().optional(),
});

const gateConfig = z.object({
  formId: z.string().min(1),
  headline: z.string().min(1),
  rememberKey: z.string().optional(),
});

const itemBase = {
  id: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().optional(),
  gated: gateConfig.optional(),
  download: downloadConfig.optional(),
};

const pageImage = z.object({
  src: mediaUrl,
  width: z.number().positive(),
  height: z.number().positive(),
  alt: z.string().optional(),
  thumb: mediaUrl.optional(),
});

const itemKinds = [
  z.object({ ...itemBase, kind: z.literal('auto'), src: mediaUrl, as: z.string().optional(), poster: mediaUrl.optional() }),
  z.object({ ...itemBase, kind: z.literal('pdf'), src: mediaUrl, initialPage: z.number().int().positive().optional() }),
  z.object({ ...itemBase, kind: z.literal('pages'), pages: z.array(pageImage).min(1), pageLayout: z.enum(['scroll', 'spread']).optional() }),
  z.object({ ...itemBase, kind: z.literal('flipbook'), pages: z.array(pageImage).min(1), cover: z.enum(['single', 'spread']).optional() }),
  z.object({ ...itemBase, kind: z.literal('embed'), src: safeUrl, allow: z.string().optional(), sandbox: z.string().optional() }),
  z.object({ ...itemBase, kind: z.literal('image'), src: mediaUrl, alt: z.string().optional(), width: z.number().positive().optional(), height: z.number().positive().optional() }),
  z.object({ ...itemBase, kind: z.literal('scene'), targetId: z.string().min(1), transition: z.enum(['zoom', 'fade', 'push']).optional(), preview: mediaUrl.optional() }),
  z.object({ ...itemBase, kind: z.literal('link'), href: safeUrl, target: z.enum(['_blank', '_self']).optional() }),
  z.object({ ...itemBase, kind: z.literal('download'), download: downloadConfig }),
  z.object({ ...itemBase, kind: z.literal('video'), src: mediaUrl, poster: mediaUrl.optional(), autoplayMuted: z.boolean().optional(),
    captions: z.array(z.object({ src: mediaUrl, srclang: z.string(), label: z.string() })).optional() }),
  z.object({ ...itemBase, kind: z.literal('audio'), src: mediaUrl, transcript: z.string().optional(), waveform: mediaUrl.optional() }),
  z.object({ ...itemBase, kind: z.literal('card'),
    person: z.object({
      name: z.string().min(1),
      title: z.string(),
      photo: mediaUrl.optional(),
      email: z.string().email().optional(),
      phones: z.array(z.object({ label: z.string(), number: z.string() })).optional(),
      address: z.string().optional(),
      website: safeUrl.optional(),
    }),
    social: z.array(z.object({ network: z.string(), href: safeUrl })).optional(),
    vcard: safeUrl.optional() }),
  z.object({ ...itemBase, kind: z.literal('letter'), bodyMdx: z.string().min(1), letterheadSrc: mediaUrl.optional(),
    signature: z.object({ name: z.string(), title: z.string(), image: mediaUrl.optional() }).optional() }),
  z.object({ ...itemBase, kind: z.literal('form'), formId: z.string().min(1), provider: z.enum(['internal', 'ghl']).optional(), height: z.number().positive().optional() }),
] as const;

export const sceneItemSchema = z.discriminatedUnion('kind', [...itemKinds]);

/** Every item is placed inline — no library reference indirection. */
export const placedSchema = z.intersection(
  sceneItemSchema,
  z.object({ placement: placementSchema }),
);

/* ------------------------------------------------------------------ *
 * Scene
 * ------------------------------------------------------------------ */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const sceneRouteSchema = z.object({
  site: z.enum(['asat', 'aspire']),
  slug: z.string().min(1).max(80).regex(SLUG, 'lowercase letters, digits and single hyphens only'),
  subdomain: z
    .string()
    .min(1)
    .max(63)
    .regex(SLUG, 'lowercase letters, digits and single hyphens only')
    .optional(),
  slugHistory: z.array(z.string().regex(SLUG)).optional(),
  canonical: z.boolean().optional(),
  indexable: z.boolean().optional(),
  status: z.enum(['draft', 'live', 'archived']),
  publishedAt: z.string().optional(),
});

export const sceneConfigSchema = z.object({
  id: z.string().min(1),
  routes: z.array(sceneRouteSchema).min(1),
  parent: z.string().optional(),
  preset: z.enum(['desk', 'office', 'board', 'soc', 'workshop', 'custom']),
  layout: z.enum(['freeform', 'grid', 'panorama']),
  audience: z.object({ nameplate: z.string().min(1), prefix: z.string().optional() }),
  stage: z.object({
    background: z.object({
      src: safeUrl,
      width: z.number().positive(),
      height: z.number().positive(),
      alt: z.string(),
    }).optional(),
    columns: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
    theme: z.enum(['walnut', 'slate', 'light', 'dark']).optional(),
    nameplate: placementSchema.optional(),
  }),
  letterBrand: z
    .object({
      headerSrc: mediaUrl.optional(),
      footerSrc: mediaUrl.optional(),
      footerText: z.string().optional(),
    })
    .optional(),
  chrome: z.enum(['full', 'minimal', 'none']).optional(),
  banner: z.object({
    text: z.string(),
    cta: z.object({ label: z.string(), href: safeUrl }),
  }).optional(),
  autoOpen: z.string().optional(),
  items: z.array(placedSchema),
  seo: z.object({
    title: z.string().min(1),
    description: z.string(),
    ogImage: mediaUrl.optional(),
    schema: z.enum(['WebPage', 'Course', 'Product', 'CollectionPage']).optional(),
  }),
  tracking: z.object({ campaign: z.string(), source: z.string().optional() }).optional(),
});

export const sceneCollectionSchema = z.array(sceneConfigSchema);

/* ------------------------------------------------------------------ *
 * Lenient parsing
 * ------------------------------------------------------------------ */

export interface ParseReport {
  /** Scenes that validated. */
  scenes: z.infer<typeof sceneConfigSchema>[];
  /** Human-readable problems, for logs and the CI validator. */
  issues: string[];
  /** Items dropped from otherwise-valid scenes. */
  droppedItems: number;
}

function isValidMediaUrl(value: unknown): value is string {
  return typeof value === 'string' && mediaUrl.safeParse(value).success;
}

/**
 * Legacy rows (saved before `download.href` was kept in sync with `src`) can
 * have a perfectly good absolute `src` next to a stale relative
 * `download.href`. Rather than dropping an otherwise-valid item over its
 * redundant download link, repoint `download.href` at `src` — the same
 * self-healing the Setup editor now does on every re-upload.
 */
function repairDownloadHref(obj: Record<string, unknown>): Record<string, unknown> {
  const download = obj.download;
  if (
    download &&
    typeof download === 'object' &&
    !isValidMediaUrl((download as Record<string, unknown>).href) &&
    isValidMediaUrl(obj.src)
  ) {
    return { ...obj, download: { ...(download as Record<string, unknown>), href: obj.src } };
  }
  return obj;
}

const OPTIONAL_ITEM_MEDIA_KEYS = ['poster', 'thumb', 'preview', 'waveform'] as const;

/**
 * The core content of an item (`src`, `bodyMdx`, `person.name`, …) is what
 * makes it worth keeping. A decorative sidekick — a video poster, a letter's
 * letterhead graphic, a contact's photo — being a stale relative path is not
 * a reason to drop a perfectly good letter or video. Strip the bad decorative
 * field and keep the item; only the fields that are themselves the rendered
 * content (`src`, pages, etc.) can still legitimately fail validation and
 * take the item down.
 */
function repairItemMedia(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  let obj = { ...(raw as Record<string, unknown>) };

  obj = repairDownloadHref(obj);

  for (const key of OPTIONAL_ITEM_MEDIA_KEYS) {
    if (obj[key] !== undefined && !isValidMediaUrl(obj[key])) {
      delete obj[key];
    }
  }

  if (obj.letterheadSrc !== undefined && !isValidMediaUrl(obj.letterheadSrc)) {
    delete obj.letterheadSrc;
  }

  if (obj.person && typeof obj.person === 'object') {
    const person = { ...(obj.person as Record<string, unknown>) };
    if (person.photo !== undefined && !isValidMediaUrl(person.photo)) delete person.photo;
    obj.person = person;
  }

  if (obj.signature && typeof obj.signature === 'object') {
    const signature = { ...(obj.signature as Record<string, unknown>) };
    if (signature.image !== undefined && !isValidMediaUrl(signature.image)) delete signature.image;
    obj.signature = signature;
  }

  if (Array.isArray(obj.captions)) {
    obj.captions = (obj.captions as unknown[]).filter(
      c => c && typeof c === 'object' && isValidMediaUrl((c as Record<string, unknown>).src),
    );
  }

  if (Array.isArray(obj.pages)) {
    obj.pages = (obj.pages as unknown[]).map(p => {
      if (!p || typeof p !== 'object') return p;
      const page = { ...(p as Record<string, unknown>) };
      if (page.thumb !== undefined && !isValidMediaUrl(page.thumb)) delete page.thumb;
      return page;
    });
  }

  return obj;
}

/**
 * Scene-level fields (not inside `items`) that are optional and decorative
 * — an Open Graph preview image, a letter header/footer graphic — must not
 * take the whole scene down over one stale relative value. Strip them
 * instead, same salvage philosophy as items.
 */
function sanitizeSceneMedia(raw: unknown, id: string, issues: string[]): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  const seo = obj.seo;
  if (seo && typeof seo === 'object') {
    const seoObj = seo as Record<string, unknown>;
    if (seoObj.ogImage !== undefined && !isValidMediaUrl(seoObj.ogImage)) {
      issues.push(`${id}: seo.ogImage — dropped (not an absolute URL)`);
      const next = { ...seoObj };
      delete next.ogImage;
      obj.seo = next;
    }
  }

  const letterBrand = obj.letterBrand;
  if (letterBrand && typeof letterBrand === 'object') {
    const next = { ...(letterBrand as Record<string, unknown>) };
    let changed = false;
    for (const key of ['headerSrc', 'footerSrc'] as const) {
      if (next[key] !== undefined && !isValidMediaUrl(next[key])) {
        issues.push(`${id}: letterBrand.${key} — dropped (not an absolute URL)`);
        delete next[key];
        changed = true;
      }
    }
    if (changed) obj.letterBrand = next;
  }

  return obj;
}

/**
 * Parse a collection, keeping what is usable.
 *
 * A CMS will eventually contain a half-finished scene. Refusing to serve
 * anything because of it is the wrong trade: drop the bad item, drop the bad
 * scene, log loudly, and keep the rest of the campaign live.
 */
export function parseScenes(input: unknown): ParseReport {
  const issues: string[] = [];
  let droppedItems = 0;

  if (!Array.isArray(input)) {
    return { scenes: [], issues: ['source did not return an array'], droppedItems: 0 };
  }

  const scenes: z.infer<typeof sceneConfigSchema>[] = [];

  for (const [i, raw] of input.entries()) {
    const id =
      raw && typeof raw === 'object' && 'id' in raw
        ? String((raw as { id: unknown }).id)
        : `#${i}`;

    // Salvage a scene whose items are partly broken by repairing/filtering them first.
    let candidate = raw;
    if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
      const items = (raw as { items: unknown[] }).items;
      const kept: unknown[] = [];
      for (const original of items) {
        const item = repairItemMedia(original);
        const ok = placedSchema.safeParse(item).success;
        if (!ok) {
          droppedItems += 1;
          const itemId =
            item && typeof item === 'object' && 'id' in item
              ? String((item as { id: unknown }).id)
              : 'unknown';
          issues.push(`${id}: dropped invalid item "${itemId}"`);
          continue;
        }
        kept.push(item);
      }
      candidate = { ...(raw as object), items: kept };
    }

    candidate = sanitizeSceneMedia(candidate, id, issues);

    const result = sceneConfigSchema.safeParse(candidate);
    if (result.success) {
      scenes.push(result.data);
    } else {
      for (const issue of result.error.issues.slice(0, 6)) {
        issues.push(`${id}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
      }
    }
  }

  return { scenes, issues, droppedItems };
}

export type ValidatedScene = z.infer<typeof sceneConfigSchema>;

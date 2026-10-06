'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { Button } from 'components/ui/Button';
import { cn } from 'components/ui/utils';
import {
  saveScene,
  sceneUrl,
  uploadSceneMedia,
  urlFoldTitle,
  withBrandRoute,
  type BrandInfo,
} from 'scene/setup/client';
import type {
  CardItem,
  FreeformPlacement,
  Placed,
  PlacedInline,
  SceneConfig,
  SceneItemKind,
  SceneRoute,
  SiteKey,
} from 'scene/types';

const FIELD =
  'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';
const LABEL = 'mb-1 block text-xs font-medium text-muted-foreground';
const FOLD_SUMMARY =
  'cursor-pointer text-sm font-semibold uppercase tracking-wider text-muted-foreground';

const CARD_SOCIAL_KNOWN = new Set(['linkedin', 'email']);

function cardSocialHref(
  social: CardItem['social'] | undefined,
  network: string,
): string {
  const key = network.toLowerCase();
  return social?.find(s => s.network.toLowerCase() === key)?.href ?? '';
}

function withCardSocial<T extends CardItem>(
  item: T,
  network: string,
  href: string,
): T {
  const key = network.toLowerCase();
  const rest = (item.social ?? []).filter(s => s.network.toLowerCase() !== key);
  const trimmed = href.trim();
  const social = trimmed
    ? [
        ...rest,
        {
          network:
            key === 'linkedin' ? 'linkedin' : key === 'email' ? 'email' : network,
          href: trimmed,
        },
      ]
    : rest;
  return { ...item, social: social.length ? social : undefined };
}

function CardSocialExtras<T extends CardItem>({
  item,
  onChange,
}: {
  item: T;
  onChange: (item: T) => void;
}) {
  const [network, setNetwork] = useState('');
  const [href, setHref] = useState('');
  const known = (item.social ?? []).filter(s =>
    CARD_SOCIAL_KNOWN.has(s.network.toLowerCase()),
  );
  const extras = (item.social ?? []).filter(
    s => !CARD_SOCIAL_KNOWN.has(s.network.toLowerCase()),
  );

  function setExtras(next: { network: string; href: string }[]) {
    const social = [...known, ...next.filter(s => s.network.trim() && s.href.trim())];
    onChange({ ...item, social: social.length ? social : undefined });
  }

  return (
    <div className="space-y-2">
      {extras.map((s, i) => (
        <div key={`${s.network}-${s.href}-${i}`} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className={LABEL}>Network</label>
            <input className={FIELD} value={s.network} readOnly />
          </div>
          <div className="min-w-0 flex-[1.4]">
            <label className={LABEL}>Href</label>
            <input className={FIELD} value={s.href} readOnly />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExtras(extras.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>Extra network</label>
          <input
            className={FIELD}
            value={network}
            placeholder="x, github…"
            onChange={e => setNetwork(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL}>Extra href</label>
          <input
            className={FIELD}
            value={href}
            placeholder="https://…"
            onChange={e => setHref(e.target.value)}
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!network.trim() || !href.trim()}
        onClick={() => {
          setExtras([...extras, { network: network.trim(), href: href.trim() }]);
          setNetwork('');
          setHref('');
        }}
      >
        Add link
      </Button>
    </div>
  );
}

function FileField({
  sceneId,
  kind,
  label,
  value,
  onUploaded,
}: {
  sceneId: string;
  kind: 'image' | 'pdf' | 'video' | 'audio' | 'file';
  label: string;
  value?: string;
  onUploaded: (url: string, file: File) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const uploadKind =
        kind === 'file'
          ? /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
            ? 'pdf'
            : /^video\//.test(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name)
              ? 'video'
              : /^audio\//.test(file.type) || /\.(mp3|wav|m4a|aac)$/i.test(file.name)
                ? 'audio'
                : 'image'
          : kind;
      const { url } = await uploadSceneMedia(sceneId, uploadKind, file);
      onUploaded(url, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  const accept =
    kind === 'pdf'
      ? 'application/pdf'
      : kind === 'image'
        ? 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'
        : kind === 'video'
          ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
          : kind === 'audio'
            ? 'audio/mpeg,audio/wav,audio/mp4,.mp3,.wav,.m4a'
            : 'application/pdf,image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,audio/mpeg,.mp4,.webm,.mp3,.wav,.m4a,.pdf';

  return (
    <div>
      <label className={LABEL}>{label}</label>
      {value ? (
        <p className="mb-1 truncate font-mono text-[11px] text-muted-foreground">{value}</p>
      ) : null}
      <input
        type="file"
        accept={accept}
        disabled={busy}
        className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1"
        onChange={onPick}
      />
      {busy && <p className="mt-1 text-xs text-muted-foreground">Uploading…</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="text-[10px] text-muted-foreground transition-transform group-open:rotate-90">
          ▶
        </span>
        <span className={FOLD_SUMMARY}>{title}</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

const KINDS = [
  'auto',
  'pdf',
  'video',
  'image',
  'audio',
  'embed',
  'link',
  'letter',
  'card',
  'download',
  'scene',
] as const satisfies readonly SceneItemKind[];

type SetupKind = (typeof KINDS)[number];

function isSetupKind(kind: string): kind is SetupKind {
  return (KINDS as readonly string[]).includes(kind);
}

function placedKey(item: Placed, i: number) {
  return `${item.id}:${i}`;
}

function asFreeform(p: Placed['placement']): FreeformPlacement {
  if (p.layout === 'freeform') return p;
  return { layout: 'freeform', x: 40, y: 40, w: 16, h: 16 };
}

function coerce(item: PlacedInline, kind: SetupKind): PlacedInline {
  const base = {
    id: item.id,
    label: item.label,
    hint: item.hint,
    download: item.download,
    placement: item.placement,
  };
  const src = 'src' in item && typeof item.src === 'string' ? item.src : '/';
  const href = 'href' in item && typeof item.href === 'string' ? item.href : src;
  if (kind === 'link') {
    return { ...base, kind, href };
  }
  if (kind === 'scene') {
    return {
      ...base,
      kind,
      targetId: 'targetId' in item ? item.targetId : '',
    };
  }
  if (kind === 'download') {
    return { ...base, kind, download: item.download ?? { href: href || '/' } };
  }
  if (kind === 'letter') {
    return {
      ...base,
      kind,
      bodyMdx:
        'bodyMdx' in item && item.bodyMdx ? item.bodyMdx : 'Dear {{firstName}},\n\n',
      signature: 'signature' in item ? item.signature : undefined,
    };
  }
  if (kind === 'video') {
    return {
      ...base,
      kind,
      src,
      poster: 'poster' in item ? item.poster : undefined,
    };
  }
  if (kind === 'audio') {
    return {
      ...base,
      kind,
      src,
      transcript: 'transcript' in item ? item.transcript : undefined,
    };
  }
  if (kind === 'image') {
    return {
      ...base,
      kind,
      src,
      alt: 'alt' in item && typeof item.alt === 'string' ? item.alt : item.label,
    };
  }
  if (kind === 'card') {
    const person =
      item.kind === 'card'
        ? item.person
        : { name: item.label, title: '', photo: undefined };
    return {
      ...base,
      kind,
      person: {
        name: person.name || item.label,
        title: person.title ?? '',
        photo: person.photo,
        email: 'email' in person ? person.email : undefined,
        phones: 'phones' in person ? person.phones : undefined,
        address: 'address' in person ? person.address : undefined,
        website: 'website' in person ? person.website : undefined,
      },
      vcard: item.kind === 'card' ? item.vcard : undefined,
      social: item.kind === 'card' ? item.social : undefined,
    };
  }
  return { ...base, kind, src };
}

export function Editor({
  scene: initial,
  brands,
  all,
}: {
  scene: SceneConfig;
  brands: BrandInfo[];
  all: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [scene, setScene] = useState<SceneConfig>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const live = scene.routes.find(r => r.status === 'live') ?? scene.routes[0];

  const patch = useCallback((fn: (s: SceneConfig) => SceneConfig) => {
    setScene(s => fn(s));
  }, []);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const next = await saveScene(scene);
      setScene(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  function addItem() {
    const id = `item-${crypto.randomUUID().slice(0, 8)}`;
    const item: PlacedInline = {
      id,
      kind: 'auto',
      label: 'New item',
      src: '/',
      placement: { layout: 'freeform', x: 40, y: 40, w: 16, h: 16 },
    };
    const nextIndex = scene.items.length;
    patch(s => ({ ...s, items: [...s.items, item] }));
    setSelected(`${id}:${nextIndex}`);
  }

  function updateItem(index: number, next: Placed) {
    patch(s => ({
      ...s,
      items: s.items.map((it, i) => (i === index ? next : it)),
    }));
  }

  function removeItem(index: number) {
    patch(s => ({ ...s, items: s.items.filter((_, i) => i !== index) }));
    setSelected(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {scene.audience.nameplate}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{scene.id}</p>
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/${live.slug}?setup=${encodeURIComponent(scene.id)}`}>View</Link>
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? 'Saving' : 'Save'}
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-8">
          <UrlSection scene={scene} brands={brands} onChange={setScene} />
          <AnatomySection scene={scene} all={all} onChange={setScene} />
          <LetterBrandSection scene={scene} onChange={setScene} />
          <ItemsSection
            scene={scene}
            all={all}
            selected={selected}
            onSelect={setSelected}
            onAdd={addItem}
            onUpdate={updateItem}
            onRemove={removeItem}
          />
        </div>
        <StagePreview
          scene={scene}
          selected={selected}
          onSelect={setSelected}
          onMove={(index, placement) => {
            const item = scene.items[index];
            if (!item) return;
            updateItem(index, { ...item, placement });
          }}
        />
      </div>
    </div>
  );
}

function UrlSection({
  scene,
  brands,
  onChange,
}: {
  scene: SceneConfig;
  brands: BrandInfo[];
  onChange: (s: SceneConfig) => void;
}) {
  function setRoute(site: SiteKey, patch: Partial<SceneRoute> | null) {
    const rest = scene.routes.filter(r => r.site !== site);
    const existing = scene.routes.find(r => r.site === site);
    const inheritedSub =
      existing?.subdomain ?? scene.routes.find(r => r.subdomain)?.subdomain;
    const routes =
      patch === null
        ? rest
        : [
            ...rest,
            {
              site,
              slug:
                existing?.slug ??
                scene.routes[0]?.slug ??
                scene.id.replace(/^s-/, 'scene-').toLowerCase(),
              status: 'draft' as const,
              subdomain: inheritedSub,
              ...existing,
              ...patch,
            },
          ];
    onChange({ ...scene, routes: routes.length ? routes : scene.routes });
  }

  return (
    <Fold title={urlFoldTitle(scene, brands)}>
      <div className="space-y-4 rounded-xl border bg-card p-4">
        {brands.map(brand => {
          const route = scene.routes.find(r => r.site === brand.key);
          return (
            <div key={brand.key} className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(route)}
                  onChange={e => onChange(withBrandRoute(scene, brand.key, e.target.checked))}
                />
                {brand.name}
              </label>
              {route && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={LABEL}>Subdomain</label>
                      <input
                        className={FIELD}
                        placeholder="acme"
                        value={route.subdomain ?? ''}
                        onChange={e =>
                          setRoute(brand.key, {
                            subdomain:
                              e.target.value
                                .trim()
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, '') || undefined,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Slug</label>
                      <input
                        className={FIELD}
                        value={route.slug}
                        onChange={e =>
                          setRoute(brand.key, {
                            slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Status</label>
                      <select
                        className={FIELD}
                        value={route.status}
                        onChange={e =>
                          setRoute(brand.key, {
                            status: e.target.value as SceneRoute['status'],
                          })
                        }
                      >
                        <option value="draft">draft</option>
                        <option value="live">live</option>
                        <option value="archived">archived</option>
                      </select>
                    </div>
                  </div>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {sceneUrl(brand, route.slug, route.subdomain)}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Fold>
  );
}

function AnatomySection({
  scene,
  all,
  onChange,
}: {
  scene: SceneConfig;
  all: { id: string; label: string }[];
  onChange: (s: SceneConfig) => void;
}) {
  const bg = scene.stage.background;

  return (
    <Fold title="Anatomy">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div>
          <label className={LABEL}>Nameplate</label>
          <input
            className={FIELD}
            value={scene.audience.nameplate}
            onChange={e =>
              onChange({
                ...scene,
                audience: { ...scene.audience, nameplate: e.target.value },
                seo: { ...scene.seo, title: scene.seo.title === scene.audience.nameplate ? e.target.value : scene.seo.title },
              })
            }
          />
        </div>
        <div>
          <label className={LABEL}>Prefix</label>
          <input
            className={FIELD}
            value={scene.audience.prefix ?? ''}
            onChange={e =>
              onChange({
                ...scene,
                audience: { ...scene.audience, prefix: e.target.value || undefined },
              })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Preset</label>
            <select
              className={FIELD}
              value={scene.preset}
              onChange={e =>
                onChange({ ...scene, preset: e.target.value as SceneConfig['preset'] })
              }
            >
              {['desk', 'office', 'board', 'soc', 'workshop', 'custom'].map(p => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Parent</label>
            <select
              className={FIELD}
              value={scene.parent ?? ''}
              onChange={e =>
                onChange({ ...scene, parent: e.target.value || undefined })
              }
            >
              <option value="">None</option>
              {all
                .filter(s => s.id !== scene.id)
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <FileField
          sceneId={scene.id}
          kind="image"
          label="Background"
          value={bg?.src}
          onUploaded={src =>
            onChange({
              ...scene,
              stage: {
                ...scene.stage,
                background: {
                  src,
                  width: bg?.width ?? 1536,
                  height: bg?.height ?? 1024,
                  alt: bg?.alt || scene.audience.nameplate,
                },
              },
            })
          }
        />
        {bg && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Width</label>
              <input
                type="number"
                className={FIELD}
                value={bg.width}
                onChange={e =>
                  onChange({
                    ...scene,
                    stage: {
                      ...scene.stage,
                      background: { ...bg, width: Number(e.target.value) || 1 },
                    },
                  })
                }
              />
            </div>
            <div>
              <label className={LABEL}>Height</label>
              <input
                type="number"
                className={FIELD}
                value={bg.height}
                onChange={e =>
                  onChange({
                    ...scene,
                    stage: {
                      ...scene.stage,
                      background: { ...bg, height: Number(e.target.value) || 1 },
                    },
                  })
                }
              />
            </div>
          </div>
        )}
        <div>
          <label className={LABEL}>SEO title</label>
          <input
            className={FIELD}
            value={scene.seo.title}
            onChange={e => onChange({ ...scene, seo: { ...scene.seo, title: e.target.value } })}
          />
        </div>
        <div>
          <label className={LABEL}>SEO description</label>
          <textarea
            className={cn(FIELD, 'min-h-[4.5rem]')}
            value={scene.seo.description}
            onChange={e =>
              onChange({ ...scene, seo: { ...scene.seo, description: e.target.value } })
            }
          />
        </div>
        <div>
          <label className={LABEL}>Banner text</label>
          <input
            className={FIELD}
            value={scene.banner?.text ?? ''}
            onChange={e =>
              onChange({
                ...scene,
                banner: e.target.value
                  ? {
                      text: e.target.value,
                      cta: scene.banner?.cta ?? { label: 'Learn more', href: '/' },
                    }
                  : undefined,
              })
            }
          />
        </div>
      </div>
    </Fold>
  );
}

function LetterBrandSection({
  scene,
  onChange,
}: {
  scene: SceneConfig;
  onChange: (s: SceneConfig) => void;
}) {
  const brand = scene.letterBrand;

  return (
    <Fold title="Letter header & footer (all letters)">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Shown on every letter in this scene and in letter PDF downloads.
        </p>
        <FileField
          sceneId={scene.id}
          kind="image"
          label="Header image"
          value={brand?.headerSrc}
          onUploaded={src =>
            onChange({
              ...scene,
              letterBrand: { ...brand, headerSrc: src },
            })
          }
        />
        <div>
          <label className={LABEL}>Header image URL</label>
          <input
            className={FIELD}
            value={brand?.headerSrc ?? ''}
            placeholder="/logo.png or https://…"
            onChange={e =>
              onChange({
                ...scene,
                letterBrand: {
                  ...brand,
                  headerSrc: e.target.value.trim() || undefined,
                },
              })
            }
          />
        </div>
        <FileField
          sceneId={scene.id}
          kind="image"
          label="Footer image"
          value={brand?.footerSrc}
          onUploaded={src =>
            onChange({
              ...scene,
              letterBrand: { ...brand, footerSrc: src },
            })
          }
        />
        <div>
          <label className={LABEL}>Footer image URL</label>
          <input
            className={FIELD}
            value={brand?.footerSrc ?? ''}
            placeholder="https://…"
            onChange={e =>
              onChange({
                ...scene,
                letterBrand: {
                  ...brand,
                  footerSrc: e.target.value.trim() || undefined,
                },
              })
            }
          />
        </div>
        <div>
          <label className={LABEL}>Footer text</label>
          <textarea
            className={cn(FIELD, 'min-h-[3.5rem]')}
            value={brand?.footerText ?? ''}
            placeholder="AspireTSS · address · confidentiality line"
            onChange={e =>
              onChange({
                ...scene,
                letterBrand: {
                  ...brand,
                  footerText: e.target.value || undefined,
                },
              })
            }
          />
        </div>
        {(brand?.headerSrc || brand?.footerSrc || brand?.footerText) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...scene, letterBrand: undefined })}
          >
            Clear letter brand
          </Button>
        )}
      </div>
    </Fold>
  );
}

function ItemsSection({
  scene,
  all,
  selected,
  onSelect,
  onAdd,
  onUpdate,
  onRemove,
}: {
  scene: SceneConfig;
  all: { id: string; label: string }[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  onAdd: () => void;
  onUpdate: (index: number, item: Placed) => void;
  onRemove: (index: number) => void;
}) {
  const index = scene.items.findIndex((it, i) => placedKey(it, i) === selected);
  const item = index >= 0 ? scene.items[index] : null;

  return (
    <section>
      <details className="group mb-3">
        <summary className="flex cursor-pointer items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="text-[10px] text-muted-foreground transition-transform group-open:rotate-90">
            ▶
          </span>
          <span className={FOLD_SUMMARY}>Items ({scene.items.length})</span>
          <Button
            size="sm"
            variant="outline"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onAdd();
            }}
          >
            Add item
          </Button>
        </summary>
        <ul className="mt-3 space-y-1">
            {scene.items.map((it, i) => {
              const key = placedKey(it, i);
              const label = it.label;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onSelect(key)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left text-sm',
                      selected === key
                        ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]/10'
                        : 'bg-card hover:border-white/20',
                    )}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
        </ul>
      </details>

      {item && index >= 0 && (
        <ItemFields
          sceneId={scene.id}
          item={item}
          order={index}
          all={all}
          onChange={next => onUpdate(index, next)}
          onRemove={() => onRemove(index)}
        />
      )}
    </section>
  );
}

function ItemFields({
  sceneId,
  item,
  order,
  all,
  onChange,
  onRemove,
}: {
  sceneId: string;
  item: Placed;
  order: number;
  all: { id: string; label: string }[];
  onChange: (item: Placed) => void;
  onRemove: () => void;
}) {
  const place = asFreeform(item.placement);
  const setPlace = (patch: Partial<FreeformPlacement>) =>
    onChange({ ...item, placement: { ...place, ...patch } });

  const kind = item.kind;

  return (
    <div className="mt-4 space-y-3 rounded-xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>Kind</label>
          <select
            className={FIELD}
            value={kind}
            onChange={e => {
              const next = e.target.value;
              if (isSetupKind(next)) onChange(coerce(item, next));
            }}
          >
            {KINDS.map(k => (
              <option key={k}>{k}</option>
            ))}
            {!isSetupKind(item.kind) && <option value={item.kind}>{item.kind}</option>}
          </select>
        </div>
        <div>
          <label className={LABEL}>Label</label>
          <input
            className={FIELD}
            value={item.label}
            onChange={e => onChange({ ...item, label: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className={LABEL}>Hint</label>
        <input
          className={FIELD}
          value={item.hint ?? ''}
          onChange={e => onChange({ ...item, hint: e.target.value || undefined })}
        />
      </div>
      <PlaceFields place={place} order={order} onChange={setPlace} />
      {item.kind === 'letter' && (
        <>
          <div>
            <label className={LABEL}>Letter body</label>
            <textarea
              className={cn(FIELD, 'min-h-[10rem]')}
              value={item.bodyMdx}
              onChange={e => onChange({ ...item, bodyMdx: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Signature name</label>
              <input
                className={FIELD}
                value={item.signature?.name ?? ''}
                onChange={e =>
                  onChange({
                    ...item,
                    signature: {
                      name: e.target.value,
                      title: item.signature?.title ?? '',
                      image: item.signature?.image,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className={LABEL}>Signature title</label>
              <input
                className={FIELD}
                value={item.signature?.title ?? ''}
                onChange={e =>
                  onChange({
                    ...item,
                    signature: {
                      name: item.signature?.name ?? '',
                      title: e.target.value,
                      image: item.signature?.image,
                    },
                  })
                }
              />
            </div>
          </div>
        </>
      )}
      {(item.kind === 'pdf' || item.kind === 'image') && (
        <FileField
          sceneId={sceneId}
          kind={item.kind}
          label={item.kind === 'pdf' ? 'PDF' : 'Image'}
          value={item.src}
          onUploaded={src =>
            onChange({
              ...item,
              src,
              // Keep the separate "Download file" field (if present) from
              // drifting out of sync with the newly-uploaded src — a stale
              // download.href next to a fresh src is exactly what caused
              // PDFs to 404 after a re-upload.
              download: item.download ? { ...item.download, href: src } : item.download,
            })
          }
        />
      )}
      {item.kind === 'auto' && (
        <FileField
          sceneId={sceneId}
          kind="file"
          label="File"
          value={item.src}
          onUploaded={src => onChange({ ...item, src })}
        />
      )}
      {item.kind === 'audio' && (
        <FileField
          sceneId={sceneId}
          kind="audio"
          label="Audio"
          value={item.src}
          onUploaded={src => onChange({ ...item, src })}
        />
      )}
      {item.kind === 'embed' && (
        <div>
          <label className={LABEL}>Page URL</label>
          <input
            className={FIELD}
            value={item.src}
            placeholder="https://"
            onChange={e => onChange({ ...item, src: e.target.value })}
          />
        </div>
      )}
      {item.kind === 'video' && (
        <>
          <FileField
            sceneId={sceneId}
            kind="video"
            label="Video file"
            value={item.src}
            onUploaded={src => onChange({ ...item, src })}
          />
          <div>
            <label className={LABEL}>Or YouTube / Vimeo URL</label>
            <input
              className={FIELD}
              value={
                /^https?:\/\//i.test(item.src) && !item.src.includes('/storage/v1/')
                  ? item.src
                  : ''
              }
              placeholder="https://www.youtube.com/watch?v="
              onChange={e => {
                const next = e.target.value.trim();
                if (!next || /^https?:\/\//i.test(next)) {
                  onChange({ ...item, src: next });
                }
              }}
            />
          </div>
          <FileField
            sceneId={sceneId}
            kind="image"
            label="Poster"
            value={item.poster}
            onUploaded={poster => onChange({ ...item, poster })}
          />
        </>
      )}
      {item.kind === 'image' && (
        <div>
          <label className={LABEL}>Alt</label>
          <input
            className={FIELD}
            value={item.alt ?? ''}
            onChange={e => onChange({ ...item, alt: e.target.value || undefined })}
          />
        </div>
      )}
      {item.kind === 'audio' && (
        <div>
          <label className={LABEL}>Transcript</label>
          <textarea
            className={cn(FIELD, 'min-h-[8rem]')}
            value={item.transcript ?? ''}
            onChange={e => onChange({ ...item, transcript: e.target.value || undefined })}
          />
        </div>
      )}
      {item.kind === 'card' && (
        <>
          <FileField
            sceneId={sceneId}
            kind="image"
            label="Photo"
            value={item.person.photo}
            onUploaded={photo =>
              onChange({ ...item, person: { ...item.person, photo } })
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Name</label>
              <input
                className={FIELD}
                value={item.person.name}
                onChange={e =>
                  onChange({ ...item, person: { ...item.person, name: e.target.value } })
                }
              />
            </div>
            <div>
              <label className={LABEL}>Title</label>
              <input
                className={FIELD}
                value={item.person.title}
                onChange={e =>
                  onChange({ ...item, person: { ...item.person, title: e.target.value } })
                }
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input
              className={FIELD}
              type="email"
              value={item.person.email ?? ''}
              onChange={e =>
                onChange({
                  ...item,
                  person: { ...item.person, email: e.target.value || undefined },
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Phone</label>
              <input
                className={FIELD}
                value={item.person.phones?.[0]?.number ?? ''}
                onChange={e => {
                  const rest = item.person.phones?.slice(1) ?? [];
                  const first = item.person.phones?.[0];
                  const phones = e.target.value
                    ? [{ label: first?.label ?? '', number: e.target.value }, ...rest]
                    : rest.length
                      ? rest
                      : undefined;
                  onChange({ ...item, person: { ...item.person, phones } });
                }}
              />
            </div>
            <div>
              <label className={LABEL}>Phone label</label>
              <input
                className={FIELD}
                value={item.person.phones?.[0]?.label ?? ''}
                onChange={e => {
                  const rest = item.person.phones?.slice(1) ?? [];
                  const number = item.person.phones?.[0]?.number ?? '';
                  const phones =
                    number || e.target.value
                      ? [{ label: e.target.value, number }, ...rest]
                      : rest.length
                        ? rest
                        : undefined;
                  onChange({ ...item, person: { ...item.person, phones } });
                }}
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Website</label>
            <input
              className={FIELD}
              value={item.person.website ?? ''}
              onChange={e =>
                onChange({
                  ...item,
                  person: { ...item.person, website: e.target.value || undefined },
                })
              }
            />
          </div>
          <div>
            <label className={LABEL}>Address</label>
            <input
              className={FIELD}
              value={item.person.address ?? ''}
              onChange={e =>
                onChange({
                  ...item,
                  person: { ...item.person, address: e.target.value || undefined },
                })
              }
            />
          </div>
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Social links
            </p>
            <div>
              <label className={LABEL}>LinkedIn</label>
              <input
                className={FIELD}
                value={cardSocialHref(item.social, 'linkedin')}
                placeholder="https://linkedin.com/in/…"
                onChange={e => onChange(withCardSocial(item, 'linkedin', e.target.value))}
              />
            </div>
            <div>
              <label className={LABEL}>Email link</label>
              <input
                className={FIELD}
                value={cardSocialHref(item.social, 'email')}
                placeholder={
                  item.person.email
                    ? `mailto:${item.person.email} (default)`
                    : 'mailto:… (optional override)'
                }
                onChange={e => onChange(withCardSocial(item, 'email', e.target.value))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Optional. Leave blank to use mailto from the Email field above.
              </p>
            </div>
            <CardSocialExtras item={item} onChange={onChange} />
          </div>
          <div>
            <label className={LABEL}>vCard href</label>
            <input
              className={FIELD}
              value={item.vcard ?? ''}
              onChange={e => onChange({ ...item, vcard: e.target.value || undefined })}
            />
          </div>
        </>
      )}
      {item.kind === 'link' && (
        <div>
          <label className={LABEL}>Href</label>
          <input
            className={FIELD}
            value={item.href}
            onChange={e => onChange({ ...item, href: e.target.value })}
          />
        </div>
      )}
      {item.kind === 'scene' && (
        <div>
          <label className={LABEL}>Target scene</label>
          <select
            className={FIELD}
            value={item.targetId}
            onChange={e => onChange({ ...item, targetId: e.target.value })}
          >
            <option value="">Select</option>
            {all.map(s => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {(item.kind === 'download' || item.download) && (
        <FileField
          sceneId={sceneId}
          kind="file"
          label="Download file"
          value={item.download?.href}
          onUploaded={(href, file) =>
            onChange({
              ...item,
              download: { href, filename: file.name },
            })
          }
        />
      )}
      <Button variant="ghost" size="sm" onClick={onRemove}>
        Remove item
      </Button>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  reset,
  inputMin,
  inputMax,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  reset?: number;
  inputMin?: number;
  inputMax?: number;
  onChange: (n: number) => void;
}) {
  const lo = inputMin ?? min;
  const hi = inputMax ?? max;
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          className="min-w-0 flex-1"
          value={clamp(value, min, max)}
          onChange={e => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          min={lo}
          max={hi}
          step={step}
          className={cn(FIELD, 'w-16')}
          value={value}
          onChange={e => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? clamp(n, lo, hi) : min);
          }}
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        {reset != null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value === reset}
            onClick={() => onChange(reset)}
          >
            {reset}
          </Button>
        )}
      </div>
    </div>
  );
}

function PlaceFields({
  place,
  order,
  onChange,
}: {
  place: FreeformPlacement;
  /** Array index, used when this item has no explicit layer. */
  order: number;
  onChange: (patch: Partial<FreeformPlacement>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y'] as const).map(key => (
          <div key={key}>
            <label className={LABEL}>{key}</label>
            <input
              type="number"
              className={FIELD}
              value={place[key]}
              onChange={e => onChange({ [key]: Number(e.target.value) })}
            />
          </div>
        ))}
      </div>
      <SliderRow
        label="Width"
        value={place.w}
        min={2}
        max={60}
        step={0.5}
        unit="%"
        inputMin={0.5}
        inputMax={120}
        onChange={w => onChange({ w })}
      />
      <SliderRow
        label="Height"
        value={place.h}
        min={2}
        max={60}
        step={0.5}
        unit="%"
        inputMin={0.5}
        inputMax={120}
        onChange={h => onChange({ h })}
      />
      <SliderRow
        label="Rotate"
        value={place.rotate ?? 0}
        min={-30}
        max={30}
        unit="°"
        reset={0}
        inputMin={-180}
        inputMax={180}
        onChange={rotate => onChange({ rotate })}
      />
      <SliderRow
        label="Layer"
        value={place.z ?? order}
        min={0}
        max={24}
        reset={order}
        inputMin={-20}
        inputMax={50}
        onChange={z => onChange({ z })}
      />
    </div>
  );
}

function StagePreview({
  scene,
  selected,
  onSelect,
  onMove,
}: {
  scene: SceneConfig;
  selected: string | null;
  onSelect: (key: string) => void;
  onMove: (index: number, placement: FreeformPlacement) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; startX: number; startY: number; orig: FreeformPlacement } | null>(null);
  const bg = scene.stage.background;

  function down(e: ReactPointerEvent, index: number) {
    const item = scene.items[index];
    if (!item) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      index,
      startX: e.clientX,
      startY: e.clientY,
      orig: asFreeform(item.placement),
    };
    onSelect(placedKey(item, index));
  }

  function move(e: ReactPointerEvent) {
    const d = drag.current;
    const box = ref.current;
    if (!d || !box) return;
    const dx = ((e.clientX - d.startX) / box.clientWidth) * 100;
    const dy = ((e.clientY - d.startY) / box.clientHeight) * 100;
    onMove(d.index, { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy });
  }

  function up() {
    drag.current = null;
  }

  return (
    <section className="lg:sticky lg:top-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Stage
      </h2>
      <div
        ref={ref}
        className="relative isolate overflow-hidden rounded-xl bg-[#1b1410] shadow-2xl"
        style={{ aspectRatio: bg ? `${bg.width} / ${bg.height}` : '12 / 7' }}
      >
        {bg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bg.src}
            alt={bg.alt}
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
        )}
        {scene.items.map((item, i) => {
          const p = asFreeform(item.placement);
          const key = placedKey(item, i);
          const label = item.label;
          return (
            <button
              key={key}
              type="button"
              onPointerDown={e => down(e, i)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.w}%`,
                height: `${p.h}%`,
                zIndex: (p.z ?? i) + (selected === key ? 40 : 0),
                transform: p.rotate ? `rotate(${p.rotate}deg)` : undefined,
              }}
              className={cn(
                'absolute cursor-grab rounded-md border-2 text-left active:cursor-grabbing',
                selected === key
                  ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]/25'
                  : 'border-white/40 bg-white/10 hover:bg-white/20',
              )}
            >
              <span className="block truncate px-1 text-[10px] text-white drop-shadow">
                {label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Drag hotspots to place them.</p>
    </section>
  );
}

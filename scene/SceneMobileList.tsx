'use client';

import {
  ArrowRight,
  Download,
  ExternalLink,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { resolveAction } from './actions';
import {
  aspirePdfFilename,
  pdfHrefForItem,
  triggerDownload,
  triggerItemDownload,
} from './downloadFile';
import { useHrefSize } from './fileSize';
import { track } from './track';
import type { ResolvedItem } from './types';
import { KIND_LABEL, useScene } from './useSceneItem';

const HotspotPreview = dynamic(
  () => import('./HotspotPreview').then(m => ({ default: m.HotspotPreview })),
  { ssr: false },
);

/**
 * Mobile freeform scene: same items as the desk, shown as preview + label rows.
 */

function Row({ item }: { item: ResolvedItem }) {
  const { config, open, hrefForScene } = useScene();
  const action = resolveAction(item, hrefForScene);
  const sizeLabel = useHrefSize(item.download?.href);

  const body = (
    <>
      <span className="scene-mobile-thumb relative shrink-0 overflow-hidden rounded-lg bg-neutral-900">
        <HotspotPreview item={item} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.hint ?? KIND_LABEL[item.kind]}
          {sizeLabel ? ` · ${sizeLabel}` : ''}
        </span>
      </span>
      {action.type === 'navigate' && !action.internal ? (
        <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
      ) : action.type === 'download' ? (
        <Download className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      )}
    </>
  );

  const className =
    'flex w-full items-center gap-3 rounded-xl border bg-card p-2.5 text-left transition active:scale-[0.99] hover:border-[var(--brand-accent)]';

  if (action.type === 'navigate') {
    return (
      <Link
        href={action.href}
        target={action.target}
        rel={action.target === '_blank' ? 'noopener noreferrer' : undefined}
        prefetch={action.internal ? undefined : false}
        className={className}
        onClick={() =>
          action.internal && item.kind === 'scene'
            ? track({ event: 'scene_navigate', from: config.id, to: item.targetId })
            : track({
                event: 'scene_cta_click',
                sceneId: config.id,
                href: action.href,
                itemId: item.id,
              })
        }
      >
        {body}
      </Link>
    );
  }

  if (action.type === 'download') {
    const asPdf =
      Boolean(pdfHrefForItem(item)) ||
      /\.pdf($|\?)/i.test(action.href) ||
      Boolean(action.filename?.toLowerCase().endsWith('.pdf'));
    const filename = asPdf
      ? aspirePdfFilename(item.label)
      : action.filename || 'download';
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          void (async () => {
            if (asPdf) {
              await triggerItemDownload({
                sceneId: config.id,
                itemId: item.id,
                filename,
              });
            } else {
              await triggerDownload(action.href, filename);
            }
            track({ event: 'scene_download', sceneId: config.id, itemId: item.id });
          })().catch(err => console.error('[scene] download failed', err));
        }}
      >
        {body}
      </button>
    );
  }

  return (
    <button type="button" className={className} onClick={() => open(item.id)}>
      {body}
    </button>
  );
}

export function SceneMobileList() {
  const { config, items } = useScene();

  return (
    <div className="px-4 py-6 md:hidden">
      <header className="mb-5">
        {config.audience.prefix && (
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {config.audience.prefix}
          </p>
        )}
        <h1 className="mt-1 text-xl font-semibold leading-snug">
          {config.audience.nameplate}
        </h1>
      </header>

      <ul className="space-y-2.5">
        {items.map(item => (
          <li key={item.id}>
            <Row item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

'use client';

import { Download } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';

import { Button } from 'components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from 'components/ui/Dialog';
import { Skeleton } from 'components/ui/Skeleton';
import {
  aspirePdfFilename,
  pdfHrefForItem,
  triggerItemDownload,
} from './downloadFile';
import { useHrefSize } from './fileSize';
import { track } from './track';
import { useScene } from './useSceneItem';
import { downloadLetterPdf } from './viewers/letterPdf';
import { VIEWERS } from './viewers/registry';

/**
 * The single overlay host — title, download, close, focus trap, dwell timing.
 */
export function SceneModal() {
  const { activeItem, close, config } = useScene();
  const openedAt = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeItem) return;

    openedAt.current = Date.now();
    track({
      event: 'scene_item_open',
      sceneId: config.id,
      itemId: activeItem.id,
      kind: activeItem.kind,
    });

    const itemId = activeItem.id;
    return () => {
      const started = openedAt.current;
      openedAt.current = null;
      if (started === null) return;
      track({
        event: 'scene_item_close',
        sceneId: config.id,
        itemId,
        dwellMs: Date.now() - started,
      });
    };
  }, [activeItem, config.id]);

  const pdfHref = activeItem ? pdfHrefForItem(activeItem) : null;
  const isLetter = activeItem?.kind === 'letter';
  const sizeLabel = useHrefSize(pdfHref ?? activeItem?.download?.href);
  const showDownload = Boolean(pdfHref) || isLetter;
  const [dlError, setDlError] = useState<string | null>(null);

  useEffect(() => {
    setDlError(null);
  }, [activeItem?.id]);

  if (!activeItem) return null;

  const Viewer = VIEWERS[activeItem.kind];

  async function onDownload() {
    if (!activeItem || busy) return;
    setBusy(true);
    setDlError(null);
    try {
      const filename = aspirePdfFilename(activeItem.label);
      if (activeItem.kind === 'letter') {
        const el = document.getElementById('scene-letter-paper');
        if (!el) throw new Error('Letter not ready');
        await downloadLetterPdf(el, filename);
      } else {
        await triggerItemDownload({
          sceneId: config.id,
          itemId: activeItem.id,
          filename,
        });
      }
      track({
        event: 'scene_download',
        sceneId: config.id,
        itemId: activeItem.id,
      });
    } catch (err) {
      console.error('[scene] download failed', err);
      setDlError(
        err instanceof Error ? err.message : 'This file is missing or unreachable.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={isOpen => !isOpen && close()}>
      <DialogContent
        hideClose
        className="!flex h-[88vh] max-h-[88vh] w-[min(1100px,94vw)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-white/10 p-0"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-3 backdrop-blur-md">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-semibold">
              {activeItem.label}
            </DialogTitle>
            {activeItem.hint && (
              <DialogDescription className="truncate text-xs">
                {activeItem.hint}
              </DialogDescription>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {showDownload && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void onDownload()}
              >
                <Download className="mr-1.5 size-4" />
                <span className="hidden sm:inline">{busy ? 'Downloading…' : 'Download'}</span>
                {sizeLabel && !busy && (
                  <span className="ml-1 text-xs text-muted-foreground">{sizeLabel}</span>
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={close}>
              Close
            </Button>
          </div>
        </header>

        {dlError && (
          <p className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-destructive">
            {dlError}
          </p>
        )}

        <div className="relative min-h-0 flex-1 bg-black">
          <div className="absolute inset-0">
            <Suspense fallback={<Skeleton className="size-full rounded-none" />}>
              <Viewer item={activeItem} sceneId={config.id} />
            </Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

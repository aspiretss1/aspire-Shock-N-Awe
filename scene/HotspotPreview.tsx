'use client';

import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';

import { cn } from 'components/ui/utils';
import { BusinessCard } from './BusinessCard';
import { DeviceFrame, type DeviceKind } from './DeviceFrame';
import { itemKindForMedia, resolveMedia } from './media';
import { ProviderFrame } from './ProviderFrame';
import { isSafeUrl } from './schema';
import type { CardItem, LetterItem, ResolvedItem } from './types';
import { letterText } from './letterTokens';
import { useNearViewport } from './useNearViewport';
import { useScene } from './useSceneItem';
import { WebsiteShot } from './websiteShot';

/**
 * Clipped miniature of the real content on a desk hotspot. Click handling
 * stays on the button/`<a>` — faces are `pointer-events-none`.
 */
type Chrome = 'paper' | 'phone' | 'tablet' | 'monitor' | 'doc' | 'print' | 'plain';

const DEVICE: Partial<Record<Chrome, DeviceKind>> = {
  phone: 'phone',
  tablet: 'tablet',
  monitor: 'monitor',
};

export function HotspotPreview({
  item,
  showOutlines,
}: {
  item: ResolvedItem;
  showOutlines?: boolean;
}) {
  const spec = faceFor(item);
  const chrome = chromeFor(item, spec);
  const stacked = spec?.type === 'letter';

  const device = DEVICE[chrome];

  return (
    <span
      className={cn(
        'scene-object',
        `scene-object--${chrome}`,
        showOutlines && 'scene-object--outline',
      )}
    >
      {stacked && (
        <>
          <span className="scene-sheet scene-sheet-b" aria-hidden />
          <span className="scene-sheet scene-sheet-a" aria-hidden />
        </>
      )}
      <span className={cn('scene-object-face', !device && `scene-object-face--${chrome}`)}>
        {device ? (
          <DeviceFrame kind={device} fill>
            <Face spec={spec} item={item} />
          </DeviceFrame>
        ) : chrome === 'print' ? (
          <span className="scene-object-mat">
            <Face spec={spec} item={item} />
          </span>
        ) : (
          <Face spec={spec} item={item} />
        )}
      </span>
    </span>
  );
}

function chromeFor(item: ResolvedItem, spec: FaceSpec | null): Chrome {
  switch (spec?.type) {
    case 'letter':
    case 'card':
      return 'paper';
    case 'video':
      return 'monitor';
    case 'shot':
      return 'tablet';
    case 'pdf':
      return 'doc';
    case 'image':
      return 'print';
    case 'audio':
      return 'phone';
    default:
      if (item.kind === 'audio') return 'phone';
      if (item.kind === 'card') return 'paper';
      if (item.kind === 'video') return 'monitor';
      if (item.kind === 'embed' || item.kind === 'link') return 'tablet';
      return 'plain';
  }
}

function Face({ spec, item }: { spec: FaceSpec | null; item: ResolvedItem }) {
  if (!spec) return <PlainMini label={item.label} />;

  switch (spec.type) {
    case 'letter':
      return <LetterMini item={spec.item} />;
    case 'card':
      return <CardMini item={spec.item} />;
    case 'audio':
      return <AudioMini />;
    case 'video':
      return (
        <VideoMini src={spec.src} embedUrl={spec.embedUrl} poster={spec.poster} />
      );
    case 'pdf':
      return <PdfMini src={spec.src} />;
    case 'image':
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={spec.src}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      );
    case 'shot':
      return <ShotMini href={spec.href} />;
  }
}

type FaceSpec =
  | { type: 'letter'; item: LetterItem }
  | { type: 'card'; item: CardItem }
  | { type: 'audio' }
  | { type: 'video'; src?: string; embedUrl?: string; poster?: string }
  | { type: 'pdf'; src: string }
  | { type: 'image'; src: string }
  | { type: 'shot'; href: string };

function isHttpPage(href: string) {
  if (/^(mailto|tel):/i.test(href)) return false;
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  try {
    const protocol = new URL(href, 'https://localhost').protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function videoFace(src: string, poster?: string): FaceSpec {
  const media = resolveMedia(src);
  return {
    type: 'video',
    src: media.embedUrl ? undefined : media.url,
    embedUrl: media.embedUrl,
    poster: poster ?? media.posterUrl,
  };
}

function shotFace(href: string): FaceSpec | null {
  if (!isSafeUrl(href) || !isHttpPage(href)) return null;
  return { type: 'shot', href };
}

function faceFor(item: ResolvedItem): FaceSpec | null {
  switch (item.kind) {
    case 'letter':
      return { type: 'letter', item };
    case 'card':
      return { type: 'card', item };
    case 'audio':
      return { type: 'audio' };
    case 'video':
      return videoFace(item.src, item.poster);
    case 'pdf':
      return isSafeUrl(item.src) ? { type: 'pdf', src: item.src } : null;
    case 'image':
      return isSafeUrl(item.src) ? { type: 'image', src: item.src } : null;
    case 'embed':
      return shotFace(item.src);
    case 'link':
      return shotFace(item.href);
    case 'auto': {
      const media = resolveMedia(item.src);
      const kind = item.as ?? itemKindForMedia(media);
      if (kind === 'video') return videoFace(media.url, item.poster ?? media.posterUrl);
      if (kind === 'audio') return { type: 'audio' };
      if (kind === 'pdf' && isSafeUrl(media.url)) return { type: 'pdf', src: media.url };
      if (kind === 'image' && isSafeUrl(media.url)) return { type: 'image', src: media.url };
      if (kind === 'embed' || kind === 'link') return shotFace(media.embedUrl ?? media.url);
      return null;
    }
    default:
      return null;
  }
}

const LETTER_W = 420;

function PlainMini({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-end p-[8%]">
      <span className="truncate font-medium text-white/85" style={{ fontSize: '6.5cqw' }}>
        {label}
      </span>
    </span>
  );
}

function CardMini({ item }: { item: CardItem }) {
  return (
    <span className="pointer-events-none absolute inset-0">
      <BusinessCard item={item} mini />
    </span>
  );
}

function AudioMini() {
  const bars = [32, 58, 44, 86, 62, 100, 48, 74, 36, 90, 54, 70, 40, 82, 28, 64];
  return (
    <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[8%] bg-[#070b14] px-[10%]">
      <span className="flex aspect-square h-[22%] items-center justify-center rounded-full bg-white">
        <svg viewBox="0 0 12 14" className="ml-[8%] h-[42%] w-auto" aria-hidden>
          <path d="M1 1.2 L10.5 7 L1 12.8 Z" fill="#12151a" />
        </svg>
      </span>
      <span className="flex h-[20%] w-full items-center justify-between">
        {bars.map((h, i) => (
          <span
            key={i}
            className="w-[3.5%] rounded-full bg-[#7ec8ff]"
            style={{ height: `${h}%` }}
          />
        ))}
      </span>
    </span>
  );
}

function LetterMini({ item }: { item: LetterItem }) {
  const { config } = useScene();
  const brand = config.letterBrand;
  const headerSrc = brand?.headerSrc || item.letterheadSrc;
  const wrapRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(0.2);
  const paragraphs = letterText(item.bodyMdx).split(/\n{2,}/).filter(Boolean);

  useEffect(() => {
    const wrap = wrapRef.current;
    const paper = paperRef.current;
    if (!wrap || !paper) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const paperW = paper.offsetWidth || LETTER_W;
        const paperH = paper.scrollHeight;
        if (paperW <= 0 || paperH <= 0 || wrap.clientWidth <= 0 || wrap.clientHeight <= 0) {
          return;
        }
        const next = Math.min(wrap.clientWidth / paperW, wrap.clientHeight / paperH);
        setScale(s => (Math.abs(s - next) < 0.008 ? s : next));
      });
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(wrap);
    obs.observe(paper);
    return () => {
      cancelAnimationFrame(frame);
      obs.disconnect();
    };
  }, [item.bodyMdx, item.letterheadSrc, item.signature, brand?.headerSrc, brand?.footerSrc, brand?.footerText]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      <article
        ref={paperRef}
        className="absolute left-1/2 top-0 bg-[#f8f7f3] text-[#1c1e22]"
        style={{
          width: LETTER_W,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        <div className="flex flex-col px-10 py-9">
          {headerSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headerSrc} alt="" className="mb-6 h-9 w-auto" />
          )}
          {paragraphs.map((p, i) => (
            <p key={i} className="mb-3 whitespace-pre-line text-[12px] leading-relaxed">
              {p}
            </p>
          ))}
          {item.signature && (
            <div className="mt-4 border-t border-black/10 pt-4">
              {item.signature.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.signature.image} alt="" className="mb-2 h-10 w-auto" />
              )}
              <p className="text-[12px] font-semibold">{item.signature.name}</p>
              <p className="text-[10px] text-[#5c626c]">{item.signature.title}</p>
            </div>
          )}
          {(brand?.footerSrc || brand?.footerText) && (
            <footer className="mt-4 border-t border-black/10 pt-4">
              {brand.footerSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.footerSrc} alt="" className="mb-2 h-8 w-auto" />
              )}
              {brand.footerText && (
                <p className="whitespace-pre-line text-[9px] leading-relaxed text-[#5c626c]">
                  {brand.footerText}
                </p>
              )}
            </footer>
          )}
        </div>
      </article>
    </div>
  );
}

function ShotMini({ href }: { href: string }) {
  const { ref, near } = useNearViewport<HTMLSpanElement>();
  return (
    <span ref={ref} className="pointer-events-none absolute inset-0 bg-[#0c0e12]">
      {near && (
        <WebsiteShot
          href={href}
          label=""
          width={640}
          className="pointer-events-none absolute inset-0"
        />
      )}
    </span>
  );
}

function VideoMini({
  src,
  embedUrl,
  poster,
}: {
  src?: string;
  embedUrl?: string;
  poster?: string;
}) {
  const { ref, near } = useNearViewport<HTMLSpanElement>();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!near || !src) return;
    const el = videoRef.current;
    if (!el) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let dead = false;
    const start = () => {
      if (dead || mq.matches) {
        el.pause();
        return;
      }
      void el.play().catch(() => {});
    };
    start();
    el.addEventListener('canplay', start);
    mq.addEventListener('change', start);
    const poll = window.setInterval(() => {
      if (dead) return;
      if (mq.matches) {
        el.pause();
        return;
      }
      if (!el.paused) {
        window.clearInterval(poll);
        return;
      }
      start();
    }, 500);
    const stop = window.setTimeout(() => window.clearInterval(poll), 8000);
    return () => {
      dead = true;
      window.clearInterval(poll);
      window.clearTimeout(stop);
      el.removeEventListener('canplay', start);
      mq.removeEventListener('change', start);
      el.pause();
    };
  }, [near, src]);

  if (embedUrl) {
    return (
      <span ref={ref} className="pointer-events-none absolute inset-0 bg-black">
        {near ? (
          <ProviderFrame
            embedUrl={embedUrl}
            title=""
            mini
            className="pointer-events-none absolute inset-0 size-full overflow-hidden"
          />
        ) : poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
        ) : null}
      </span>
    );
  }

  if (!src) {
    if (!poster) return <span ref={ref} className="pointer-events-none absolute inset-0 bg-black" />;
    return (
      <span ref={ref} className="pointer-events-none absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      </span>
    );
  }

  return (
    <span ref={ref} className="pointer-events-none absolute inset-0 bg-black">
      {near ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
  );
}

function PdfMini({ src }: { src: string }) {
  const { ref: wrapRef, near } = useNearViewport<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [width, setWidth] = useState(0);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = el.clientWidth;
        setWidth(w => (Math.abs(w - next) < 4 ? w : next));
      });
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      obs.disconnect();
    };
  }, [src]);

  useEffect(() => {
    if (!near || !src) return;
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    let destroyLoading: (() => void) | null = null;
    setPdf(null);

    void import('pdfjs-dist').then(pdfjs => {
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const loading = pdfjs.getDocument({ url: src, withCredentials: false });
      destroyLoading = () => loading.destroy();
      loading.promise.then(
        loaded => {
          if (cancelled) {
            loaded.destroy();
            return;
          }
          doc = loaded;
          setPdf(loaded);
        },
        () => {
          /* missing or unreadable */
        },
      );
    });

    return () => {
      cancelled = true;
      destroyLoading?.();
      doc?.destroy();
    };
  }, [near, src]);

  useEffect(() => {
    if (!pdf || width <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(Math.max(width / base.width, 0.15), 1.2);
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx || cancelled) return;

        const prev = taskRef.current;
        taskRef.current = null;
        if (prev) {
          prev.cancel();
          try {
            await prev.promise;
          } catch {
            /* RenderingCancelledException */
          }
        }
        if (cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const task = page.render({ canvasContext: ctx, viewport });
        taskRef.current = task;
        await task.promise;
      } catch (err) {
        if (cancelled) return;
        if ((err as { name?: string })?.name === 'RenderingCancelledException') return;
      }
    })();

    return () => {
      cancelled = true;
      taskRef.current?.cancel();
      taskRef.current = null;
    };
  }, [pdf, width]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 overflow-hidden bg-white">
      {near && <canvas ref={canvasRef} className="block w-full bg-white" />}
    </div>
  );
}

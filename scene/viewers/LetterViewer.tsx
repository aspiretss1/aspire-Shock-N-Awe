'use client';

import { useMemo } from 'react';

import { applyTokens } from '../letterTokens';
import { getRecipientName } from '../track';
import type { LetterBrand } from '../types';
import { useScene } from '../useSceneItem';
import type { ViewerProps } from './types';

/**
 * Letterhead plus body text, with `{{token}}` substitution.
 * Scene `letterBrand` supplies AspireTSS header/footer for every letter.
 */
export default function LetterViewer({ item }: ViewerProps) {
  const { config } = useScene();
  const recipient = getRecipientName();

  const body = useMemo(
    () => (item.kind === 'letter' ? applyTokens(item.bodyMdx, recipient) : ''),
    [item, recipient],
  );

  if (item.kind !== 'letter') return null;

  const paragraphs = body.split(/\n{2,}/).filter(Boolean);
  const brand = config.letterBrand;
  const headerSrc = brand?.headerSrc || item.letterheadSrc;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-10">
      <LetterPaper
        id="scene-letter-paper"
        headerSrc={headerSrc}
        paragraphs={paragraphs}
        signature={item.signature}
        brand={brand}
      />
    </div>
  );
}

export function LetterPaper({
  id,
  headerSrc,
  paragraphs,
  signature,
  brand,
  className,
}: {
  id?: string;
  headerSrc?: string;
  paragraphs: string[];
  signature?: { name: string; title: string; image?: string };
  brand?: LetterBrand;
  className?: string;
}) {
  return (
    <article
      id={id}
      className={
        className ??
        'mx-auto max-w-2xl rounded-lg bg-[#f8f7f3] p-8 text-[#1c1e22] shadow-2xl md:p-12'
      }
    >
      {headerSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={headerSrc} alt="" className="mb-8 h-12 w-auto max-w-full" />
      )}

      {paragraphs.map((p, i) => (
        <p key={i} className="mb-4 whitespace-pre-line leading-relaxed">
          {p}
        </p>
      ))}

      {signature && (
        <div className="mt-10 border-t border-black/10 pt-5">
          {signature.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signature.image} alt="" className="mb-2 h-12 w-auto" />
          )}
          <p className="font-semibold">{signature.name}</p>
          <p className="text-sm text-[#5c626c]">{signature.title}</p>
        </div>
      )}

      {(brand?.footerSrc || brand?.footerText) && (
        <footer className="mt-10 border-t border-black/10 pt-5">
          {brand.footerSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.footerSrc} alt="" className="mb-2 h-10 w-auto max-w-full" />
          )}
          {brand.footerText && (
            <p className="whitespace-pre-line text-xs leading-relaxed text-[#5c626c]">
              {brand.footerText}
            </p>
          )}
        </footer>
      )}
    </article>
  );
}

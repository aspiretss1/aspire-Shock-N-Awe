import Link from 'next/link';

import { cn } from 'components/ui/utils';

/**
 * Small product mark for admin chrome (login, index, setup).
 */
export function BrandMark({
  href = '/',
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2.5 text-foreground no-underline hover:opacity-90',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        width={28}
        height={28}
        className="size-7 object-contain"
      />
      <span className="text-sm font-semibold tracking-tight">Shock and Awe</span>
    </Link>
  );
}

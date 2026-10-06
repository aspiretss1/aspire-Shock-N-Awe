import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { currentSite } from 'scene/sites';
import './globals.css';

/**
 * Root layout.
 *
 * `metadataBase` is resolved from the serving brand rather than a module
 * constant — that single change is what lets one deployment serve both
 * securityawarenesstraining.ai and aspiretss.com with correct absolute URLs
 * in canonical and Open Graph tags.
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = currentSite();
  return {
    metadataBase: new URL(site.url),
    title: { default: site.name, template: `%s · ${site.name}` },
    icons: {
      icon: '/logo.png',
      apple: '/logo.png',
    },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const site = currentSite();

  return (
    <html lang="en" data-brand={site.key}>
      <body>
        {children}

        {/*
          Analytics belongs here, gated on a defined container id:

            {site.gtmId && <GtmScript id={site.gtmId} />}

          Never interpolate an unset env var into the script URL. That is what
          produces the `gtm.js?id=undefined` requests on the live NYC page —
          the tag loads, matches no container, and records nothing.
        */}
      </body>
    </html>
  );
}

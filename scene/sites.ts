import { headers } from 'next/headers';

import type { SiteConfig, SiteKey } from './types';

/**
 * Brand registry.
 *
 * The serving host decides which brand a request belongs to. Middleware
 * resolves it once at the edge and sets `x-site`; everything downstream reads
 * that header rather than taking a prop.
 *
 * Analytics IDs are deliberately optional. An UNSET id must render NO tag —
 * interpolating `undefined` into a script URL is what produces the
 * `gtm.js?id=undefined` requests currently firing on the live NYC page.
 */

export const SITES: Record<SiteKey, SiteConfig> = {
  asat: {
    key: 'asat',
    name: 'Aspire Security Awareness Training',
    url: 'https://www.securityawarenesstraining.ai',
    hosts: [
      'securityawarenesstraining.ai',
      'www.securityawarenesstraining.ai',
      '*.securityawarenesstraining.ai',
    ],
    logo: '/logo.png',
    theme: 'asat',
    gtmId: process.env.NEXT_PUBLIC_GTM_ASAT,
    ga4Id: process.env.NEXT_PUBLIC_GA4_ASAT,
    chatWidgetId: process.env.NEXT_PUBLIC_CHAT_WIDGET_ASAT,
    formProvider: 'internal',
    contact: {
      email: 'info@aspiretss.com',
      phone: '+1-917-600-9233',
      address: {
        streetAddress: '11 Broadway',
        addressLocality: 'New York',
        addressRegion: 'NY',
        postalCode: '10004',
        addressCountry: 'US',
      },
    },
    social: [
      'https://www.facebook.com/AspireSAT',
      'https://www.instagram.com/aspire_sat/',
      'https://www.linkedin.com/company/aspire-tech-security-awareness-training',
    ],
  },

  aspire: {
    key: 'aspire',
    name: 'Aspire Tech Services and Solutions',
    url: 'https://aspiretss.com',
    hosts: ['aspiretss.com', 'www.aspiretss.com', '*.aspiretss.com'],
    logo: '/logo.png',
    theme: 'aspire',
    gtmId: process.env.NEXT_PUBLIC_GTM_ASPIRE,
    ga4Id: process.env.NEXT_PUBLIC_GA4_ASPIRE,
    chatWidgetId: process.env.NEXT_PUBLIC_CHAT_WIDGET_ASPIRE,
    formProvider: 'ghl',
    contact: {
      email: 'info@aspiretss.com',
      phone: '+1-917-600-9233',
      address: {
        streetAddress: '11 Broadway',
        addressLocality: 'New York',
        addressRegion: 'NY',
        postalCode: '10004',
        addressCountry: 'US',
      },
    },
    social: [
      'https://www.facebook.com/aspiretss',
      'https://twitter.com/AspireTechServ3',
      'https://www.linkedin.com/company/aspire-tech-services-and-solution-limited',
    ],
  },
};

export const DEFAULT_SITE: SiteKey = 'asat';

/**
 * Resolve a brand from a Host header value.
 *
 * Handles exact hosts and `*.example.com` wildcards. Falls back to
 * DEFAULT_SITE so previews, `localhost` and Vercel-style deploy URLs render
 * something sensible rather than 404ing.
 */
export function siteFromHost(host: string | null | undefined): SiteKey {
  if (!host) return DEFAULT_SITE;
  const h = host.split(':')[0].toLowerCase();

  for (const site of Object.values(SITES)) {
    const match = site.hosts.some(pattern => {
      if (!pattern.startsWith('*.')) return h === pattern;
      const apex = pattern.slice(2);
      return h === apex || h.endsWith(`.${apex}`);
    });
    if (match) return site.key;
  }

  return DEFAULT_SITE;
}

/**
 * Extract the campaign subdomain, if any.
 *
 * `banking.securityawarenesstraining.ai` → `banking`
 *
 * This is a campaign DIMENSION only. It is never the scene's identity — that
 * conflation is exactly what makes the reference implementation impossible to
 * rename or serve on a second domain.
 */
export function subdomainFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.split(':')[0].toLowerCase();
  const site = SITES[siteFromHost(h)];

  for (const pattern of site.hosts) {
    if (!pattern.startsWith('*.')) continue;
    const apex = pattern.slice(2);
    if (h.endsWith(`.${apex}`)) {
      const label = h.slice(0, -(apex.length + 1));
      return label && label !== 'www' ? label : null;
    }
  }
  return null;
}

/**
 * Server-component helper. Reads the header middleware set.
 *
 * `NEXT_PUBLIC_FORCE_SITE` overrides everything — without it, local
 * development on `localhost` always resolves to DEFAULT_SITE and the second
 * brand is unreachable without editing your hosts file.
 */
export function currentSiteKey(): SiteKey {
  const forced = process.env.NEXT_PUBLIC_FORCE_SITE as SiteKey | undefined;
  if (forced && forced in SITES) return forced;

  const fromHeader = headers().get('x-site') as SiteKey | null;
  if (fromHeader && fromHeader in SITES) return fromHeader;

  // Fallback for routes rendered before middleware ran (or in tests).
  return siteFromHost(headers().get('host'));
}

export function currentSite(): SiteConfig {
  return SITES[currentSiteKey()];
}

/** Absolute URL for a slug on a given brand. Used for canonical + OG tags. */
export function absoluteUrl(site: SiteKey, path: string): string {
  const base = SITES[site].url.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

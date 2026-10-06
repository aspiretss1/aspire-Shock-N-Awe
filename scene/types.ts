/**
 * Shock and Awe — the whole contract.
 *
 * Everything else in `scene/` consumes these types and nothing else,
 * which is what lets the config SOURCE change (typed files → JSON → CMS)
 * without touching a single component.
 *
 * Two invariants worth protecting:
 *  1. `SceneConfig.id` is IMMUTABLE. Analytics, the scene graph and the item
 *     library all reference it. Never derive it from a slug.
 *  2. `SceneRoute.slug` is MUTABLE. It may change any number of times; every
 *     previous value lands in `slugHistory` and is 301'd by middleware.
 */

/* ------------------------------------------------------------------ *
 * Brands
 * ------------------------------------------------------------------ */

export type SiteKey = 'asat' | 'aspire';

export interface SiteAddress {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
}

export interface SiteConfig {
  key: SiteKey;
  name: string;
  /** Canonical origin, no trailing slash. */
  url: string;
  /** Exact hosts and `*.wildcard` patterns that resolve to this brand. */
  hosts: string[];
  logo: string;
  /** Selects the Tailwind token set applied via `data-brand`. */
  theme: SiteKey;
  gtmId?: string;
  ga4Id?: string;
  metaPixelId?: string;
  chatWidgetId?: string;
  formProvider: FormProvider;
  contact: { email: string; phone: string; address: SiteAddress };
  social: string[];
}

export type FormProvider = 'internal' | 'ghl';

/* ------------------------------------------------------------------ *
 * Placement — how a layout strategy positions an item
 * ------------------------------------------------------------------ */

export type LayoutKind = 'freeform' | 'grid' | 'panorama';

export interface FreeformPlacement {
  layout: 'freeform';
  /** All four are percentages of the stage box, 0–100. Scales to any width. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  /**
   * Paint order. Higher sits on top of a lower item where they overlap.
   * Omitted means array order.
   */
  z?: number;
  shape?: 'rect' | 'ellipse';
}

export interface GridPlacement {
  layout: 'grid';
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
}

export interface PanoramaPlacement {
  layout: 'panorama';
  yaw: number;
  pitch: number;
  size: number;
}

export type Placement = FreeformPlacement | GridPlacement | PanoramaPlacement;

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

export type SceneItemKind =
  /** Point at any URL and let `resolveMedia()` choose the viewer. */
  | 'auto'
  | 'pdf'
  | 'pages'
  | 'flipbook'
  | 'embed'
  | 'image'
  | 'scene'
  | 'link'
  | 'download'
  | 'video'
  | 'audio'
  | 'card'
  | 'letter'
  | 'form';

export interface DownloadConfig {
  href: string;
  filename?: string;
  /** Shown before the click, e.g. "6.2 MB". */
  sizeLabel?: string;
  requiresLead?: boolean;
}

export interface GateConfig {
  formId: string;
  headline: string;
  /** localStorage key so a visitor is asked at most once per browser. */
  rememberKey?: string;
}

interface SceneItemBase {
  /** Stable. Used by analytics and `?open=` deep links. */
  id: string;
  kind: SceneItemKind;
  /** Accessible name and modal title. */
  label: string;
  /** Hover tooltip, e.g. "Read this report". */
  hint?: string;
  gated?: GateConfig;
  /** Any kind may also be downloadable — the modal renders the button. */
  download?: DownloadConfig;
}

export interface PageImage {
  src: string;
  width: number;
  height: number;
  alt?: string;
  thumb?: string;
}

/**
 * The dynamic-first item. Give it any URL — YouTube, Vimeo, Loom, a Drive
 * file, a PDF on S3, an mp4 on a CDN, a .pptx on SharePoint, an image — and
 * the media resolver picks the viewer at render time.
 *
 * This is what a CMS field should produce by default. Reach for an explicit
 * kind only when you need options the resolver cannot infer.
 */
export interface AutoItem extends SceneItemBase {
  kind: 'auto';
  src: string;
  /** Override when detection guesses wrong. */
  as?: Exclude<SceneItemKind, 'auto'>;
  poster?: string;
}

export interface PdfItem extends SceneItemBase {
  kind: 'pdf';
  src: string;
  initialPage?: number;
}

export interface ImageItem extends SceneItemBase {
  kind: 'image';
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface PagesItem extends SceneItemBase {
  kind: 'pages';
  pages: PageImage[];
  pageLayout?: 'scroll' | 'spread';
}

export interface FlipbookItem extends SceneItemBase {
  kind: 'flipbook';
  pages: PageImage[];
  cover?: 'single' | 'spread';
}

export interface EmbedItem extends SceneItemBase {
  kind: 'embed';
  src: string;
  allow?: string;
  sandbox?: string;
}

export interface SceneLinkItem extends SceneItemBase {
  kind: 'scene';
  /** Target scene ID — never a slug. Resolved to a URL at render time. */
  targetId: string;
  transition?: 'zoom' | 'fade' | 'push';
  preview?: string;
}

export interface LinkItem extends SceneItemBase {
  kind: 'link';
  href: string;
  target?: '_blank' | '_self';
}

export interface DownloadItem extends SceneItemBase {
  kind: 'download';
  download: DownloadConfig;
}

export interface VideoCaption {
  src: string;
  srclang: string;
  label: string;
}

export interface VideoItem extends SceneItemBase {
  kind: 'video';
  /**
   * Any video URL: a direct mp4/webm/HLS file, or a YouTube / Vimeo / Loom /
   * Wistia / Dailymotion page link. The resolver normalises provider URLs to
   * their embed form, so a marketer can paste whatever they copied.
   */
  src: string;
  poster?: string;
  captions?: VideoCaption[];
  autoplayMuted?: boolean;
}

export interface AudioItem extends SceneItemBase {
  kind: 'audio';
  src: string;
  /** Strongly recommended — an audio-only message is inaccessible without it. */
  transcript?: string;
  waveform?: string;
}

export interface CardItem extends SceneItemBase {
  kind: 'card';
  person: {
    name: string;
    title: string;
    photo?: string;
    email?: string;
    phones?: { label: string; number: string }[];
    address?: string;
    website?: string;
  };
  social?: { network: string; href: string }[];
  vcard?: string;
}

export interface LetterItem extends SceneItemBase {
  kind: 'letter';
  letterheadSrc?: string;
  /** Supports `{{firstName}}` style tokens resolved from the recipient. */
  bodyMdx: string;
  signature?: { name: string; title: string; image?: string };
}

export interface FormItem extends SceneItemBase {
  kind: 'form';
  /** Falls back to the serving brand's `formProvider` when omitted. */
  provider?: FormProvider;
  formId: string;
  height?: number;
}

export type SceneItem =
  | AutoItem
  | PdfItem
  | PagesItem
  | FlipbookItem
  | EmbedItem
  | ImageItem
  | SceneLinkItem
  | LinkItem
  | DownloadItem
  | VideoItem
  | AudioItem
  | CardItem
  | LetterItem
  | FormItem;

/* ------------------------------------------------------------------ *
 * Placement of an item within one particular scene
 * ------------------------------------------------------------------ */

/**
 * An item defined inline, positioned for this scene.
 *
 * Every item is stored this way — fully inline in `sna_scenes.config`, with
 * real Supabase Storage URLs for any media field. There is no code-level
 * item library and no `ref` indirection: that pattern let an item's content
 * live outside the database, which is exactly what this type refuses to
 * allow.
 */
export type PlacedInline = SceneItem & { placement: Placement };

export type Placed = PlacedInline;

/** Items are already in placed, inline shape — no resolution step needed. */
export type ResolvedItem = PlacedInline;

/* ------------------------------------------------------------------ *
 * Scenes
 * ------------------------------------------------------------------ */

export type ScenePreset =
  | 'desk'
  | 'office'
  | 'board'
  | 'soc'
  | 'workshop'
  | 'custom';

export type SceneStatus = 'draft' | 'live' | 'archived';

export interface SceneRoute {
  site: SiteKey;
  /** Editable at any time. Never used as an identifier internally. */
  slug: string;
  /**
   * Campaign host label for wildcard DNS (`{subdomain}.{apex}/{slug}`).
   * Identity is still the brand host; routing is still `/{slug}`.
   */
  subdomain?: string;
  /** Every previous slug. Drives automatic 301s. */
  slugHistory?: string[];
  /** Exactly one route must be canonical when a scene is live on both brands. */
  canonical?: boolean;
  /** Defaults to true. Set false for one-off ABM / PURL scenes. */
  indexable?: boolean;
  status: SceneStatus;
  publishedAt?: string;
}

export interface SceneStage {
  background?: { src: string; width: number; height: number; alt: string };
  /** Grid layout only. */
  columns?: { id: string; label: string }[];
  theme?: 'walnut' | 'slate' | 'light' | 'dark';
  /**
   * Where the personalised nameplate is drawn.
   *
   * Omit it when the artwork already has a title or plaque baked in —
   * overlaying text on top of printed text looks like a rendering bug. The
   * audience name still appears in the mobile list header either way.
   */
  nameplate?: Placement;
}

export interface SceneSeo {
  title: string;
  description: string;
  ogImage?: string;
  schema?: 'WebPage' | 'Course' | 'Product' | 'CollectionPage';
}

/** Shared AspireTSS chrome applied to every letter in the scene. */
export interface LetterBrand {
  headerSrc?: string;
  footerSrc?: string;
  footerText?: string;
}

export interface SceneConfig {
  /** IMMUTABLE identity. Analytics, scene graph and library refs use this. */
  id: string;
  /** MUTABLE addresses, at most one per brand. */
  routes: SceneRoute[];
  /** Parent scene ID, for breadcrumbs. Undefined means root. */
  parent?: string;

  preset: ScenePreset;
  layout: LayoutKind;

  audience: {
    nameplate: string;
    prefix?: string;
  };

  stage: SceneStage;

  /** Header/footer for all letter items (Setup-configurable). */
  letterBrand?: LetterBrand;

  chrome?: 'full' | 'minimal' | 'none';
  banner?: { text: string; cta: { label: string; href: string } };
  /** Item id opened automatically on load. */
  autoOpen?: string;

  items: Placed[];

  seo: SceneSeo;
  tracking?: { campaign: string; source?: string };
}

/** What the source returns: config with items resolved and route selected. */
export interface ResolvedScene {
  config: SceneConfig;
  route: SceneRoute;
  items: ResolvedItem[];
}

/* ------------------------------------------------------------------ *
 * Recipient personalisation
 * ------------------------------------------------------------------ */

export interface Recipient {
  id: string;
  firstName?: string;
  company?: string;
  /** Sales rep who owns the account, for routing the alert. */
  owner?: string;
}

/** One crumb in a scene-graph breadcrumb. Slug is already brand-resolved. */
export interface TrailNode {
  id: string;
  slug: string;
  label: string;
}

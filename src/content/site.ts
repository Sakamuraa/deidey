/**
 * Identity strings, sourced from the real channel.
 *
 * Provenance, so nothing here has to be trusted on faith:
 *   - name, bio ................. YouTube channel description + X profile bio
 *   - avatar .................... yt3.googleusercontent.com (channel avatar)
 *   - join date ................. channel /about page, "Bergabung pada 17 Jul 2021"
 *   - character credits ......... the creator's own X bio
 *   - hashtags .................. the channel description, in her order
 *   - series .................... counted from the feed titles
 *
 * The content lists are NOT here. They come from /api/content at request time
 * and keep only a bundled snapshot in src/lib/useContent.ts, so there is one
 * place to look for broadcast data instead of two that can drift apart.
 */

export const site = {
  name: "Deidey",
  /** Name as it appears on the channel, verbatim. */
  channelTitle: "Deidey",
  /** Description as published by the creator, trimmed of decoration. */
  bio: "Isekai Rabbit Warrior. Elite warrior from Praedisium, siap merusak.",
  /**
   * Production origin. The site is served from its own subdomain, so the origin
   * and the site URL are the same thing. Kept in sync with index.html,
   * robots.txt, and sitemap.xml.
   */
  url: "https://deidey.vtube-info.xyz",
  locale: "id_ID",
  avatar: "/media/avatar-youtube.webp",
  avatarAlt: "Ilustrasi Deidey: karakter anime rabbit warrior dengan rambut ungu gelap dan sorotan lavender",
  /** Smaller crop used for the nav mark, where the square version is too heavy. */
  avatarSmall: "/media/avatar-x.webp",
  joined: "Bergabung pada Maret 2017",
  /** Character work credits, from the creator's own X bio. */
  credits: [
    { role: "Illustrator Live 2D", name: "@biittertaste" },
    { role: "Rig", name: "@saikafuri" },
  ],
} as const;

export const channels = {
  youtube: {
    label: "YouTube",
    handle: "@Deidey",
    url: "https://www.youtube.com/@Deidey",
    note: "Stream, cover, dan lore",
  },
  x: {
    label: "X",
    handle: "@deidey16_",
    url: "https://x.com/deidey16_",
    note: "Update harian",
  },
  shopee: {
    label: "Shopee",
    handle: "deideyisekaistore",
    url: "https://shopee.co.id/deideyisekaistore",
    note: "Merch resmi",
  },
} as const;

/**
 * Route table.
 *
 * Owned here rather than in App.tsx so the nav and the router cannot disagree
 * about which paths exist. App imports the type; nothing else needs the list.
 */
export const ROUTES = [
  "/",
  "/tentang",
  "/konten",
  "/konten/streams",
  "/konten/video",
  "/konten/clips",
  "/tweets",
  "/fanart",
  "/channel",
] as const;

export type Route = (typeof ROUTES)[number];

/** The creator's own hashtags, in the order the channel description lists them. */
/**
 * Hashtags, in the creator's own spelling.
 *
 * Only one is hers outright: `#Deyillust` is the tag her X bio names for fan
 * art ("use #Deyillust for fanart"), and it is what the fanart page searches.
 * The cap pattern is inconsistent in the wild -- `#Deyillust`, `#DeyIllust` and
 * `#deyillust` all appear on real posts by her and by artists reposting her --
 * so the listed set carries each casing that was actually seen rather than one
 * tidy version that would miss half the posts.
 */
export const hashtags = [
  { tag: "#Deyillust", use: "Fan art" },
  { tag: "#DeyIllust", use: "Fan art" },
  { tag: "#deyillust", use: "Fan art" },
] as const;

/**
 * Recurring stream formats, named as they appear in the feed titles.
 *
 * Counted from the live channel, not assumed: the eight most recent past streams
 * carry three distinct bracketed formats and one recurring game. The "kind"
 * column is a plain reading of the format, not a claim from the creator.
 */
export const series = [
  { name: "Plants vs. Zombies 2 Gardendless", kind: "Game" },
  { name: "Dungeon Karaoke", kind: "Musik" },
  { name: "Free Talk", kind: "Ngobrol" },
  { name: "Drawing Stream", kind: "Gambar" },
  { name: "Deidey's Lore", kind: "Serial" },
] as const;

/**
 * Colophon. A credit line naming who built the page. Kept as a footnote, not a
 * showcase section.
 */
export const colophon = {
  /** Credit line. Replaces a former tool list, which described the stack rather than the person. */
  credit: "Developed by Sakamura",
} as const;

/**
 * Nav links.
 *
 * Every href is a full route, never a bare "#anchor". That is the fix for the
 * footer bug: on /konten, "#tentang" and "#channel" resolved against a page that
 * has neither section, so both looked clickable and did nothing. A path always
 * resolves, and the nav and the router now read the same table.
 *
 * `satisfies` ties every href to the Route union, so a typo becomes a type error
 * rather than a link that quietly goes nowhere.
 */
export const navigation = [
  { label: "Tentang", href: "/tentang" },
  { label: "Konten", href: "/konten" },
  { label: "Tweets", href: "/tweets" },
  { label: "Fan Art", href: "/fanart" },
  { label: "Channel", href: "/channel" },
] as const satisfies ReadonlyArray<{ label: string; href: Route }>;
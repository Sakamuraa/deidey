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
  name: "Mizu Hamzazu",
  /** Name as it appears on the channel, verbatim. */
  channelTitle: "Mizu Hamzazu Ch.",
  /** Description as published by the creator, trimmed of decoration. */
  bio: "Hamster Princess, ID/EN VTuber. Salah satu putri dari kerajaan Hamzazu.",
  /**
   * Production origin. The site is served from its own subdomain, so the origin
   * and the site URL are the same thing. Kept in sync with index.html,
   * robots.txt, and sitemap.xml.
   */
  url: "https://mizuhamzazu.vtube-info.xyz",
  locale: "id_ID",
  avatar: "/media/avatar-youtube.webp",
  avatarAlt: "Ilustrasi Mizu Hamzazu: karakter anime berwarna rambut peach memakai mahkota emas",
  /** Smaller crop used for the nav mark, where the square version is too heavy. */
  avatarSmall: "/media/avatar-x.webp",
  joined: "Bergabung pada Juli 2021",
  /** Character work credits, from the creator's own X bio. */
  credits: [
    { role: "Model Live 2D", name: "@ardisketch_2d" },
    { role: "Rig", name: "@Gromb5" },
  ],
} as const;

export const channels = {
  youtube: {
    label: "YouTube",
    handle: "@MizuHamzazu",
    url: "https://www.youtube.com/@MizuHamzazu",
    note: "Stream dan klip",
  },
  x: {
    label: "X",
    handle: "@mizuhamzazu",
    url: "https://x.com/mizuhamzazu",
    note: "Update harian",
  },
  trakteer: {
    label: "Trakteer",
    handle: "trakteer.id/MizuHamzazu",
    url: "https://trakteer.id/MizuHamzazu/gift",
    note: "Support lewat gift",
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
export const hashtags = [
  { tag: "#MizuHammu", use: "General" },
  { tag: "#Mizuislive", use: "Live" },
  { tag: "#Mizungelag", use: "Meme" },
  { tag: "#forMizu", use: "Art" },
] as const;

/**
 * Series names exactly as they appear between the brackets in the feed titles.
 * The "kind" column is a plain reading of what the title is about, not a claim
 * from the creator.
 */
export const series = [
  { name: "Until Then", kind: "Game" },
  { name: "Morning Stream", kind: "Ngobrol" },
  { name: "Phasmophobia", kind: "Game" },
  { name: "Gartic.io", kind: "Game" },
  { name: "Super Market Simulator", kind: "Game" },
  { name: "Freetalk", kind: "Ngobrol" },
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
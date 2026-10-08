/**
 * Every string, URL, and image on the site, sourced from the real channel.
 *
 * Provenance, so nothing here has to be trusted on faith:
 *   - name, bio, hashtags ....... YouTube channel description + X profile bio
 *   - avatar .................... yt3.googleusercontent.com (channel avatar)
 *   - uploads ................... YouTube RSS, channel UCxpG2kuVIbbiGkbXe7Riqhw
 *   - join date ................. channel /about page, "Bergabung pada 17 Jul 2021"
 *
 * To refresh: pull the RSS again and update `uploads`. Nothing else moves.
 */

export const site = {
  name: "Mizu Hamzazu",
  /** Name as it appears on the channel, verbatim. */
  channelTitle: "Mizu Hamzazu Ch.",
  /** Description as published by the creator, trimmed of decoration. */
  bio: "Mizu, salah satu putri dari kerajaan Hamzazu. Hamster princess, ID/EN VTuber, Live 2D.",
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
    note: "Stream harian dan klip",
  },
  x: {
    label: "X",
    handle: "@mizuhamzazu",
    url: "https://x.com/mizuhamzazu",
    note: "Update cepat dan pengumuman",
  },
  trakteer: {
    label: "Trakteer",
    handle: "trakteer.id/MizuHamzazu",
    url: "https://trakteer.id/MizuHamzazu/gift",
    note: "Support lewat gift",
  },
} as const;

/** Creator's own hashtags, in the order the channel description lists them. */
export const hashtags = [
  { tag: "#MizuHammu", use: "General" },
  { tag: "#Mizuislive", use: "Live" },
  { tag: "#Mizungelag", use: "Meme" },
  { tag: "#forMizu", use: "Art" },
] as const;

/**
 * Eight most recent uploads, straight from the RSS feed.
 * `file` points at the thumbnail downloaded from i.ytimg.com into public/media.
 * Timestamps in the feed are UTC; `time` is already converted to WIB.
 */
export const uploads = {
  items: [
    {
      title: "『UNTIL THEN』kelanjutan setelah ketemu anak baru",
      file: "/media/upload-01.jpg",
      url: "https://www.youtube.com/watch?v=S6PD4T8H4Cw",
      day: "Rabu",
      time: "18.27 WIB",
    },
    {
      title: "『KuloNiku: Bowl Up !』Pinter masak bakso = menantu idaman",
      file: "/media/upload-02.jpg",
      url: "https://www.youtube.com/watch?v=bgnGUHwGNqs",
      day: "Kamis",
      time: "06.33 WIB",
    },
    {
      title: "『RABUATIF』design apa ya tudayyy",
      file: "/media/upload-03.jpg",
      url: "https://www.youtube.com/watch?v=XYDuOH8Q4-Y",
      day: "Rabu",
      time: "12.10 WIB",
    },
    {
      title: "『UNTIL THEN』kali ini beneran main until then",
      file: "/media/upload-04.jpg",
      url: "https://www.youtube.com/watch?v=8UlKFnlvo00",
      day: "Selasa",
      time: "19.18 WIB",
    },
    {
      title: "『PHASMOPHOBIA』nakutin atau ditakutin? ft. SilveragonAri dan RayRxyz",
      file: "/media/upload-05.jpg",
      url: "https://www.youtube.com/watch?v=M1ANn11KH2Q",
      day: "Senin",
      time: "22.11 WIB",
    },
    {
      title: "『GARTIC.IO』tebak gambar apa tebak perasaan?",
      file: "/media/upload-06.jpg",
      url: "https://www.youtube.com/watch?v=618FhJnhs8g",
      day: "Minggu",
      time: "18.01 WIB",
    },
    {
      title: "『Super Market Simulator』until then ngecrash",
      file: "/media/upload-07.jpg",
      url: "https://www.youtube.com/watch?v=It9c17pa3UY",
      day: "Sabtu",
      time: "12.13 WIB",
    },
    {
      title: "『MORNING STREAM』Bangun Tidur Langsung Yapping",
      file: "/media/upload-08.jpg",
      url: "https://www.youtube.com/watch?v=p493GuHW9HY",
      day: "Jumat",
      time: "11.27 WIB",
    },
  ],
} as const;

/** Series the channel actually runs, counted from the feed titles. */
export const series = [
  { name: "Until Then", kind: "Game" },
  { name: "Morning Stream", kind: "Ngobrol" },
  { name: "Phasmophobia", kind: "Game" },
  { name: "Gartic.io", kind: "Game" },
  { name: "Super Market Simulator", kind: "Game" },
  { name: "Freethink", kind: "Ngobrol" },
] as const;

/**
 * Colophon. Names the real tools behind the page so the visitor can see where
 * the build came from. Kept as a footnote, not a showcase section.
 */
export const colophon = {
  body: "Halaman statis, tanpa backend. Komponen dari 21st.dev, aturan visual dari Taste Skill.",
  tools: ["React", "Vite", "Tailwind v4", "Motion"],
} as const;

export const navigation = [
  { label: "Tentang", href: "#tentang" },
  { label: "Klip", href: "#klip" },
  { label: "Kanal", href: "#kanal" },
] as const;
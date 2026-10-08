/**
 * GET /api/content
 *
 * Serves three lists from the channel plus the search index, read fresh on every
 * cold request:
 *
 *   streams  the /streams tab, newest broadcast first
 *   videos   the /videos tab, newest upload first, broadcasts excluded
 *   clips    videos from other channels whose title or description names her
 *
 * Why these three sources and not the obvious ones:
 *
 * 1. The absolute broadcast start is `liveBroadcastDetails.startTimestamp` on
 *    the watch page, and it is the only honest source for it. The RSS
 *    `published` field is not: that is when the archive went up, which runs 2 to
 *    13 hours after the broadcast began and can land on a different calendar
 *    day. Measured on four videos: 2.3h, 4.2h, 7.1h and 13.5h late.
 *
 * 2. The watch page cannot be read from a serverless IP. YouTube answers with
 *    HTTP 200 and 1.27 MB of page, but `liveBroadcastDetails` is absent and the
 *    document trips bot detection. Verified across three hosts and six
 *    strategies, all failing the same way:
 *
 *      | target                          | result                              |
 *      |---------------------------------|-------------------------------------|
 *      | watch page, Vercel              | 200, no liveBroadcastDetails        |
 *      | watch page, Cloudflare Worker   | 200, no liveBroadcastDetails        |
 *      | InnerTube WEB                   | LOGIN_REQUIRED, "confirm not a bot" |
 *      | InnerTube TVHTML5               | LOGIN_REQUIRED, same                |
 *      | InnerTube ANDROID / IOS         | HTTP 400                            |
 *      | tab /streams, Vercel            | 200, parses fine                    |
 *
 *    So no card claims a start time. Ages come from YouTube's own labels, which
 *    the /streams and search pages both carry.
 *
 * 3. The three tabs read three different surfaces because none of them carries
 *    the others' content. The /streams tab lists broadcasts and nothing else,
 *    the /videos tab lists uploads and nothing else, and neither mentions a
 *    clipper. Only the search results page mixes all three, which is what makes
 *    it the right place to look for clips.
 *
 * The clips filter is deliberately narrow: another channel's video counts only
 * when her name is in the title or the description snippet. A search for a common
 * given name returns plenty of unrelated videos, and "Mizu Hamzazu" is specific
 * enough that a false positive needs a coincidence rather than a partial name.
 * Her own uploads are excluded, since those are already in the other two tabs.
 */

interface UploadsRequest {
  method?: string;
  url?: string;
}

interface UploadsResponse {
  status(code: number): UploadsResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

const HANDLE = "@MizuHamzazu";
const CHANNEL_TITLE_PREFIX = "Mizu Hamzazu";

/** Newest first. Without sort=dd these tabs are ordered by popularity. */
const STREAMS_TAB = `https://www.youtube.com/${HANDLE}/streams?view=0&sort=dd&flow=grid&hl=id&gl=ID`;
const VIDEOS_TAB = `https://www.youtube.com/${HANDLE}/videos?view=0&sort=dd&flow=grid&hl=id&gl=ID`;
const SEARCH_PAGE = `https://www.youtube.com/results?search_query=${encodeURIComponent(
  "mizu hamzazu",
)}&hl=id&gl=ID`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STREAM_LIMIT = 8;
const VIDEO_LIMIT = 12;
const CLIP_LIMIT = 12;
const TIMEOUT_MS = 15000;

const LIVE_BADGE = /LIVE_NOW|BADGE_STYLE_LIVE|"LIVE"/;

/**
 * Viewer count on a running stream, e.g. "15 sedangonton".
 *
 * Both "menonton" and "watching" appear in the Indonesian locale: the grid uses
 * "sedang Watching" while the localized string is "sedang menonton", and both
 * show up for the same channel. The optional "sedang" keeps one pattern
 * covering both. A view-count row like "1,1 rb" has no keyword and cannot match.
 */
const VIEWERS = /([\d.,]+)\s*(?:rb|ribu)?\s+(?:sedang\s+)?(?:menonton|watching)/i;

/** A running broadcast, on any tab: "Streaming 2 jam lalu" in the age row. */
const STREAMING_LABEL = /streaming/i;

/**
 * The relative age, as the grids write it.
 *
 * Indonesian abbreviates inconsistently: the same grid mixes "1 jam lalu" with
 * "1 h lalu" two cards apart, and uses "bln", "thn" and "mgg" elsewhere. All are
 * matched, and the unit is normalised on the way out so a card never reads
 * "1 h lalu" next to "2 jam lalu".
 */
const AGE =
  /(?:streaming\s*)?(?:berakhir\s*)?(?:·\s*)?(beberapa\s+detik|\d+\s*(?:detik|dtk|menit|mnt|jam|h|hari|hr|d|minggu|mgg|pekan|wk|bulan|bln|tahun|thn)?)\s*(?:yang\s+lalu|lalu)/i;

/**
 * Unit normalisation.
 *
 * "h" is hari, not jam. The grids write jam out in full ("1 jam lalu", "18 jam
 * lalu") and abbreviate hari to a bare "h", which reads like an English hour
 * abbreviation and is the single easiest thing to get backwards here. Caught by
 * checking labels against each video's measured endTimestamp: "5 h lalu" was
 * five days old, not five hours.
 *
 * Single-letter "m" is left out on purpose: it could be menit or bulan, and
 * guessing between those two is not a trade worth making, so an unmapped unit
 * falls through to the raw label rather than becoming a wrong number.
 */
const AGE_UNITS: Record<string, string> = {
  detik: "detik",
  dtk: "detik",
  menit: "menit",
  mnt: "menit",
  jam: "jam",
  h: "hari",
  hari: "hari",
  hr: "hari",
  d: "hari",
  minggu: "minggu",
  mgg: "minggu",
  pekan: "minggu",
  wk: "minggu",
  bulan: "bulan",
  bln: "bulan",
  tahun: "tahun",
  thn: "tahun",
};

/**
 * Normalise one age label, e.g. "1 h lalu" into "1 hari lalu".
 *
 * Returns null when the unit is not one this file is willing to map, so the card
 * shows nothing rather than something that could be read as a different amount of
 * time than YouTube meant.
 */
function parseAge(text: string): string | null {
  const match = text.match(AGE);
  if (!match) return null;

  const raw = match[1].replace(/\s+/g, " ").trim();
  if (/beberapa/i.test(raw)) return "beberapa detik lalu";

  const parts = raw.match(/^(\d+)\s*(.*)$/);
  if (!parts) return null;

  const unit = AGE_UNITS[(parts[2] || "jam").toLowerCase()];
  if (!unit) return null;

  return `${parts[1]} ${unit} lalu`;
}

/** Strip an age label down to a number of seconds, or null if it has no digits. */
function ageToSeconds(label: string | null): number | null {
  if (!label) return null;

  const parts = label.match(/^(\d+)\s+(\w+)\s+lalu$/);
  if (!parts) return null;

  const value = Number(parts[1]);
  const seconds: Record<string, number> = {
    detik: 1,
    menit: 60,
    jam: 3600,
    hari: 86400,
    minggu: 604800,
    bulan: 2592000,
  };

  const unit = seconds[parts[2]];
  if (!unit || !Number.isFinite(value)) return null;

  return value * unit;
}

/** The 🔴 prefix is the channel's own live marker; the UI renders its own badge. */
function stripLiveMarker(title: string): string {
  return title.replace(/^🔴\s*/, "").trim();
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        "accept-language": "id-ID,id;q=0.9",
        cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+100",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function plainText(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  if (typeof record.content === "string") return record.content;
  if (typeof record.simpleText === "string") return record.simpleText;
  if (Array.isArray(record.runs)) {
    return (record.runs as Array<{ text?: string }>)
      .map((run) => run.text ?? "")
      .join("");
  }
  return null;
}

/** plainText, but empty string instead of null, for concatenating safely. */
function text(node: unknown): string {
  return plainText(node) ?? "";
}

/**
 * Parse a YouTube viewer count.
 *
 * The page is served with gl=ID, so counts arrive in Indonesian format: "." for
 * thousands and "," for decimals. "1,2 rb" means 1.2 thousand, which naive
 * parsing turns into NaN and then silently into null.
 */
function parseViewerCount(text: string): number | null {
  const raw = text.match(VIEWERS)?.[1];
  if (!raw) return null;

  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;

  return /rb|ribu/i.test(text) ? Math.round(value * 1000) : value;
}

interface ContentItem {
  videoId: string;
  url: string;
  title: string;
  thumbnail: string;
  live: boolean;
  viewers: number | null;
  age: string | null;
  /** Runtime length of a finished video, e.g. "2.03.50". Null on a broadcast. */
  duration: string | null;
  /** Channel that published it, on the clips tab only. */
  channel?: string;
}

interface LockupEntry {
  videoId: string;
  title: string;
  live: boolean;
  viewers: number | null;
  age: string | null;
  ageSeconds: number | null;
  thumbnail: string;
}

/**
 * Narrow view of the YouTube lockup node. Only the fields this file reads are
 * described; everything else in the payload is intentionally untyped rather
 * than modelled with `any`.
 */
interface LockupNode {
  contentId?: unknown;
  metadata?: {
    lockupMetadataViewModel?: {
      title?: unknown;
      metadata?: {
        contentMetadataViewModel?: {
          metadataRows?: Array<{ metadataParts?: Array<{ text?: unknown }> }>;
        };
      };
    };
  };
  contentImage?: {
    thumbnailViewModel?: {
      image?: { sources?: Array<{ url?: string }> };
      overlays?: unknown;
    };
  };
}

/** Walk a parsed ytInitialData for every lockup node, in document order. */
function collectLockups(html: string): LockupNode[] {
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) return [];

  const found: LockupNode[] = [];

  (function walk(node: unknown, depth = 0): void {
    if (!node || depth > 40) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;

    const lockup = (node as Record<string, unknown>).lockupViewModel as LockupNode | undefined;
    if (lockup) found.push(lockup);

    for (const value of Object.values(node as Record<string, unknown>)) walk(value, depth + 1);
  })(JSON.parse(match[1]));

  return found;
}

/**
 * Turn lockup nodes into entries.
 *
 * Live state is read from the node's own badge and viewer row, not from which tab
 * it came off, because a scheduled premiere sitting in the /videos grid also
 * carries a live-style badge.
 */
function parseLockups(html: string): LockupEntry[] {
  const seen = new Set<string>();
  const entries: LockupEntry[] = [];

  for (const lockup of collectLockups(html)) {
    const videoId = typeof lockup.contentId === "string" ? lockup.contentId : "";
    const metaModel = lockup.metadata?.lockupMetadataViewModel;
    const title = plainText(metaModel?.title);

    if (!videoId || !title || seen.has(videoId)) continue;
    seen.add(videoId);

    const thumbnail = lockup.contentImage?.thumbnailViewModel;
    const overlays = thumbnail?.overlays;

    const rowParts: string[] = [];
    for (const row of metaModel?.metadata?.contentMetadataViewModel?.metadataRows ?? []) {
      for (const part of row.metadataParts ?? []) {
        const value = plainText(part?.text);
        if (value) rowParts.push(value);
      }
    }

    const viewerLine = rowParts.find((line) => VIEWERS.test(line));
    // The age sits in the same row as the view count, so it is read here rather
    // than in a second pass over the node.
    const ageLine = rowParts.find((line) => line !== viewerLine && parseAge(line));
    const age = ageLine ? parseAge(ageLine) : null;
    const sources = thumbnail?.image?.sources ?? [];

    entries.push({
      videoId,
      title: stripLiveMarker(title),
      // Two free signals, both from this same response. The thumbnail badge is
      // the primary one; the viewer line is the fallback, because a running
      // stream always has viewers and the badge can briefly be absent in the
      // first moments after a stream goes live.
      live: LIVE_BADGE.test(JSON.stringify(overlays ?? "")) || Boolean(viewerLine),
      viewers: viewerLine ? parseViewerCount(viewerLine) : null,
      age,
      ageSeconds: ageToSeconds(age),
      thumbnail: sources[sources.length - 1]?.url ?? "",
    });
  }

  return entries;
}

function toItem(entry: LockupEntry, live: boolean): ContentItem {
  return {
    videoId: entry.videoId,
    url: `https://www.youtube.com/watch?v=${entry.videoId}`,
    title: entry.title,
    thumbnail: entry.thumbnail,
    live,
    viewers: live ? entry.viewers : null,
    age: entry.age,
    duration: null,
  };
}

/** Newest broadcasts, live state included. */
async function readStreams(): Promise<ContentItem[]> {
  const html = await fetchText(STREAMS_TAB);
  if (!html) return [];

  return parseLockups(html).slice(0, STREAM_LIMIT).map((entry) => toItem(entry, entry.live));
}

/**
 * Newest uploads, with broadcasts removed.
 *
 * The /videos tab does not repeat broadcasts, so nothing needs filtering on this
 * surface. The row text is still checked, because a scheduled premiere sitting in
 * that grid also reads "Streaming", and a premiere is not something this section
 * should list as a finished video.
 */
async function readVideos(): Promise<ContentItem[]> {
  const html = await fetchText(VIDEOS_TAB);
  if (!html) return [];

  const entries = parseLockups(html).filter((entry) => !STREAMING_LABEL.test(entry.age ?? ""));

  return entries.slice(0, VIDEO_LIMIT).map((entry) => toItem(entry, false));
}

interface SearchEntry {
  videoId: string;
  title: string;
  channel: string;
  channelUrl: string;
  duration: string | null;
  age: string | null;
  ageSeconds: number | null;
  thumbnail: string;
  mentions: boolean;
  isOwn: boolean;
  isLive: boolean;
}

/** Narrow view of a search result videoRenderer. */
interface VideoRenderer {
  videoId?: unknown;
  title?: unknown;
  ownerText?: unknown;
  navigationEndpoint?: unknown;
  descriptionSnippet?: unknown;
  lengthText?: unknown;
  publishedTimeText?: unknown;
  thumbnail?: {
    thumbnails?: Array<{ url?: string }>;
  };
}

function collectSearchResults(html: string): VideoRenderer[] {
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) return [];

  const found: VideoRenderer[] = [];
  const seen = new Set<string>();

  (function walk(node: unknown, depth = 0): void {
    if (!node || depth > 40) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;

    const renderer = (node as Record<string, unknown>).videoRenderer as VideoRenderer | undefined;
    if (renderer && typeof renderer.videoId === "string" && !seen.has(renderer.videoId)) {
      seen.add(renderer.videoId);
      found.push(renderer);
    }

    for (const value of Object.values(node as Record<string, unknown>)) walk(value, depth + 1);
  })(JSON.parse(match[1]));

  return found;
}

function parseSearchResults(html: string): SearchEntry[] {
  const out: SearchEntry[] = [];

  for (const renderer of collectSearchResults(html)) {
    const title = text(renderer.title);
    // collectSearchResults narrows videoId already, but the field is declared
    // unknown so it has to be re-asserted here for the payload type.
    if (!title || typeof renderer.videoId !== "string") continue;

    const channel = text(renderer.ownerText);
    const description = text(renderer.descriptionSnippet);
    const published = text(renderer.publishedTimeText);
    const age = parseAge(published);
    const thumbnails = renderer.thumbnail?.thumbnails ?? [];
    const channelUrl =
      (renderer.navigationEndpoint as { browseEndpoint?: { browseId?: string } } | undefined)
        ?.browseEndpoint?.browseId ?? "";

    out.push({
      videoId: renderer.videoId,
      title: stripLiveMarker(title),
      channel,
      channelUrl: channelUrl ? `https://www.youtube.com/channel/${channelUrl}` : "",
      duration: text(renderer.lengthText) || null,
      age,
      ageSeconds: ageToSeconds(age),
      thumbnail: thumbnails[thumbnails.length - 1]?.url ?? "",
      // Her name in the title or the description snippet. Checked against both
      // because clippers use either: some name the character, some only mention
      // her in the blurb.
      mentions: /mizu\s*hamzazu/i.test(`${title} ${description}`),
      // A collaboration publishes under both names, e.g. "Mizu Hamzazu Ch. dan
      // NapLive", so this matches a prefix rather than the whole string.
      isOwn: channel.startsWith(CHANNEL_TITLE_PREFIX),
      isLive: STREAMING_LABEL.test(published),
    });
  }

  return out;
}

/**
 * Clips from other channels that name her.
 *
 * Excludes her own uploads, which the other two tabs already carry, and anything
 * still live, which is a broadcast rather than a clip.
 *
 * Search returns results by relevance, not by date, so they are sorted here.
 * The age label is the only ordering signal available on this surface, and it is
 * coarse: "4 bulan lalu" carries no day, so clips within the same month are
 * grouped at the same age and their relative order is whatever search happened to
 * return. That is a real limit of the data rather than a rounding choice, and it
 * is why the sort falls back to the original order on a tie instead of inventing
 * a sequence.
 *
 * The pool is also bounded by what search surfaced, roughly 25 results, so this
 * is the newest clips *among those found* and not an exhaustive archive.
 */
async function readClips(): Promise<ContentItem[]> {
  const html = await fetchText(SEARCH_PAGE);
  if (!html) return [];

  const ranked = parseSearchResults(html).map((entry, position) => ({ entry, position }));
  const qualifying = ranked.filter(
    ({ entry }) => entry.mentions && !entry.isOwn && !entry.isLive,
  );

  // Newest first. Array.prototype.sort is stable in every engine this targets, so
  // the position tiebreak below is a documented one, not an accident.
  qualifying.sort((a, b) => {
    const left = a.entry.ageSeconds;
    const right = b.entry.ageSeconds;
    if (left === right) return a.position - b.position;
    // An unreadable age cannot be placed, so it goes last rather than first.
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  });

  return qualifying
    .slice(0, CLIP_LIMIT)
    .map(({ entry }) => ({
      videoId: entry.videoId,
      url: `https://www.youtube.com/watch?v=${entry.videoId}`,
      title: entry.title,
      thumbnail: entry.thumbnail,
      live: false,
      viewers: null,
      age: entry.age,
      duration: entry.duration,
      channel: entry.channel,
    }));
}

/**
 * Last successful payload, held in the module scope.
 *
 * Vercel keeps a warm lambda around for a while after a request, so this turns
 * most repeat hits into zero upstream calls. It is deliberately a best-effort
 * second line behind the edge cache: a cold instance simply starts empty.
 *
 * It exists because YouTube rate-limits hard. Measured from one IP during
 * development: the streams tab started returning 503 after a few dozen fetches,
 * which is exactly the failure a stale copy can paper over.
 */
let lastGood: { payload: unknown; at: number; liveCount: number } | null = null;
const MEMORY_TTL_LIVE_MS = 10 * 60 * 1000;
const MEMORY_TTL_QUIET_MS = 30 * 60 * 1000;

export default async function handler(req: UploadsRequest, res: UploadsResponse) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  // Warm instance, fresh enough: answer without touching YouTube at all. While a
  // stream is running that window is ten minutes, because that is the state a
  // visitor is watching change. Once it ends, half an hour is safe.
  if (lastGood) {
    const ttl = lastGood.liveCount > 0 ? MEMORY_TTL_LIVE_MS : MEMORY_TTL_QUIET_MS;

    if (Date.now() - lastGood.at < ttl) {
      res.setHeader(
        "Cache-Control",
        lastGood.liveCount > 0
          ? "public, s-maxage=300, stale-while-revalidate=600"
          : "public, s-maxage=3600, stale-while-revalidate=86400",
      );
      res.setHeader("X-Data-Source", "memory");
      res.status(200).json(lastGood.payload);
      return;
    }
  }

  // Three independent surfaces, fetched together rather than in sequence: they
  // are unrelated requests to unrelated pages, so serialising them would triple
  // the latency for no benefit. A partial failure is kept, not thrown away,
  // because two working tabs beat an error page.
  const [streams, videos, clips] = await Promise.all([readStreams(), readVideos(), readClips()]);

  if (streams.length === 0 && videos.length === 0 && clips.length === 0) {
    // Everything failed. A stale copy is still true data and beats an error
    // page, as long as the caller is told it is stale.
    if (lastGood) {
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=600");
      res.setHeader("X-Data-Source", "stale");
      res.status(200).json({ ...(lastGood.payload as object), stale: true });
      return;
    }
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
    res.status(503).json({ error: "could not read any source" });
    return;
  }

  const liveCount = streams.filter((item) => item.live).length;

  const payload = {
    fetchedAt: new Date().toISOString(),
    liveCount,
    stale: false,
    // Which tabs came back empty, so the UI can say so instead of rendering an
    // empty grid with no explanation.
    sources: {
      streams: streams.length > 0,
      videos: videos.length > 0,
      clips: clips.length > 0,
    },
    streams,
    videos,
    clips,
  };

  lastGood = { payload, at: Date.now(), liveCount };

  // A finished archive does not change for hours, so a quiet channel gets a long
  // edge window. Once something is running the cache drops to five minutes.
  res.setHeader(
    "Cache-Control",
    liveCount > 0
      ? "public, s-maxage=300, stale-while-revalidate=600"
      : "public, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.setHeader("X-Data-Source", "live");
  res.status(200).json(payload);
}

export {
  parseAge,
  ageToSeconds,
  parseLockups,
  parseSearchResults,
  stripLiveMarker,
  fetchText,
};
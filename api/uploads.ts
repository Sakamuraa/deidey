/**
 * GET /api/uploads
 *
 * Serves the newest broadcasts plus live status, read fresh on every cold
 * request.
 *
 * Three findings shape this file, each verified against the live channel:
 *
 * 1. The RSS `published` timestamp is NOT the stream start time. It is when the
 *    archive went up, which runs 2 to 13 hours after the broadcast began and
 *    can land on a different calendar day. Measured on four videos: 2.3h, 4.2h,
 *    7.1h and 13.5h late. So it is never rendered as a start time.
 *
 * 2. The real broadcast start is `liveBroadcastDetails.startTimestamp` on the
 *    watch page, and it survives on finished archives too. The only other
 *    places to look were checked and rejected: the embed page is 9x smaller but
 *    carries no liveBroadcastDetails, and the InnerTube player endpoint returns
 *    liveBroadcastDetails as null for a plain WEB client.
 *
 * 3. The watch page is ~1.3 MB. Fetching it for all eight cards would pull ten
 *    megabytes per cold request and earn a rate limit. So it is fetched at most
 *    once, and only while a stream is actually running, which is exactly the one
 *    card where "mulai jam berapa" is worth anything. Finished cards carry no
 *    time rather than a wrong one.
 *
 * The list itself comes from the channel's /streams tab sorted newest first,
 * which is the only surface that reports live state, and reports it in the same
 * response as the list, so live detection costs zero extra requests.
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
/** Newest first. Without sort=dd this tab is ordered by popularity, not date. */
const STREAMS_TAB = `https://www.youtube.com/${HANDLE}/streams?view=0&sort=dd&flow=grid&hl=id&gl=ID`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const LIMIT = 8;
const TIMEOUT_MS = 7000;
const CHANNEL_TZ_OFFSET_HOURS = 7; // WIB

const LIVE_BADGE = /LIVE_NOW|BADGE_STYLE_LIVE|"LIVE"/;
/**
 * Viewer count on a running stream, e.g. "15 sedang menonton".
 *
 * Both "menonton" and "watching" appear in the Indonesian locale: the grid uses
 * "sedang Watching" while the localized string is "sedang menonton", and both
 * show up for the same channel. The optional "sedang" keeps one pattern
 * covering both. A view-count row like "1,1 rb" has no keyword and cannot match.
 */
const VIEWERS = /([\d.,]+)\s*(?:rb|ribu)?\s+(?:sedang\s+)?(?:menonton|watching)/i;

/** The 🔴 prefix is the channel's own live marker; the UI renders its own badge. */
function stripLiveMarker(title: string): string {
  return title.replace(/^🔴\s*/, "").trim();
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, "accept-language": "id-ID,id;q=0.9" },
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

interface StreamEntry {
  videoId: string;
  title: string;
  live: boolean;
  viewers: number | null;
  thumbnail: string | null;
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

function parseStreamsTab(html: string): StreamEntry[] {
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) return [];

  const seen = new Set<string>();
  const entries: StreamEntry[] = [];

  (function walk(node: unknown, depth = 0): void {
    if (!node || depth > 40) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    const lockup = record.lockupViewModel as LockupNode | undefined;

    if (lockup) {
      const videoId = typeof lockup.contentId === "string" ? lockup.contentId : "";
      const metaModel = lockup.metadata?.lockupMetadataViewModel;
      const title = plainText(metaModel?.title);

      if (videoId && title && !seen.has(videoId)) {
        seen.add(videoId);

        const thumbnail = lockup.contentImage?.thumbnailViewModel;
        const overlays = thumbnail?.overlays;

        const rowParts: string[] = [];
        for (const row of metaModel?.metadata?.contentMetadataViewModel?.metadataRows ?? []) {
          for (const part of row.metadataParts ?? []) {
            const text = plainText(part?.text);
            if (text) rowParts.push(text);
          }
        }
        const viewerLine = rowParts.find((line) => VIEWERS.test(line));
        const sources = thumbnail?.image?.sources ?? [];

        entries.push({
          videoId,
          title: stripLiveMarker(title),
          // Two free signals, both from this same response. The thumbnail badge
          // is the primary one; the viewer line is the fallback, because a
          // running stream always has viewers and the badge can briefly be
          // absent in the first moments after a stream goes live.
          live: LIVE_BADGE.test(JSON.stringify(overlays ?? "")) || Boolean(viewerLine),
          viewers: viewerLine ? parseViewerCount(viewerLine) : null,
          thumbnail: sources[sources.length - 1]?.url ?? null,
        });
      }
    }

    for (const value of Object.values(record)) walk(value, depth + 1);
  })(JSON.parse(match[1]));

  return entries;
}

function toWib(iso: string): { day: string; time: string; date: string } {
  const shifted = new Date(new Date(iso).getTime() + CHANNEL_TZ_OFFSET_HOURS * 3600 * 1000);
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  return {
    date: iso.slice(0, 10),
    day: days[shifted.getUTCDay()],
    time: `${String(shifted.getUTCHours()).padStart(2, "0")}.${String(shifted.getUTCMinutes()).padStart(2, "0")} WIB`,
  };
}

/**
 * Read the true broadcast start for one video, from the watch page.
 * Returns null on any failure; the caller treats that as "no time to show".
 */
async function readStartTime(videoId: string): Promise<string | null> {
  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);
  if (!html) return null;
  const raw = html.match(/"liveBroadcastDetails":\{[^}]*"startTimestamp":"([^"]+)"/)?.[1];
  return raw ?? null;
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
let lastGood: { payload: unknown; at: number } | null = null;
const MEMORY_TTL_MS = 10 * 60 * 1000;

export default async function handler(req: UploadsRequest, res: UploadsResponse) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  // Warm instance, fresh enough: answer without touching YouTube at all.
  if (lastGood && Date.now() - lastGood.at < MEMORY_TTL_MS) {
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.setHeader("X-Data-Source", "memory");
    res.status(200).json(lastGood.payload);
    return;
  }

  const html = await fetchText(STREAMS_TAB);
  const streams = html ? parseStreamsTab(html) : [];

  if (streams.length === 0) {
    // Upstream failed. A stale copy is still true data and beats an error page,
    // as long as the caller is told it is stale.
    if (lastGood) {
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=600");
      res.setHeader("X-Data-Source", "stale");
      res.status(200).json({ ...(lastGood.payload as object), stale: true });
      return;
    }
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
    res.status(503).json({ error: "could not read the channel" });
    return;
  }

  const top = streams.slice(0, LIMIT);
  // One watch-page fetch, and only while something is running. A live stream is
  // always the newest entry.
  const liveIndex = top.findIndex((entry) => entry.live);
  const liveStart = liveIndex >= 0 ? await readStartTime(top[liveIndex].videoId) : null;

  const uploads = top.map((entry, index) => {
    const startTime = index === liveIndex && liveStart ? toWib(liveStart) : null;

    return {
      videoId: entry.videoId,
      url: `https://www.youtube.com/watch?v=${entry.videoId}`,
      title: entry.title,
      thumbnail: entry.thumbnail,
      live: entry.live,
      viewers: entry.live ? entry.viewers : null,
      // Only the running stream gets a start time. Deliberately null otherwise:
      // the cheap source for it is wrong by hours and the accurate source is
      // too expensive to fetch eight times.
      startedAt: startTime?.time ?? null,
      startedDay: startTime?.day ?? null,
    };
  });

  const payload = {
    fetchedAt: new Date().toISOString(),
    liveCount: uploads.filter((upload) => upload.live).length,
    stale: false,
    uploads,
  };

  lastGood = { payload, at: Date.now() };

  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.setHeader("X-Data-Source", "live");
  res.status(200).json(payload);
}

export { parseStreamsTab, parseViewerCount, toWib, stripLiveMarker, readStartTime };
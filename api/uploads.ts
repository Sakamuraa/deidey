/**
 * GET /api/uploads
 *
 * Serves the newest broadcasts plus live status, read fresh on every cold
 * request.
 *
 * What this file used to do, and why it stopped:
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
 *    A committed `KNOWN_STARTS` table covered that, at the cost of a manual row
 *    per broadcast. It was deleted rather than kept, because a relative age
 *    turns out to need none of it.
 *
 * 3. The relative age is already in the /streams metadata rows, as
 *    "Streaming 5 jam lalu". That endpoint answers from Vercel, so the card gets
 *    an age with zero extra requests, zero new dependencies, and nothing to
 *    maintain by hand.
 *
 * The trade is explicit: this is YouTube's own label for how long ago the
 * archive was published, which is not the same as how long ago the stream
 * started. That is the same number YouTube shows on the channel's own grid, and
 * the cards no longer claim to be a start time.
 *
 * The list comes from the /streams tab sorted newest first, the only surface
 * that reports live state, and it reports it in the same response as the list,
 * so live detection costs zero extra requests.
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
const TIMEOUT_MS = 15000;

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

/**
 * The relative age, as the grid writes it.
 *
 * Indonesian locale puts the keyword before the age, optionally with a bullet
 * and a "berakhir" for finished streams, and it abbreviates inconsistently:
 * the same grid mixes "1 jam lalu" with "1 h lalu" two cards apart. Both are
 * matched, and the unit is normalised on the way out so a card never reads
 * "1 h lalu" next to "2 jam lalu".
 */
const AGE =
  /(?:streaming\s*)?(?:berakhir\s*)?(?:·\s*)?(beberapa\s+detik|\d+\s*(?:detik|dtk|menit|mnt|jam|h|hari|hr|d|minggu|mgg|pekan|wk|bulan|bln|tahun|thn)?)\s*(?:yang\s+lalu|lalu)/i;

/**
 * Unit normalisation.
 *
 * "h" is hari, not jam. The grid writes jam out in full ("1 jam lalu", "18 jam
 * lalu") and abbreviates hari to a bare "h", which reads like an English hour
 * abbreviation and is the single easiest thing to get backwards here. Caught by
 * checking the labels against each video's measured endTimestamp: "5 h lalu"
 * was five days old, not five hours.
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
 * Normalise one age label, e.g. "1 h lalu" into "1 jam lalu".
 *
 * Returns null when the unit is not one this file is willing to map, so the
 * card shows nothing rather than something that could be read as a different
 * amount of time than YouTube meant.
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
  age: string | null;
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
        // The age sits in the same row as the view count, so it is read here
        // rather than in a second pass over the node.
        const ageLine = rowParts.find((line) => line !== viewerLine && parseAge(line));
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
          age: ageLine ? parseAge(ageLine) : null,
          thumbnail: sources[sources.length - 1]?.url ?? null,
        });
      }
    }

    for (const value of Object.values(record)) walk(value, depth + 1);
  })(JSON.parse(match[1]));

  return entries;
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

  const uploads = streams.slice(0, LIMIT).map((entry) => ({
    videoId: entry.videoId,
    url: `https://www.youtube.com/watch?v=${entry.videoId}`,
    title: entry.title,
    thumbnail: entry.thumbnail,
    live: entry.live,
    viewers: entry.live ? entry.viewers : null,
    // "5 jam lalu", as YouTube's own grid writes it. Not a start time, and the
    // card does not present it as one.
    age: entry.age,
  }));

  const liveCount = uploads.filter((upload) => upload.live).length;

  const payload = {
    fetchedAt: new Date().toISOString(),
    liveCount,
    stale: false,
    uploads,
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

export { parseStreamsTab, parseViewerCount, parseAge, stripLiveMarker, fetchText };
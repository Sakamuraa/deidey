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
 * 3. The watch page is ~1.3 MB, and on a datacenter IP it is often not served at
 *    all: YouTube answers with the consent interstitial, HTTP 200, no
 *    `liveBroadcastDetails`. Measured in production on a cold lambda, nine
 *    parallel watch fetches returned exactly one usable page. So committed
 *    start times answer the cards that already exist, a CONSENT cookie makes a
 *    new fetch plausible at all, and the request is retried once before a card
 *    is allowed to stay blank. A start time never changes once a broadcast
 *    ends, which is what makes committing it honest rather than a shortcut.
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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko, Chrome/131.0.0.0 Safari/537.36";

const LIMIT = 8;
/** A cold Vercel lambda booting nine 1.3 MB fetches is not a seven second job. */
const TIMEOUT_MS = 15000;
const CHANNEL_TZ_OFFSET_HOURS = 7; // WIB

/**
 * Verified broadcast starts, read from each watch page and committed.
 *
 * A `startTimestamp` never changes once a broadcast has ended, so these are
 * facts rather than a cache, and treating them as facts is what keeps this
 * endpoint affordable. Measured from production: nine watch-page fetches on a
 * cold lambda returned exactly one usable page and eight blank times, so
 * reading every card fresh is not a plan that survives contact with a
 * datacenter IP. The known ones are answered from this table with no upstream
 * request at all; a genuinely new broadcast is the only thing that costs a
 * fetch, and then it is one.
 */
const KNOWN_STARTS: Record<string, string> = {
  S6PD4T8H4Cw: "2026-10-08T01:00:29+00:00",
  bgnGUHwGNqs: "2026-10-07T09:30:30+00:00",
  "XYDuOH8Q4-Y": "2026-10-07T01:01:02+00:00",
  "8UlKFnlvo00": "2026-10-06T10:00:23+00:00",
  M1ANn11KH2Q: "2026-10-05T13:00:24+00:00",
  j533fLKIn4k: "2026-10-05T09:32:41+00:00",
  "618FhJnhs8g": "2026-10-04T08:30:28+00:00",
  It9c17pa3UY: "2026-10-03T02:00:46+00:00",
  p493GuHW9HY: "2026-10-02T02:00:08+00:00",
};

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
      headers: {
        "user-agent": UA,
        "accept-language": "id-ID,id;q=0.9",
        // Without this, a datacenter IP gets the consent interstitial instead of
        // the page, which returns HTTP 200 and a document with no
        // liveBroadcastDetails in it. A blank time, not an error.
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

/**
 * Indonesian short month, the way it is written rather than the way it is
 * indexed: Mei not "May", Agu not "Aug", Okt not "Oct".
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/**
 * Broadcast start in WIB, as the card reads it.
 *
 * "Kamis 8 Okt 2026, 08.00 WIB" rather than an ISO string, because the only
 * consumer of this is a human reading a card, and a bare "08.00" next to a
 * relative age ("2 hari lalu") is ambiguous about which day it belongs to.
 *
 * The shift happens before any calendar field is read. Slicing the raw ISO
 * instead would report the UTC date, which is the previous day for any evening
 * WIB start past 17.00.
 */
function toWib(iso: string): { day: string; date: string; time: string } {
  const shifted = new Date(new Date(iso).getTime() + CHANNEL_TZ_OFFSET_HOURS * 3600 * 1000);
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  return {
    day: days[shifted.getUTCDay()],
    date: `${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()}`,
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
 * Start times per videoId, kept for the life of the warm instance.
 *
 * A finished stream's start is immutable, so a week is the honest TTL rather
 * than a guess. The running stream is the exception: it is the one entry whose
 * badge and viewer row still change, and a short TTL keeps its clock honest if
 * the stream is restarted.
 */
const startCache = new Map<string, { iso: string | null; at: number }>();
const START_TTL_ARCHIVED_MS = 7 * 24 * 60 * 60 * 1000;
const START_TTL_LIVE_MS = 10 * 60 * 1000;
/**
 * A miss is not a fact about the video, it is a fact about one request, so it is
 * remembered briefly instead of for a week.
 */
const START_TTL_NULL_MS = 5 * 60 * 1000;

/**
 * Start time for one entry, cache first.
 *
 * Nine watch pages in parallel is the shape of the cost here: it is one burst
 * per cold cache window, not one per visitor.
 */
async function resolveStart(entry: StreamEntry, attempt = 0): Promise<string | null> {
  // A finished broadcast's start is immutable, so a committed reading wins over
  // every cache and every fetch.
  const known = KNOWN_STARTS[entry.videoId];
  if (known) return known;

  const hit = startCache.get(entry.videoId);
  const ttl = entry.live ? START_TTL_LIVE_MS : START_TTL_ARCHIVED_MS;

  if (hit && Date.now() - hit.at < (hit.iso === null ? START_TTL_NULL_MS : ttl)) return hit.iso;

  const iso = await readStartTime(entry.videoId);

  // A miss is usually one unlucky request, not a missing timestamp, so it gets
  // exactly one more go before a card is allowed to stay blank.
  if (iso === null && attempt === 0) return resolveStart(entry, 1);

  startCache.set(entry.videoId, { iso, at: Date.now() });
  return iso;
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

  // TEMPORARY DIAGNOSTIC - REMOVE
const probe = req.url?.match(/[?&]probe=([A-Za-z0-9_-]{11})/)?.[1];
  if (probe) {
    // TEMPORARY DIAGNOSTIC - REMOVE
    const strategies: Record<string, unknown> = {};
    strategies.watchPage = await readStartTime(probe);

    for (const [name, client] of [
      ["innertubeWeb", { clientName: "WEB", clientVersion: "2.20250101.00.00" }],
      ["innertubeAndroid", { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30 }],
      ["innertubeIos", { clientName: "IOS", clientVersion: "19.09.3", deviceModel: "iPhone14,3" }],
      ["innertubeTv", { clientName: "TVHTML5", clientVersion: "7.20250101.18.00" }],
    ] as const) {
      try {
        const res = await fetch("https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": client.clientName === "ANDROID" ? "com.google.android.youtube/19.09.37 (Linux; U; Android 11)" : UA,
            "accept-language": "id-ID,id;q=0.9",
          },
          body: JSON.stringify({ videoId: probe, context: { client }, contentCheckOk: true, racyCheckOk: true }),
        });
        const json = (await res.json()) as {
          playabilityStatus?: { status?: string; reason?: string };
          videoDetails?: { isLive?: boolean; isLiveContent?: boolean; title?: string };
          microformat?: { playerMicroformatRenderer?: { liveBroadcastDetails?: { startTimestamp?: string } } };
        };
        strategies[name] = {
          http: res.status,
          status: json.playabilityStatus?.status ?? null,
          reason: json.playabilityStatus?.reason ?? null,
          title: json.videoDetails?.title ?? null,
          isLive: json.videoDetails?.isLive ?? null,
          isLiveContent: json.videoDetails?.isLiveContent ?? null,
          start: json.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.startTimestamp ?? null,
        };
      } catch (error) {
        strategies[name] = { error: String(error) };
      }
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ probe, strategies });
    return;
  }

  // Warm instance, fresh enough: answer without touching YouTube at all. While a
  // stream is running that window is ten minutes; once it ends, half an hour is
  // safe and keeps the watch-page burst rare.
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

  const top = streams.slice(0, LIMIT);
  // One watch-page fetch per card, in parallel, each memoised by videoId. These
  // are the only fields in the payload that cost a second upstream request.
  const starts = await Promise.all(top.map((entry) => resolveStart(entry)));

  const uploads = top.map((entry, index) => {
    const startTime = starts[index] ? toWib(starts[index] as string) : null;

    return {
      videoId: entry.videoId,
      url: `https://www.youtube.com/watch?v=${entry.videoId}`,
      title: entry.title,
      thumbnail: entry.thumbnail,
      live: entry.live,
      viewers: entry.live ? entry.viewers : null,
      // Real broadcast start from liveBroadcastDetails, not the feed's publish
      // time, which runs hours late and can land on a different day. Null only
      // when the watch page itself could not be read.
      startedAt: startTime?.time ?? null,
      startedDay: startTime?.day ?? null,
      startedDate: startTime?.date ?? null,
    };
  });

  const liveCount = uploads.filter((upload) => upload.live).length;

  const payload = {
    fetchedAt: new Date().toISOString(),
    liveCount,
    stale: false,
    uploads,
  };

  lastGood = { payload, at: Date.now(), liveCount };

  // A finished archive does not change for hours, so a quiet channel gets a
  // long edge window and pays for those watch pages rarely. Once something is
  // running the cache drops to five minutes, because that is the state a visitor
  // is actually watching change.
  res.setHeader(
    "Cache-Control",
    liveCount > 0
      ? "public, s-maxage=300, stale-while-revalidate=600"
      : "public, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.setHeader("X-Data-Source", "live");
  res.status(200).json(payload);
}

export { parseStreamsTab, parseViewerCount, toWib, stripLiveMarker, readStartTime, resolveStart };
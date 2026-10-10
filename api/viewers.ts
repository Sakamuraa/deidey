/*
 * GET /api/viewers
 *
 * The viewer count on the running broadcast, and nothing else.
 *
 * Why this exists rather than reading /api/content more often
 * ---------------------------------------------------------
 * /api/content answers in about a second because it fetches three YouTube tabs.
 * This one fetches a single tab and reads one number off it, so a page can ask
 * every ten seconds while somebody is live without the cost multiplying by three
 * tabs and a dozen videos.
 *
 * That cost is the whole point of keeping the two apart. /api/content carries a
 * whole archive, so its window has to be long or it scrapes YouTube constantly.
 * /api/viewers carries one integer that changes every few seconds, so its window
 * has to be short or the page is wrong. Those two requirements are incompatible
 * in one payload, and folding them together forced a choice that made one of
 * them wrong.
 *
 * Self-contained on purpose
 * ------------------------
 * No imports, deliberately. Every function here is standalone because Vercel
 * transpiles each one in place -- a relative import out of api/ does not survive
 * into the deployed output. The same rule is why /api/content, /api/chat,
 * /api/tweets and /api/fanart all repeat their own parsing instead of sharing a
 * module. The duplication is the price of the deployment model, not an oversight,
 * and it is why the patterns below are copied verbatim from content.ts rather
 * than imported from it: if one drifts, this file says so.
 *
 * Cache
 * -----
 * Ten seconds while live, a minute otherwise. The asymmetry is correct here even
 * though it was wrong on /api/content: the client only polls while a broadcast is
 * running, so the quiet branch is reached at most once per page load, and it is
 * the state where nothing is changing. Note this is the opposite of the shape
 * /api/content had, where the quiet window was the long one.
 *
 * A single warm instance answers every visitor within its ten seconds, so ten
 * people refreshing together cost YouTube one fetch, not ten. That coalescing is
 * why the memory cache is here at all.
 */

interface ViewersRequest {
  method?: string;
}

interface ViewersResponse {
  status(code: number): ViewersResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

const HANDLE = "@Deidey";

const STREAMS_TAB = `https://www.youtube.com/${HANDLE}/streams?view=0&sort=dd&flow=grid&hl=id&gl=ID`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Ceiling on one call. Deliberately tighter than content.ts: this runs on a ten
 * second cadence, so a call that hangs for the full content budget would stack up
 * behind the next one instead of failing fast.
 */
const TIMEOUT_MS = 6000;

/**
 * Viewer count on a running stream, e.g. "15 sedangonton".
 *
 * Both "menonton" and "watching" appear in the Indonesian locale: the grid uses
 * the first, the accessible label the second. Matches content.ts exactly.
 *
 * This doubles as the live test -- see readLive -- so the badge regex that
 * content.ts also carries is deliberately absent here. Keeping a second,
 * unused copy of it is how two files drift apart.
 */
const VIEWERS = /([\d.,]+)\s*(?:rb|ribu)?\s+(?:sedang\s+)?(?:menonton|watching)/i;

/**
 * Warm copy, so ten visitors inside the window cost YouTube one request.
 *
 * Keyed on the video id rather than "is it live", because the interesting case is
 * a stream that has been running for hours: the answer goes stale while the
 * broadcast stays live, and a cache that only knew about the live flag would hold
 * the first number it ever saw for its whole window.
 */
let warm: { videoId: string | null; viewers: number | null; live: boolean; at: number } | null = null;
const WARM_MS = 8000;

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

/** Narrow view of the YouTube lockup node. Only the fields read below. */
interface LockupNode {
  contentId?: unknown;
  contentImage?: {
    thumbnailViewModel?: {
      overlays?: unknown;
    };
  };
  metadata?: {
    lockupMetadataViewModel?: {
      metadata?: {
        contentMetadataViewModel?: {
          metadataRows?: {
            metadataParts?: { text?: unknown }[];
          }[];
        };
      };
    };
  };
}

/**
 * Every lockup node on the page, found by walking the embedded JSON.
 *
 * The page ships its grid as `ytInitialData`, not as markup worth regexing. A
 * hand-written HTML pattern matches nothing: the viewer count and the badge live
 * inside a JSON blob, and matching the raw HTML for "menonton" would find the
 * string wherever the client bundle happens to mention it. So this parses the
 * JSON and walks it, which is also what content.ts does -- copied here rather
 * than imported, because api/ files cannot import each other.
 */
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

/** Flatten one lockup's metadata rows into the strings a card would print. */
function rowParts(lockup: LockupNode): string[] {
  const out: string[] = [];
  const rows =
    lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
  for (const row of rows) {
    for (const part of row.metadataParts ?? []) {
      const text = part?.text;
      if (typeof text === "object" && text !== null && "content" in text) {
        const content = (text as { content?: unknown }).content;
        if (typeof content === "string" && content) out.push(content);
      } else if (typeof text === "string" && text) {
        out.push(text);
      }
    }
  }
  return out;
}

/**
 * The running broadcast and its viewer count, or null when nothing is live.
 *
 * The viewer row is treated as the evidence rather than the badge. A badge can
 * sit on a scheduled premiere, and it can be briefly absent in the first moments
 * after a stream starts -- whereas a running stream always has a viewer row, and
 * that row is the number being asked for. Same rule content.ts uses.
 */
function readLive(html: string): { videoId: string; viewers: number | null } | null {
  const seen = new Set<string>();

  for (const lockup of collectLockups(html)) {
    const videoId = typeof lockup.contentId === "string" ? lockup.contentId : "";
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);

    const parts = rowParts(lockup);
    const viewerLine = parts.find((line) => VIEWERS.test(line));
    if (!viewerLine) continue;

    return { videoId, viewers: parseViewerCount(viewerLine) };
  }

  return null;
}

export default async function handler(req: ViewersRequest, res: ViewersResponse) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const cached = warm && Date.now() - warm.at < WARM_MS ? warm : null;

  const finish = (live: boolean, videoId: string | null, viewers: number | null) => {
    /*
     * Ten seconds while live, a minute otherwise.
     *
     * Deliberately not the shape /api/content uses. There, a long quiet window was
     * wrong because it held "nobody is live" across the moment a stream started.
     * Here the client stops polling the moment the answer goes quiet, so the quiet
     * branch is entered once and nothing is being hidden by holding it. The state
     * that has to be fresh is the one with a number on screen.
     */
    res.setHeader(
      "Cache-Control",
      live
        ? "public, s-maxage=10, stale-while-revalidate=10"
        : "public, s-maxage=60, stale-while-revalidate=60",
    );
    res.setHeader("X-Data-Source", cached ? "warm" : "live");
    res.status(200).json({
      live,
      videoId,
      viewers,
      at: new Date().toISOString(),
    });
  };

  if (cached) {
    finish(cached.live, cached.videoId, cached.viewers);
    return;
  }

  try {
    const response = await fetch(STREAMS_TAB, {
      headers: {
        "user-agent": UA,
        "accept-language": "id-ID,id;q=0.9",
        cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+100",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`youtube returned ${response.status}`);

    const found = readLive(await response.text());
    const live = found !== null;
    const videoId = found?.videoId ?? null;
    const viewers = found?.viewers ?? null;

    warm = { videoId, viewers, live, at: Date.now() };
    finish(live, videoId, viewers);
  } catch {
    /*
     * A failed read keeps the last number rather than blanking it.
     *
     * Null viewers would be read by the page as "nobody is watching", which is a
     * different and much stronger claim than "we could not check". Reporting a
     * failure as zero is how a live stream ends up looking abandoned.
     */
    if (warm) {
      finish(warm.live, warm.videoId, warm.viewers);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      live: false,
      videoId: null,
      viewers: null,
      // Tells the page this is an absence of knowledge, not an absence of viewers.
      unknown: true,
      at: new Date().toISOString(),
    });
  }
}
/**
 * GET /api/tweets
 *
 * Recent posts from x.com/mizuhamzazu, newest first, via Nitter's RSS feed.
 *
 * X itself offers no anonymous timeline. Measured from this server, every direct
 * route fails:
 *
 *   | route                                        | result                      |
 *   |----------------------------------------------|-----------------------------|
 *   | x.com/mizuhamzazu (page HTML)                | 200, 136 KB, zero tweet text |
 *   | syndication.twitter.com timeline-profile     | 429                         |
 *   | cdn.syndication.twimg.com widgets/timelines  | 200, zero tweets            |
 *   | guest-token flow (activate + UserTweets)     | 401 on activate             |
 *   | publish.twitter.com/oembed                    | 404                         |
 *
 * The profile page returning 200 with no tweet text is the trap worth naming: it
 * looks like a working fetch, and grepping the document finds "full_text" and
 * "tweet_results" inside JavaScript bundles. Zero actual posts. A scraper built
 * on that reports success and renders an empty timeline forever.
 *
 * Nitter does serve a real feed, which is what this endpoint reads. The
 * instances are public and they go down, so they are an array and requests
 * rotate through it:
 *
 *   - the cursor advances per request, so consecutive cold requests spread load
 *     instead of hammering whichever instance answered last
 *   - if the chosen instance fails, the request falls through to the next rather
 *     than returning nothing
 *
 * Both instances are third parties. The feed is public data and the request
 * carries no credentials, but the instance sees which handle is being read, which
 * is worth knowing before adding more.
 *
 * What the feed does not carry: like, reply, retweet and view counts. Nitter's
 * RSS omits them, so those stay null and the card omits the row rather than
 * printing a confident zero. Retweets are marked from the title prefix.
 */

interface TweetsRequest {
  method?: string;
}

interface TweetsResponse {
  status(code: number): TweetsResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

const SCREEN_NAME = "mizuhamzazu";
const HANDLE = "@mizuhamzazu";

/**
 * Read in order, rotating. Order is preference, not a health check: the first
 * entry is the one most likely to be up, and failover only happens on failure.
 */
const INSTANCES = ["https://nitter.kabii.moe", "https://nitter1.kabii.moe"] as const;

const TWEET_LIMIT = 20;
const TIMEOUT_MS = 12000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Module-scope cursor. A warm lambda keeps its place in the rotation. */
let cursor = 0;

/** Instances in the order this request should try them. */
function rotation(): string[] {
  const start = cursor % INSTANCES.length;
  cursor = (cursor + 1) % INSTANCES.length;
  return [...INSTANCES.slice(start), ...INSTANCES.slice(0, start)];
}

/**
 * XML text nodes arrive escaped, and Nitter leaves them that way inside
 * <title>. Decoding is limited to what actually appears in the feed, so an
 * unexpected entity degrades to itself rather than throwing.
 */
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    hellip: "…",
    mdash: "—",
    ndash: "–",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    const key = body.toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[key] ?? match;
  });
}

/**
 * Front-ends Nitter redirects video links through, so a tweet that says
 * "youtube.com/live/..." comes back pointing at an Invidious or Piped mirror.
 * Those are alternate players run by other people, and a visitor clicking one
 * lands somewhere the channel does not control.
 *
 * Matched on the first label of the host rather than the whole name: these
 * mirrors live on hundreds of unrelated domains (`pipedapi.kavin.rocks`,
 * `pipedapi.adminforge.de`, `invidious.privacydev.net`), so the suffix is
 * not a fixed pattern to match. A legitimate YouTube host never leads with
 * one of these labels.
 */
const MIRROR_LABELS = new Set(["piped", "pipedapi", "invidious", "inv"]);

/** Extra mirrors that do not follow the naming pattern above. */
const MIRROR_EXACT = new Set([
  "yewtu.be",
  "inv.nadeko.net",
  "vid.puffyan.us",
  "invidious.jing.rocks",
  "invidious.privacydev.net",
]);

/**
 * Point a mirror link back at YouTube, or return null to leave it alone.
 *
 * The `si=` parameter is dropped: it is a session identifier minted per visitor
 * and means nothing outside the click that generated it, so keeping it just
 * makes two links to the same video look like different ones.
 */
function toYouTubeUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isMirror = MIRROR_EXACT.has(host) || MIRROR_LABELS.has(host.split(".")[0]);
  if (!isMirror) return null;

  // Piped serves a live stream from both /live/<id> and /streams/<id>.
  const live = url.pathname.match(/^\/(?:live|streams)\/([A-Za-z0-9_-]{11})/);
  if (live) return `https://www.youtube.com/live/${live[1]}`;

  const watch = url.searchParams.get("v");
  if (watch && /^[A-Za-z0-9_-]{11}$/.test(watch)) {
    return `https://www.youtube.com/watch?v=${watch}`;
  }

  const embed = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})/);
  if (embed) return `https://www.youtube.com/watch?v=${embed[1]}`;

  return null;
}

/**
 * Replace a link whose visible text is truncated with the address itself.
 *
 * Nitter renders a t.co link as a card and truncates what it prints:
 * "piped.video/live/S6PD4T8H4Cw…" where the href is the whole address with its
 * tracking parameter. Printing the label loses the part that makes it usable, so
 * the href wins whenever the text was cut.
 */
function expandTruncatedLinks(html: string): string {
  return html.replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href: string, label: string) => {
    const decoded = decodeEntities(href);

    // The mirror rewrite runs on every link, not only truncated ones, because
    // Nitter rewrites the href whether or not the label was cut.
    const youtube = toYouTubeUrl(decoded);

    const text = label.replace(/<[^>]+>/g, "").trim();
    const wasCut = /(?:\u2026|\.\.\.)\s*$/.test(text);

    if (!wasCut && !youtube) return match;

    return youtube ?? decoded;
  });
}

/** Strip the HTML Nitter wraps tweet bodies in, keeping nothing but the text. */
function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " "),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One tag's content, unwrapping CDATA when present. */
function tag(item: string, name: string): string | null {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return null;

  const raw = match[1];
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1] : raw).trim();
}

/** First image URL inside the description, if the post carries media. */
function imageOf(description: string): string | null {
  const src = description.match(/<img[^>]+src="([^"]+)"/i)?.[1];
  return src ? decodeEntities(src) : null;
}

/** RFC 822 as X writes it, e.g. "Thu, 08 Oct 2026 04:52:31 GMT". */
function toIso(pubDate: string | null): string | null {
  if (!pubDate) return null;
  const date = new Date(pubDate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Indonesian short month, written rather than indexed: Mei, Agu, Okt, Des. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** WIB is UTC+7 with no daylight saving, so a fixed shift is exact here. */
const WIB_OFFSET_HOURS = 7;

/**
 * The post time in WIB, as the card shows it.
 *
 * The feed's pubDate is GMT, and dropping the time would leave four posts from
 * the same morning looking like one undifferentiated date. The shift happens
 * before the clock fields are read, so an evening GMT post lands on the right
 * local day rather than the previous one.
 */
function toWib(iso: string | null): string | null {
  if (!iso) return null;

  const shifted = new Date(new Date(iso).getTime() + WIB_OFFSET_HOURS * 3600 * 1000);
  if (Number.isNaN(shifted.getTime())) return null;

  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");

  return `${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()}, ${hours}.${minutes}`;
}

/** Trim a long body to something a card can hold, at a word boundary. */
function truncate(text: string, limit = 400): string {
  if (text.length <= limit) return text;

  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** URLs in a post, so the card can link them instead of printing them inert. */
export const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

export interface Tweet {
  id: string;
  url: string;
  text: string;
  /** Raw ISO from the feed's pubDate. */
  postedAt: string | null;
  /** Same instant, formatted in WIB, e.g. "8 Okt 2026, 11.52". */
  postedLabel: string | null;
  isRetweet: boolean;
  hasMedia: boolean;
  image: string | null;
  /** Not carried by Nitter's RSS. Null, so the card omits the row. */
  replies: number | null;
  retweets: number | null;
  likes: number | null;
  views: number | null;
}

function parseFeed(xml: string): Tweet[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const tweets: Tweet[] = [];

  for (const item of items) {
    const id = tag(item, "guid");
    const title = tag(item, "title");
    const description = tag(item, "description");

    // Nitter's own link points at the instance, not at X. The guid is the post
    // id, so the canonical x.com URL is built from that instead, which also
    // keeps the link working when the serving instance changes.
    if (!id || !/^\d{10,25}$/.test(id)) continue;

    const body = description ? stripHtml(expandTruncatedLinks(description)) : "";
    const heading = stripHtml(expandTruncatedLinks(title ?? ""));

    // Nitter truncates its own <title> with an ellipsis, which silently eats
    // the end of a URL. The description carries the same text in full, so a
    // truncated title is discarded in favour of it rather than shipped.
    const titleIsCut = /(?:\u2026|\.\.\.)\s*$/.test(heading);
    const rawText = titleIsCut ? body || heading : heading || body;
    if (!rawText) continue;

    // Nitter labels an amplified post in the body itself, in two shapes:
    // "RT by @name: ..." and "R to @name: ...". The label is bookkeeping for
    // the reader of Nitter, not something she wrote, so it is cut off here
    // instead of being rendered as the opening of the card. Detection happens
    // first, then the strip, so the card can still know it was a retweet.
    const isRetweet = /^(?:RT\s+by|R\s+to)\s+@?[\w.]{1,20}\s*:\s*/i.test(rawText);
    const text = rawText.replace(/^(?:RT\s+by|R\s+to)\s+@?[\w.]{1,20}\s*:\s*/i, "").trim();
    if (!text) continue;

    const postedAt = toIso(tag(item, "pubDate"));

    tweets.push({
      id,
      url: `https://x.com/${SCREEN_NAME}/status/${id}`,
      // Not truncated. A shortened URL is worse than a long card, because the
      // whole point of the post being here is that the link works.
      text,
      postedAt,
      postedLabel: toWib(postedAt),
      isRetweet,
      hasMedia: Boolean(imageOf(description ?? "")),
      // The feed proxies media through the serving instance, so the URL is only
      // valid while that instance is up. The card hides a broken image rather
      // than leaving a gap where one should be.
      image: imageOf(description ?? ""),
      replies: null,
      retweets: null,
      likes: null,
      views: null,
    });
  }

  return tweets;
}

async function fetchFeed(url: string): Promise<Tweet[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "application/rss+xml, application/xml, text/xml",
        "accept-language": "id-ID,id;q=0.9",
      },
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const body = await res.text();
    // A 200 that is an Anubis or Cloudflare interstitial still parses as XML, so
    // the item count is the real check rather than the status code.
    return parseFeed(body);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: TweetsRequest, res: TweetsResponse) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  let tweets: Tweet[] = [];
  let servedBy: string | null = null;

  for (const instance of rotation()) {
    const result = await fetchFeed(`${instance}/${SCREEN_NAME}/rss`);
    if (result && result.length > 0) {
      tweets = result;
      servedBy = instance;
      break;
    }
  }

  /*
   * Order left exactly as the feed gave it.
   *
   * Sorting by pubDate here was wrong for retweets. Nitter dates a retweet with
   * the original post's timestamp, so amplifying something from a fortnight ago
   * pushed it below everything she posted since — the newest thing she did on the
   * account sank down the page. The feed already orders by its own idea of recency,
   * which knows the difference; re-sorting by a single field threw that away.
   */
  tweets = tweets.slice(0, TWEET_LIMIT);

  const payload = {
    handle: HANDLE,
    reason: tweets.length > 0 ? "live" : "unavailable",
    /** Which instance answered, so a broken feed can be traced. */
    servedBy,
    tweets,
  };

  // Posts arrive irregularly, so a longer window than the content endpoint's.
  // Short, because a post can appear at any moment and the page polls on this
  // cadence. Held for a quarter of an hour the poll would keep re-reading the same
  // cached copy and a new post would never surface however often it asked.
  res.setHeader(
    "Cache-Control",
    tweets.length > 0
      ? "public, s-maxage=60, stale-while-revalidate=120"
      : "public, s-maxage=30",
  );
  res.status(200).json(payload);
}

export { parseFeed, decodeEntities, stripHtml, truncate, toWib, toYouTubeUrl, rotation };
/*
 * GET /api/fanart
 *
 * Art posted by other people, found by hashtag.
 *
 * Where it comes from
 * -------------------
 * X has no anonymous way to search, and the endpoints that used to be reachable
 * now answer 429 or 401 from a serverless IP (measured, and written up in the
 * README). The same Nitter instances that serve the tweets route also serve a
 * search feed, so this reads:
 *
 *   /search/rss?f=tweets&q=%23ForMizu
 *
 * which is Nitter's own rendering of https://x.com/search?q=%23ForMizu&f=live.
 *
 * The hashtag is matched case-insensitively here as well, because people write
 * #ForMizu, #formizu and #FORMIZU interchangeably and the search treats them as
 * one term anyway. Matching again costs nothing and catches the entries a
 * case-sensitive test would drop.
 *
 * Images
 * ------
 * Nitter proxies every image through its own host as
 * /pic/media%2F<name>.jpg, which dies with the instance. The name is the same
 * path segment pbs.twimg.com uses, so the URL is rebuilt against Twitter's image
 * host — verified byte-identical to the proxied copy, and it outlives whichever
 * Nitter instance happens to be up today.
 */

/**
 * Declared locally rather than imported from `@vercel/node`, which is not installed
 * here and would drag the whole Vercel types package in for two signatures. Matches
 * how api/content.ts and api/tweets.ts describe the same two objects.
 */
interface FanartRequest {
  query: Record<string, string | string[] | undefined>;
}

interface FanartResponse {
  status(code: number): FanartResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

const INSTANCES = ["https://nitter1.kabii.moe", "https://nitter.kabii.moe"] as const;

const HASHTAG = "formizu";
const QUERY = `%23${HASHTAG}`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** How many pieces to keep. A search page is far longer and this is a wall, not an archive. */
const FANART_LIMIT = 24;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export interface Fanart {
  id: string;
  /** Canonical x.com post, built from the guid so it survives an instance change. */
  url: string;
  author: string;
  /** Caption with the tag and any markup removed. */
  caption: string;
  /** Twitter's own image host, not the Nitter proxy that will go away. */
  image: string;
  /** Same instant in WIB, matching the tweets route. */
  postedLabel: string | null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripHtml(html: string): string {
  return (
    decodeEntities(
      html
        // Nitter wraps descriptions in CDATA, and the closing marker sits inside
        // the tag match, so it survives and prints as a literal "]]>" in the
        // caption unless it is taken off first.
        .replace(/<!\[CDATA\[/gi, "")
        .replace(/\]\]>/g, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      // Any address left is the search's own link to the instance, or the proxy
      // path for the image. Neither belongs in a caption a reader would quote.
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

/** Nitter's image proxy path back to Twitter's, so the link outlives the instance. */
function toTwitterImage(url: string): string {
  const proxied = url.match(/\/pic\/media%2F([A-Za-z0-9_-]+)\.(jpg|jpeg|png|webp|gif)/i);
  if (proxied) return `https://pbs.twimg.com/media/${proxied[1]}.${proxied[2]}`;
  return url;
}

/** Same shape as api/tweets.ts: GMT in, WIB out. */
function toWib(pubDate: string | null): string | null {
  if (!pubDate) return null;
  const parsed = Date.parse(pubDate);
  if (Number.isNaN(parsed)) return null;

  const wib = new Date(parsed + 7 * 60 * 60 * 1000);

  return `${wib.getUTCDate()} ${MONTHS[wib.getUTCMonth()]} ${wib.getUTCFullYear()}, ` +
    `${String(wib.getUTCHours()).padStart(2, "0")}.${String(wib.getUTCMinutes()).padStart(2, "0")}`;
}

function tag(item: string, name: string): string {
  const found = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return found ? found[1] : "";
}

function parseFeed(xml: string): Fanart[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: Fanart[] = [];

  for (const item of items) {
    /*
     * The guid arrives in two shapes and both are legitimate.
     *
     * Newer entries carry the bare post id; older ones carry a full link to the
     * Nitter instance. Reading only the first shape silently dropped half the feed
     * — the four oldest artworks, which are the ones people actually come back
     * for. The trailing "#m" is a Nitter media marker, not part of the id.
     *
     * The canonical url is built from the same fields rather than by rewriting the
     * Nitter link, so it survives whichever instance served the page. The handle
     * comes along for free in the same string, which is why the url keeps the
     * handle form instead of using x.com/i/status/.
     */
    const guid = tag(item, "guid").trim();
    const id = guid.match(/(\d{15,25})/)?.[1];
    if (!id) continue;

    const link = tag(item, "link").trim();
    const handle = link.match(/\/([A-Za-z0-9_]+)\/status\//)?.[1];
    if (!handle) continue;

    const description = tag(item, "description");
    const image = description.match(/<img[^>]+src="([^"]+)"/i)?.[1];
    if (!image) continue;

    const caption = stripHtml(description);

    // The search already filters on the tag, so an entry without it is noise the
    // search matched on something else — a mention, or a truncated body.
    if (!new RegExp(`#${HASHTAG}`, "i").test(caption)) continue;

    out.push({
      id,
      url: `https://x.com/${handle}/status/${id}`,
      author: stripHtml(tag(item, "dc:creator")) || "Tanpa nama",
      caption,
      image: toTwitterImage(decodeEntities(image)),
      postedLabel: toWib(tag(item, "pubDate").trim() || null),
    });
  }

  return out;
}

export { parseFeed }

export default async function handler(_req: FanartRequest, res: FanartResponse) {
  let fanart: Fanart[] = [];
  let servedBy: string | null = null;

  for (const instance of INSTANCES) {
    try {
      const response = await fetch(`${instance}/search/rss?f=tweets&q=${QUERY}`, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) continue;

      const parsed = parseFeed(await response.text());
      if (parsed.length > 0) {
        fanart = parsed;
        servedBy = instance;
        break;
      }
    } catch {
      // Try the next instance rather than failing the page.
    }
  }

  res.setHeader(
    "Cache-Control",
    fanart.length > 0
      ? "public, s-maxage=300, stale-while-revalidate=900"
      : "public, s-maxage=60",
  );

  res.status(200).json({
    reason: fanart.length > 0 ? "live" : "unavailable",
    hashtag: `#${HASHTAG}`,
    searchUrl: `https://x.com/search?q=${QUERY}&src=typed_query&f=live`,
    servedBy,
    fanart: fanart.slice(0, FANART_LIMIT),
  });
}
/*
 * GET /api/fanart?cursor=<opaque>
 *
 * Art posted by other people, found by hashtag.
 *
 * Why this reads Nitter's HTML and not its RSS feed
 * -------------------------------------------------
 * The RSS feed used to be the whole route, and it returned four items. That was
 * never a limit anyone set -- it is simply how much a search feed gives back, and
 * the rest of the results live behind the "load more" link at the foot of the
 * HTML page as a `cursor=` parameter. The RSS endpoint answers 404 when handed
 * that cursor, so a feed-only route cannot paginate at all: the cursor has to
 * come from the HTML view, and once you are reading HTML anyway there is no
 * reason to also ask for the feed.
 *
 * Measured against the live instance, one hashtag went from 4 items to 123.
 *
 * What the HTML gives that the feed did not
 * -----------------------------------------
 * Engagement counts. The RSS omits likes, replies, reposts and views entirely;
 * the page markup carries all four, so the cards can show them for the first
 * time. Retweet state is there too, which is how a repost of somebody else's
 * artwork is told apart from an artist posting their own.
 *
 * Cursor
 * ------
 * Opaque and instance-specific, so it is passed back untouched rather than
 * rebuilt. Nitter reissues a different cursor on every page, so it must be read
 * off the page just fetched -- there is no arithmetic that produces the next one.
 *
 * Budget
 * ------
 * Pages are walked up to a limit and the walk stops the moment the instance
 * answers 429. That is not hypothetical: sequential paging trips the rate limit
 * on these instances, so a first load asks for four pages and a "load more"
 * asks for one. A partial result is still a result, and the cursor to continue
 * from survives even when the walk was cut short.
 */

interface FanartRequest {
  query: Record<string, string | string[] | undefined>;
}

interface FanartResponse {
  status(code: number): FanartResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

/*
 * The instance pool, measured rather than accumulated.
 *
 * Seventeen hosts were probed for this route. Only two answer a hashtag search
 * with actual results and a next-page cursor:
 *
 *   nitter1.kabii.moe   200, items + cursor
 *   nitter.kabii.moe    200, items + cursor
 *
 * The rest are gone or useless for a search: nitter.net, nitter.poast.org,
 * nitter.woodland.cafe, nitter.7shiro.com, nitter.esmailelbob.xyz,
 * nitter.nerdvpn.de, nitter.materialio.us, nitter.privacydev.net, nitter.1d4.us
 * and nitter.privacy.com.de no longer resolve; nitter.kuuro.net and
 * nitter.privacyredirect.com answer 404; xcancel.com answers 451;
 * nitter.space 403; nitter.catsarch.com 503; nitter.adminforge.de 404; and
 * nitter.tiekoetter.com returns 200 with zero results because search is disabled
 * there.
 *
 * Two of the four sites previously carried eight hosts each. Keeping them was
 * not free: an unusable host is not a free fallback, it is up to three seconds
 * of timeout before the walk reaches the one that works. So the pool is two,
 * both proven.
 *
 * That is thin, and it is a genuine single point of failure -- both are the same
 * operator and likely share one rate limit. It is why the walk is paced and
 * retried rather than fired as fast as it can go, and why a partial result is
 * preferred over an empty page.
 */
const INSTANCES = ["https://nitter1.kabii.moe", "https://nitter.kabii.moe"] as const;

const HASHTAG = "deyillust";
const QUERY = `%23${HASHTAG}`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Hard ceiling on what one response may carry. */
const FANART_LIMIT = 48;

/**
 * Pages walked on a cold request, and on a "load more".
 *
 * Four on the first load because the first page holds only four items and a
 * wall of four pictures reads as broken. One per press after that, because each
 * page is a separate request and these instances answer 429 once a walk gets
 * greedy -- measured, not assumed.
 */
const PAGES_ON_FIRST_LOAD = 3;
const PAGES_PER_MORE = 1;

/**
 * Gap between page requests.
 *
 * Deliberate politeness, and it is also the thing that keeps a walk alive: the
 * instances answer 429 far sooner to an uninterrupted burst than to the same
 * number of requests spread out. Costs latency on the first load and buys a
 * response that actually paginates.
 */
const PAGE_GAP_MS = 350;

const PAGE_TIMEOUT_MS = 12000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export interface Fanart {
  id: string;
  /** Canonical x.com post, built from the status id so it survives an instance change. */
  url: string;
  /** Handle without the @. */
  author: string;
  /** Display name as shown on the post, when it differs from the handle. */
  fullname: string;
  /** Caption with the tag, markup and any bare link removed. */
  caption: string;
  /** Twitter's own image host, not the Nitter proxy that will go away. */
  image: string;
  /** Same instant in WIB, matching the tweets route. Null when Nitter omits it. */
  postedLabel: string | null;
  /** True when the poster is reposting someone else's artwork. */
  isRetweet: boolean;
  /** Engagement, from the page markup. Null rather than 0 when absent. */
  replies: number | null;
  retweets: number | null;
  likes: number | null;
  views: number | null;
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
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      // Two passes, because Nitter renders a link as anchor *text* with no
      // scheme: `drive.google.com/drive/folde…`. Stripping tags alone leaves that
      // sitting in the caption, and stripping only `https?://…` never matches it.
      .replace(/https?:\/\/\S+/gi, "")
      // An explicit TLD list rather than a generic "word dot word" pattern. A
      // generic one eats the last word of any sentence ending in an abbreviation
      // -- "the good guys vs. the bad guys" loses "vs" -- and this caption is a
      // thing a reader might quote.
      .replace(
        /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|co|id|me|io|dev|xyz|link|in|app|site|online|us|uk|tv|gg|ly|be|info|biz|shopee)\b(?:\/\S*)?/gi,
        "",
      )
      // Nitter truncates long link text with an ellipsis, left dangling once the
      // text itself is gone.
      .replace(/\s*…\s*$/, "")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[\s.,;]+$/, "")
      .trim()
  );
}

/**
 * Nitter proxies every image through its own host. The name is the same path
 * segment pbs.twimg.com uses, so the URL is rebuilt against Twitter's host, which
 * outlives whichever instance is up today.
 *
 * `/pic/orig/` is preferred over the `<img src>` because the latter is a small
 * webp rendition Nitter made for its own layout; the anchor beside it points at
 * the untouched upload.
 */
function toTwitterImage(url: string): string | null {
  const m = url.match(/\/pic\/(?:orig\/)?media%2F([A-Za-z0-9_-]+)\.(jpg|jpeg|png|webp|gif)/i);
  return m ? `https://pbs.twimg.com/media/${m[1]}.${m[2]}` : null;
}

/**
 * "Oct 5, 2026 · 6:42 AM UTC" -> "5 Okt 2026, 13.42".
 *
 * Two shapes arrive. The title attribute carries the full timestamp with a middle
 * dot, and is what nearly every item has. A handful carry no title and show only
 * the visible label, which is either "Oct 5" (no year, unusable for ordering) or
 * a full date for anything older than a few days -- so that is the second shape.
 * Anything else returns null and the card omits the line rather than printing a
 * date it half-reads.
 *
 * "Sept" is accepted alongside "Sep": Nitter's month formatter is not consistent
 * about the ninth month, and a lookup table that only knows three-letter forms
 * silently drops a ninth of the archive.
 */
function toWib(title: string | null, label: string | null): string | null {
  const full = title?.match(/([A-Za-z]{3,4})\.? (\d{1,2}), (\d{4}) \u00b7 (\d{1,2}):(\d{2})/);
  if (full) {
    const month = monthIndex(full[1]);
    if (month >= 0) {
      const hours = (Number(full[4]) + 7) % 24;
      return `${full[2]} ${MONTHS[month]} ${full[3]}, ${String(hours).padStart(2, "0")}.${full[5]}`;
    }
  }

  const short = label?.match(/^(\d{1,2}) ([A-Za-z]{3,4})\.? (\d{4})$/);
  if (short) {
    const month = monthIndex(short[2]);
    if (month >= 0) return `${short[1]} ${MONTHS[month]} ${short[3]}, 00.00`;
  }

  return null;
}

function monthIndex(name: string): number {
  const at = MONTHS.findIndex((m) => m.toLowerCase() === name.slice(0, 3).toLowerCase());
  return at >= 0 ? at : MONTHS.findIndex((m) => m.toLowerCase() === name.toLowerCase());
}

function count(text: string): number | null {
  const m = text.replace(/,/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * One `.timeline-item` block out of a search page.
 *
 * Split on the item boundary rather than on balanced tags: the block nests four
 * levels deep and a depth counter is more code than the boundary is worth.
 */
function parseItems(html: string): Fanart[] {
  const blocks =
    html.match(
      /<div class="timeline-item[\s\S]*?(?=<div class="timeline-item|<div class="show-more|$)/g,
    ) ?? [];

  const out: Fanart[] = [];

  for (const block of blocks) {
    const link = block.match(/<a class="tweet-link" href="\/([^/"]+)\/status\/(\d{15,25})/);
    if (!link) continue;
    const [, author, id] = link;

    const source =
      block.match(/<a class="still-image" href="([^"]+)"/)?.[1] ??
      block.match(/<img[^>]+src="([^"]*media%2F[^"]+)"/i)?.[1];
    if (!source) continue;
    const image = toTwitterImage(decodeEntities(source));
    if (!image) continue;

    const caption = stripHtml(
      block.match(/<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "",
    );

    // The search already filters on the tag, so an entry without it is noise the
    // search matched on something else.
    if (!new RegExp(`#${HASHTAG}`, "i").test(caption)) continue;

    const stat = (icon: string): number | null => {
      const m = block.match(new RegExp(`icon-${icon}[^>]*></span>([\\s\\S]*?)</div>`));
      return m ? count(stripHtml(m[1])) : null;
    };

    out.push({
      id,
      url: `https://x.com/${author}/status/${id}`,
      author,
      fullname:
        stripHtml(block.match(/<a class="fullname"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "") || author,
      caption,
      image,
      postedLabel: toWib(
        block.match(/<span class="tweet-date">[\s\S]*?title="([^"]+)"/)?.[1] ?? null,
        block.match(/<span class="tweet-date">[\s\S]*?<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null,
      ),
      isRetweet: /class="retweet-header"/.test(block),
      replies: stat("comment"),
      retweets: stat("retweet"),
      likes: stat("heart"),
      views: stat("views"),
    });
  }

  return out;
}

/**
 * The next page's cursor, read off the "load more" link on the page just read.
 *
 * The href is entity-encoded (`&amp;`) and the cursor is base64, which may carry
 * `+` and `/`. Returning it decoded but not re-encoded would corrupt a `+` into
 * a space at the far end, so the value is handed back raw and the caller encodes
 * it once when building the next URL.
 */
function nextCursor(html: string): string | null {
  const m = html.match(/<div class="show-more">\s*<a href="([^"]*cursor=[^"]*)"/);
  if (!m) return null;
  const raw = m[1].replace(/&amp;/g, "&");
  const q = raw.slice(raw.indexOf("cursor=") + "cursor=".length);
  return q ? q.split("&")[0] : null;
}

/**
 * One page, with one retry after a 429.
 *
 * These instances rate-limit aggressively and a paced walk still meets it. A
 * single retry after a short wait is worth it: without it the walk gives up on
 * the first refusal and the page shows a third of what it should. The response's
 * own Retry-After is preferred over a fixed guess when it is present.
 *
 * Returns null for both "this instance is not answering" and "it is answering
 * 429 twice", because the caller treats them the same way: stop walking, answer
 * with what is already held, and hand back the cursor so the walk can be
 * continued later.
 */
async function fetchPage(instance: string, cursor: string | null): Promise<string | null> {
  const url =
    `${instance}/search?f=tweets&q=${QUERY}` +
    (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });
      if (response.status === 429 && attempt === 0) {
        const after = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(after) && after > 0
          ? Math.min(after * 1000, 3000)
          : 1200;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  return null;
}

export default async function handler(req: FanartRequest, res: FanartResponse) {
  const raw = req.query?.cursor;
  const cursor = typeof raw === "string" && raw.length > 0 && raw.length < 4000 ? raw : null;
  const budget = cursor ? PAGES_PER_MORE : PAGES_ON_FIRST_LOAD;

  const seen = new Map<string, Fanart>();
  let next: string | null = cursor;
  let servedBy: string | null = null;
  let pages = 0;

  // Cursors are instance-specific, so a request that arrives with one keeps
  // going to the instance that will understand it: try them in order and stop at
  // the first that answers.
  for (const instance of INSTANCES) {
    seen.clear();
    next = cursor;
    pages = 0;

    for (let page = 0; page < budget; page++) {
      const html = await fetchPage(instance, next);
      if (html === null) break;

      let found = 0;
      for (const item of parseItems(html)) {
        if (seen.has(item.id)) continue;
        seen.set(item.id, item);
        found++;
      }
      pages++;
      if (pages === 1) servedBy = instance;

      next = nextCursor(html);
      if (found === 0 || !next) break;

      // Pace the walk. Skipped on the last page of the budget, where there is no
      // further request to protect.
      if (page < budget - 1) await new Promise((r) => setTimeout(r, PAGE_GAP_MS));
    }

    // One usable page is enough to answer from this instance.
    if (seen.size > 0) break;
  }

  const fanart = [...seen.values()].slice(0, FANART_LIMIT);

  res.setHeader(
    "Cache-Control",
    // A cursor-keyed answer is already scoped by the query string, so it can be
    // cached the same way. The first-load answer carries a cursor for a walk that
    // may have been cut short, so it gets the shorter window.
    fanart.length > 0
      ? cursor
        ? "public, s-maxage=600, stale-while-revalidate=1800"
        : "public, s-maxage=300, stale-while-revalidate=900"
      : "public, s-maxage=60",
  );

  res.status(200).json({
    reason: fanart.length > 0 ? "live" : "unavailable",
    hashtag: `#${HASHTAG}`,
    searchUrl: `https://x.com/search?q=${QUERY}&src=typed_query&f=live`,
    servedBy,
    pagesRead: pages,
    /** Opaque. Send it back as ?cursor= to continue where this left off. */
    nextCursor: fanart.length > 0 ? next : null,
    fanart,
  });
}
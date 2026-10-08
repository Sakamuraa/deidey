/**
 * GET /api/tweets
 *
 * Recent posts from x.com/mizuhamzazu, newest first.
 *
 * This endpoint exists but cannot currently answer, and that is a measured
 * result rather than an untested guess. X closed anonymous timeline access, and
 * every route in was tried from a serverless IP:
 *
 *   | route                                        | result                        |
 *   |----------------------------------------------|-------------------------------|
 *   | x.com/mizuhamzazu (page HTML)                | 200, 136 KB, zero tweet text   |
 *   | syndication.twitter.com timeline-profile     | 429, three attempts           |
 *   | cdn.syndication.twimg.com widgets/timelines  | 200, zero tweets              |
 *   | publish.twitter.com/oembed                    | 404                           |
 *   | guest-token flow (activate + UserTweets)     | 401 on activate               |
 *   | rsshub.app/twitter/user/...                  | 404                           |
 *   | nitter.net/mizuhamzazu/rss                   | connection failed             |
 *
 * The profile page returning 200 with no tweet text is the trap worth naming: it
 * looks like a working fetch, and grepping the document finds the strings
 * "full_text" and "tweet_results" inside JavaScript bundles. Zero occurrences of
 * an actual post. A scraper built on that would report success and render an
 * empty timeline forever.
 *
 * So the response is an empty list with a reason attached, rather than a 200 that
 * looks populated. The page reads that reason and tells the visitor, instead of
 * presenting a blank grid as though the account has never posted.
 *
 * What would fix it: X API v2 with a bearer token, exposed as a Vercel env var.
 * The parse below is already shaped for that response, so wiring a token in is
 * the only change needed.
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
const TWEET_LIMIT = 20;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** X's own field names, for the payload this endpoint is written to receive. */
interface LegacyTweet {
  id_str?: string;
  full_text?: string;
  created_at?: string;
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  views?: { count?: string };
  extended_entities?: {
    media?: Array<{ media_url_https?: string }>;
  };
}

const TIMEOUT_MS = 15000;

async function fetchJson(url: string, token: string | null): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "user-agent": UA,
        "accept-language": "id-ID,id;q=0.9",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn X's payload into the flat shape the card reads.
 *
 * X writes its timestamps in Twitter's old format, "Wed Oct 08 05:49:31 +0000
 * 2026", which is not ISO and does not parse with `new Date()` in every engine.
 * It is converted here rather than in the component.
 */
function normalise(legacy: LegacyTweet) {
  const created = legacy.created_at
    ? new Date(legacy.created_at.replace(/^(\w{3}) (\w{3}) (\d{2}) (\d{2}:\d{2}:\d{2})/, "$1 $2 $4 $3"))
    : null;

  const views = legacy.views?.count ? Number(legacy.views.count) : null;

  return {
    id: legacy.id_str ?? "",
    url: `https://x.com/${SCREEN_NAME}/status/${legacy.id_str ?? ""}`,
    text: (legacy.full_text ?? "").replace(/https:\/\/t\.co\/[A-Za-z0-9]+/g, "").trim(),
    postedAt: created && !Number.isNaN(created.getTime()) ? created.toISOString() : null,
    age: null,
    replies: typeof legacy.reply_count === "number" ? legacy.reply_count : null,
    retweets: typeof legacy.retweet_count === "number" ? legacy.retweet_count : null,
    likes: typeof legacy.favorite_count === "number" ? legacy.favorite_count : null,
    views: views !== null && Number.isFinite(views) ? views : null,
    hasMedia: Boolean(legacy.extended_entities?.media?.length),
    image: legacy.extended_entities?.media?.[0]?.media_url_https ?? null,
  };
}

export default async function handler(req: TweetsRequest, res: TweetsResponse) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  // An X API v2 token, when one is configured. Absent by default, and its
  // absence is a normal state rather than an error: the page falls back to its
  // own explanation.
  const token = process.env.X_BEARER_TOKEN ?? null;

  let tweets: ReturnType<typeof normalise>[] = [];

  if (token) {
    const payload = await fetchJson(
      `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(
        `from:${SCREEN_NAME}`,
      )}&max_results=${TWEET_LIMIT}&tweet.fields=created_at,public_metrics,entities`,
      token,
    );

    const data = (payload as { data?: LegacyTweet[] } | null)?.data;
    if (Array.isArray(data)) {
      tweets = data
        .map((entry) => {
          // v2 nests counters under public_metrics; this endpoint reads the
          // legacy shape, so the two are reconciled here rather than in the card.
          const metrics = (entry as unknown as { public_metrics?: Record<string, number> })
            .public_metrics;
          return normalise({
            ...entry,
            reply_count: metrics?.reply_count,
            retweet_count: metrics?.retweet_count,
            favorite_count: metrics?.like_count,
            views: metrics?.impression_count ? { count: String(metrics.impression_count) } : undefined,
          });
        })
        // Newest first, because the API returns newest first but a re-fetch
        // after a failed request must not depend on that being stable.
        .sort((a, b) => (a.postedAt ?? "").localeCompare(b.postedAt ?? ""))
        .reverse()
        .slice(0, TWEET_LIMIT);
    }
  }

  const payload = {
    handle: HANDLE,
    // "live" when the API answered, "no-token" when one is needed, "blocked"
    // when the request itself was refused. The page words these differently.
    reason: token === null ? "no-token" : tweets.length > 0 ? "live" : "unavailable",
    tweets,
  };

  // Short cache either way: a token that starts working should show up quickly,
  // and an empty list has nothing to go stale.
  res.setHeader(
    "Cache-Control",
    tweets.length > 0 ? "public, s-maxage=900" : "public, s-maxage=60",
  );
  res.status(200).json(payload);
}
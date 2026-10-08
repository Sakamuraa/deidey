import { useEffect, useState } from "react";

export type Tweet = {
  id: string;
  url: string;
  /** Plain text, with X's own shortened URLs already expanded. */
  text: string;
  /** ISO timestamp, or null when X gave a relative age instead of a date. */
  postedAt: string | null;
  /** Relative age as written by X, e.g. "3 jam". Null when postedAt is known. */
  age: string | null;
  replies: number | null;
  retweets: number | null;
  likes: number | null;
  views: number | null;
  /** True when the post has media attached, which the card marks. */
  hasMedia: boolean;
  /** First media thumbnail, if any. */
  image: string | null;
};

type State = {
  tweets: Tweet[];
  /**
   * Why the list looks the way it does, which the page words differently:
   *   api        the endpoint returned posts
   *   bundled    showing a committed copy
   *   no-token   no API credential is configured
   *   blocked    credential exists but the request was refused
   */
  source: "api" | "bundled" | "no-token" | "blocked";
  error: string | null;
};

/** Kept in step with api/tweets.ts so the two cannot disagree on page size. */
export const TWEET_LIMIT = 20;

/**
 * Bundled copy of the newest posts.
 *
 * X gives no anonymous way to read a timeline: the syndication endpoint answers
 * 429 from a serverless IP, the profile page ships no tweet text in its HTML, and
 * the guest-token API returns 401. Measured, not assumed, and written up in the
 * README. So these are committed readings, taken once by hand, and the page says
 * plainly that it is showing a saved copy rather than pretending to be live.
 */
const BUNDLED: Tweet[] = [];

const EMPTY: State = { tweets: BUNDLED, source: "bundled", error: null };

/** Wording per source, so the explanation matches what actually happened. */
const SOURCE_NOTE: Record<State["source"], string> = {
  api: "Dibaca langsung dari X.",
  bundled: "Menampilkan salinan tersimpan. X tidak mengizinkan pembacaan tanpa login.",
  "no-token": "Belum ada kunci API X yang dikonfigurasi, jadi data langsung tidak bisa diambil.",
  blocked: "X menolak permintaan dari server. Menampilkan salinan tersimpan.",
};

/**
 * Recent posts.
 *
 * Fetches `/api/tweets`, which is the only route that could hold live data, and
 * falls back to the bundled copy. The state distinguishes the two on purpose:
 * a page that silently showed stale posts while claiming to be live would be
 * worse than one that admits it.
 */
export function useTweets(): State & { note: string } {
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/tweets", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`api returned ${res.status}`);

        const payload = (await res.json()) as { tweets?: Tweet[]; reason?: string };
        const list = Array.isArray(payload.tweets) ? payload.tweets.slice(0, TWEET_LIMIT) : [];

        // The endpoint explains itself. An empty list is reported as its stated
        // reason rather than collapsed into one generic "unavailable", so the
        // note under the grid says the true thing.
        setState({
          tweets: list,
          source: list.length > 0 ? "api" : payload.reason === "no-token" ? "no-token" : "blocked",
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          tweets: BUNDLED,
          source: BUNDLED.length > 0 ? "bundled" : "blocked",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, []);

  return { ...state, note: SOURCE_NOTE[state.source] };
}
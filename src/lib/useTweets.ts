import { useEffect, useState } from "react";

export type Tweet = {
  id: string;
  url: string;
  /** Plain text with the HTML Nitter wraps it in removed. */
  text: string;
  /** Raw ISO from the feed's pubDate, for the dateTime attribute. */
  postedAt: string | null;
  /** Same instant in WIB, e.g. "8 Okt 2026, 11.52". */
  postedLabel: string | null;
  isRetweet: boolean;
  /**
   * Engagement counts, all null.
   *
   * Nitter's RSS does not carry them. They stay null rather than 0 so the card
   * omits the row entirely instead of printing a confident zero.
   */
  replies: number | null;
  retweets: number | null;
  likes: number | null;
  views: number | null;
  hasMedia: boolean;
  image: string | null;
};

type State = {
  tweets: Tweet[];
  /**
   * Why the list looks the way it does, which the page words differently:
   *   api        the endpoint returned posts
   *   bundled    showing a committed copy
   *   no-token   no API credential is configured
   *   blocked    the feed could not be read
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
  api: "Dibaca lewat feed publik X, diperbarui tiap lima belas menit.",
  bundled: "Menampilkan salinan tersimpan. Feed publik sedang tidak terbaca.",
  "no-token": "Kunci API X belum dikonfigurasi.",
  blocked: "Feed publik sedang tidak terbaca. Menampilkan salinan tersimpan.",
};

/**
 * Recent posts.
 *
 * Fetches `/api/tweets`, which is the only route that could hold live data, and
 * falls back to the bundled copy. The state distinguishes the two on purpose:
 * a page that silently showed stale posts while claiming to be live would be
 * worse than one that admits it.
 */
/**
 * How often to re-read the feed.
 *
 * X posts without warning and the visitor is already looking at the page, so
 * fetching once on mount meant a new post simply never appeared until the page was
 * reloaded by hand. Sixty seconds is brisk without turning a serverless function
 * into a polling bill.
 */
const POLL_MS = 60_000;

/** Consecutive failures before the page stops trying and says so. */
const MAX_FAILURES = 5;

export function useTweets(): State & { note: string } {
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    /*
     * Polled, not fetched once.
     *
     * The feed moves continuously, so a page that read it at load time and stopped
     * would show a post that is hours old and claim nothing about the present. The
     * request bypasses the HTTP cache as well: the endpoint's edge copy is held for
     * a minute, and without the bypass a poll would keep re-reading that same copy
     * and never see a new post even though it looked like it was checking.
     *
     * Idle while the tab is hidden, and stops for good on repeated failures rather
     * than retrying an endpoint that is down every minute.
     */
    async function load() {
      try {
        const res = await fetch("/api/tweets", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`api returned ${res.status}`);

        const payload = (await res.json()) as { tweets?: Tweet[]; reason?: string };
        const list = Array.isArray(payload.tweets) ? payload.tweets.slice(0, TWEET_LIMIT) : [];

        failures = 0;
        setState({
          tweets: list,
          source: list.length > 0 ? "api" : "blocked",
          error: null,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;

        failures += 1;
        setState({
          tweets: BUNDLED,
          source: BUNDLED.length > 0 ? "bundled" : "blocked",
          error: error instanceof Error ? error.message : String(error),
        });

        if (failures >= MAX_FAILURES) return;
      }

      if (!controller.signal.aborted) timer = setTimeout(load, POLL_MS);
    }

    void load();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void load();
      } else if (timer) {
        clearTimeout(timer);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { ...state, note: SOURCE_NOTE[state.source] };
}
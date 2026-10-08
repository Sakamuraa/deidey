import { useEffect, useState } from "react";

export type Fanart = {
  id: string;
  /** Canonical x.com post. */
  url: string;
  author: string;
  /** Caption with the tag and markup removed. */
  caption: string;
  /** Served from Twitter's own image host, not a proxy that will go away. */
  image: string;
  /** Same instant in WIB, matching the tweets route. */
  postedLabel: string | null;
};

type Payload = {
  reason?: string;
  hashtag?: string;
  searchUrl?: string;
  fanart?: Fanart[];
};

type State = {
  fanart: Fanart[];
  reason: "loading" | "live" | "unavailable";
  /** Where to send someone who wants the whole stream rather than this page. */
  searchUrl: string;
};

/** Kept in step with api/fanart.ts so the two cannot disagree on page size. */
export const FANART_LIMIT = 24;

/** Search results move slowly; a long window costs nothing. */
const POLL_MS = 300_000;

/**
 * Fan art posted under the hashtag.
 *
 * Polled on a long cycle. Art shows up whenever people feel like it rather than on
 * a schedule, and the endpoint is edge-cached for five minutes, so anything faster
 * would re-read the same copy.
 *
 * A failed read keeps the last good result rather than blanking the page: a
 * transient error should not turn a wall of artwork into a wall of text.
 */
export function useFanart(): State {
  const [state, setState] = useState<State>({
    fanart: [],
    reason: "loading",
    searchUrl: "https://x.com/search?q=%23ForMizu&src=typed_query&f=live",
  });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const res = await fetch("/api/fanart", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`api returned ${res.status}`);

        const payload = (await res.json()) as Payload;
        const list = Array.isArray(payload.fanart) ? payload.fanart.slice(0, FANART_LIMIT) : [];

        setState((prev) => ({
          fanart: list.length > 0 ? list : prev.fanart,
          reason: list.length > 0 ? "live" : "unavailable",
          searchUrl: payload.searchUrl ?? prev.searchUrl,
        }));
      } catch {
        if (controller.signal.aborted) return;
        setState((prev) => (prev.fanart.length > 0 ? prev : { ...prev, reason: "unavailable" }));
      }

      if (!controller.signal.aborted) timer = setTimeout(load, POLL_MS);
    }

    void load();

    return () => {
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return state;
}
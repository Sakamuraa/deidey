import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live viewer count, polled while a broadcast is running.
 *
 * Why this is separate from useContent
 * -----------------------------------
 * useContent answers in about a second because it fetches three YouTube tabs, and
 * its cache has to be long or it scrapes YouTube constantly. A viewer count
 * changes every few seconds and needs the opposite. Those two requirements cannot
 * both live in one payload, so the number has its own endpoint and its own hook
 * and leaves the archive where it was.
 *
 * Polling only while live
 * -----------------------
 * The request is not made unless `active` is true, which the caller sets from the
 * stream already on screen. That matters for two reasons: an idle site pays
 * nothing, and a page showing a finished broadcast is not quietly fetching a
 * number for a stream that is over.
 *
 * The interval is ten seconds, which matches the endpoint's own cache window. If
 * the client polled faster it would get the same cached answer more often and
 * appear to move while the number stood still.
 *
 * Hidden tabs stop polling and resume on the way back, the same rule useContent
 * follows. The refresh on return is what makes a tab that was in the background
 * during a stream start-up correct again immediately rather than up to a minute
 * later.
 */
export function useLiveViewers(active: boolean, videoId: string | null): number | null {
  const [viewers, setViewers] = useState<number | null>(null);
  // Refs rather than state: read inside the interval without making the effect
  // restart every time the caller re-renders with the same values.
  const activeRef = useRef(active);
  const idRef = useRef(videoId);
  activeRef.current = active;
  idRef.current = videoId;

  const load = useCallback(async () => {
    if (!activeRef.current || !idRef.current) return;
    try {
      const res = await fetch("/api/viewers", { cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as { viewers?: number | null; videoId?: string | null };

      /*
       * Only accept a number for the stream on screen.
       *
       * A response can arrive after the stream ended and the page moved on to the
       * next card, and applying it would put one broadcast's viewer count under
       * another's title.
       */
      if (payload.videoId !== idRef.current) return;
      if (typeof payload.viewers === "number") setViewers(payload.viewers);
    } catch {
      // A failed poll keeps the last number. Nulling it would be worse than being
      // ten seconds behind: a gap reads as the stream losing its audience.
    }
  }, []);

  useEffect(() => {
    if (!active || !videoId) {
      setViewers(null);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      void load().finally(() => {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      });
    };

    void load();
    timer = setTimeout(tick, POLL_MS);

    const onVisibility = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, videoId, load]);

  return viewers;
}

/** Matches the endpoint's cache window. Polling faster re-reads the same copy. */
const POLL_MS = 10_000;
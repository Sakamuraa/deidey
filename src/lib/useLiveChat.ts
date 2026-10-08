import { useCallback, useEffect, useRef, useState } from "react";

export type ChatMessage = {
  id: string;
  /** Display name as YouTube writes it, including the leading @. */
  author: string;
  /** Plain text. An emoji-only post lists its emoji names here instead. */
  body: string;
  /**
   * Emoji artwork by name, e.g. `{":zuzuMwahlove:": "https://yt3.ggpht.com/..."}`.
   *
   * The channel defines its own emoji and has no unicode equivalent, so the name
   * and the image both travel together. Text in `body` is not interpolated with
   * these; the panel lays them out beside it.
   */
  emojis: Record<string, string>;
  avatar: string | null;
  /** Wall-clock time the message was posted, milliseconds since epoch. */
  at: number | null;
  /**
   * Position in the recording, in seconds. Replay only.
   *
   * This is what lines the log up with the video: the panel keeps the messages
   * sitting around the player's current time, so the chat reads alongside the
   * broadcast rather than scrolling past it.
   */
  offsetSeconds: number | null;
  /** "member" or "paid" for the highlighted posts, null otherwise. */
  badge: string | null;
};

type Payload = {
  reason?: string;
  mode?: "live" | "replay";
  isLive?: boolean;
  title?: string | null;
  messages?: ChatMessage[];
  cursor?: string | null;
  /** Replay: true when the recording has more chat after this page. */
  more?: boolean;
  /** Replay: position in the recording this page reached, in seconds. */
  offsetSeconds?: number | null;
  durationSeconds?: number | null;
};

type Mode = "live" | "replay";

type State = {
  messages: ChatMessage[];
  /**
   * Broadcast name from the API, or null when it could not be read.
   *
   * The site carries only the newest handful of streams, so a link to an older
   * broadcast has no local metadata and would otherwise render as a bare
   * "Broadcast". The endpoint reads the same watch page the cursor needs, so the
   * name comes along for free.
   */
  title: string | null;
  /**
   * Which side of the broadcast these messages come from:
   *   live     the stream is running, and this is a rolling window of the tail
   *   replay   the stream is over, and this is read out of the recording
   */
  mode: Mode | null;
  status: "loading" | Mode | "quiet" | "unavailable";
  /** True while a replay has further pages to fetch. */
  more: boolean;
  loadingMore: boolean;
  /** Ask for the next stretch of a replay. Does nothing once there is no more. */
  loadMore: () => void;
};

/** How often to re-ask during a live stream. The endpoint advertises its own. */
const POLL_MS = 15_000;

/** Stop after this many consecutive failures rather than hammering a dead stream. */
const MAX_FAILURES = 4;

/**
 * Chat for one broadcast, live or replayed.
 *
 * The two are different reads, and the difference is not cosmetic. A running
 * stream only exposes a rolling window of the last few minutes, so this polls it
 * and folds each response into the list by id. A finished stream exposes its
 * whole recording a page at a time, so it is read once and then extended on
 * demand: what it holds is a transcript of the broadcast, not a live tail.
 *
 * Polling is paused while the tab is hidden, because a serverless function bills
 * per invocation and chat nobody is looking at is not worth paying for.
 */
export function useLiveChat(videoId: string, isLive: boolean): State {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [status, setStatus] = useState<State["status"]>("loading");
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Refs rather than state for everything the poll and the pager read, so neither
  // has to be rebuilt because a value they care about changed.
  const seen = useRef(new Set<string>());
  const failures = useRef(0);
  const cursor = useRef<string | null>(null);
  const offset = useRef(0);
  const modeRef = useRef<Mode | null>(null);
  const inFlight = useRef(false);

  /** Add anything not already held, keeping the list ordered by post time. */
  const absorb = useCallback((incoming: ChatMessage[]) => {
    const fresh = incoming.filter((m) => m?.id && !seen.current.has(m.id));
    for (const m of fresh) seen.current.add(m.id);
    if (fresh.length === 0) return;

    setMessages((prev) => [...prev, ...fresh].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)));
  }, []);

  useEffect(() => {
    seen.current.clear();
    failures.current = 0;
    cursor.current = null;
    offset.current = 0;
    modeRef.current = null;
    inFlight.current = false;

    setMessages([]);
    setTitle(null);
    setMode(null);
    setStatus("loading");
    setMore(false);

    if (!videoId) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const res = await fetch(`/api/chat?id=${videoId}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`api returned ${res.status}`);

        const payload = (await res.json()) as Payload;
        const incoming = Array.isArray(payload.messages) ? payload.messages : [];

        const resolved: Mode = payload.mode ?? (payload.isLive ? "live" : "replay");

        absorb(incoming);
        modeRef.current = resolved;
        setMode(resolved);
        setTitle((prev) => payload.title ?? prev);
        setMore(payload.more === true);
        setStatus(incoming.length > 0 || seen.current.size > 0 ? resolved : "quiet");

        cursor.current = payload.cursor ?? null;
        if (typeof payload.offsetSeconds === "number") offset.current = payload.offsetSeconds;

        failures.current = 0;
      } catch {
        if (controller.signal.aborted) return;

        failures.current += 1;
        if (failures.current >= MAX_FAILURES) {
          // A broadcast that keeps refusing is reported rather than retried
          // forever against a billed endpoint.
          setStatus("unavailable");
          return;
        }
        setStatus((prev) => (prev === "loading" ? "loading" : prev));
      }

      // Only a running stream is polled. The first request always happens, even
      // for a finished broadcast, because that is what reads its name.
      if (modeRef.current === "live" && !controller.signal.aborted) {
        timer = setTimeout(tick, POLL_MS);
      }
    }

    void tick();

    // Do not poll a hidden tab; resume promptly when it comes back.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && modeRef.current === "live") void tick();
      else if (timer) clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [videoId, isLive, absorb]);

  const loadMore = useCallback(() => {
    if (!cursor.current || inFlight.current) return;

    inFlight.current = true;
    setLoadingMore(true);

    const controller = new AbortController();

    // The cursor already points past the last message; the seek field is what the
    // replay endpoint reads its position from, so both are sent and must agree.
    const url =
      `/api/chat?id=${videoId}&mode=replay` +
      `&seek=${Math.floor(offset.current)}` +
      `&cursor=${encodeURIComponent(cursor.current)}`;

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`api returned ${res.status}`);
        return (await res.json()) as Payload;
      })
      .then((payload) => {
        const incoming = Array.isArray(payload.messages) ? payload.messages : [];

        absorb(incoming);
        cursor.current = payload.cursor ?? null;
        if (typeof payload.offsetSeconds === "number") offset.current = payload.offsetSeconds;

        setMore(payload.more === true);
        setStatus(incoming.length > 0 ? "replay" : "quiet");
      })
      .catch(() => {
        // Whatever was already loaded stays; the button remains available so a
        // single failed page does not strand the transcript.
      })
      .finally(() => {
        inFlight.current = false;
        setLoadingMore(false);
      });
  }, [videoId, absorb]);

  return { messages, title, mode, status, more, loadingMore, loadMore };
}
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
   * This is what lines the log up with the video: the panel shows the messages
   * around the player's current time, so the chat reads alongside the broadcast
   * rather than scrolling past it.
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
  more?: boolean;
  offsetSeconds?: number | null;
  durationSeconds?: number | null;
  /**
   * How long YouTube says to wait before asking again, in milliseconds.
   *
   * Sent only for a live stream, and it is the endpoint's own knowledge of when the
   * next message can arrive -- the continuation carries an invalidation deadline set
   * by the server, not a guess made here.
   */
  timeoutMs?: number | null;
};

type Mode = "live" | "replay";

type State = {
  messages: ChatMessage[];
  /**
   * Broadcast name from the API, or null when it could not be read.
   *
   * The site carries only the newest streams, so a link to an older broadcast has
   * no local metadata and would otherwise render as a bare "Broadcast". The
   * endpoint reads the same watch page the cursor needs, so the name comes along
   * for free.
   */
  title: string | null;
  /**
   * Which side of the broadcast these messages come from:
   *   live     the stream is running, and this is a rolling window of the tail
   *   replay   the stream is over, and these are read out of the recording
   */
  mode: Mode | null;
  status: "loading" | Mode | "quiet" | "unavailable";
};

/*
 * How long to wait between live polls.
 *
 * This used to be a flat fifteen seconds while the comment claimed the endpoint
 * advertised its own. It did send the figure -- `timeoutMs`, the deadline YouTube
 * puts on the continuation, which is its own knowledge of when the next message can
 * exist -- and the client threw it away. Fifteen seconds against a stream where
 * messages arrive every few is why chat looked stuck.
 *
 * The endpoint's number is used instead, bounded on both sides. The floor stops a
 * broadcast that keeps saying "come back in one second" from becoming a request
 * per second, which is a billed serverless call each time and is also not how
 * often chat actually moves. The ceiling covers an endpoint that reports no
 * deadline at all, which is the case for a quiet stream. Without the ceiling a
 * missing value would mean never asking again.
 */
const POLL_FLOOR_MS = 3_000;
const POLL_CEIL_MS = 12_000;

/** Used when the endpoint gives no deadline, or one outside the bounds. */
const POLL_DEFAULT_MS = 6_000;

/**
 * The wait before the next poll, from the deadline the last response carried.
 *
 * A value that is not a positive number, or one that lands outside the bounds, is
 * replaced rather than clamped. Clamping a three hour deadline to twelve seconds
 * would turn a stream that is genuinely quiet into a poll a second forever, which
 * is the failure the ceiling exists to prevent.
 */
function nextPollDelay(timeoutMs: number | null | undefined): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) return POLL_DEFAULT_MS;
  if (timeoutMs < POLL_FLOOR_MS || timeoutMs > POLL_CEIL_MS) return POLL_DEFAULT_MS;
  return timeoutMs;
}

/** Stop after this many consecutive failures rather than hammering a dead stream. */
const MAX_FAILURES = 4;

/**
 * How much of the recording to hold either side of the playhead.
 *
 * Behind it is the readable past. A page ahead is so a message does not appear
 * after the line it answers. YouTube serves a replay in pages of roughly
 * forty-five seconds, so this is one or two pages' worth.
 */
const BEHIND_SECONDS = 90;

/**
 * How long the playhead must settle before the chat goes and gets the stretch
 * around it. Without this, dragging the scrubber fires a request per frame.
 */
const SEEK_SETTLE_MS = 700;

/**
 * Slack before reading the next page of a replay.
 *
 * The playhead gets this close to the end of what is held before another page is
 * fetched, so there is always chat past it without the log filling faster than the
 * video is watched.
 */
const AHEAD_SECONDS = 30;

/**
 * How far past the end of what has been read counts as a jump rather than as the
 * video simply moving on.
 *
 * Two minutes of a broadcast can be genuinely quiet, and re-seeking on every quiet
 * stretch would pull from a position the visitor has not moved to. Past this, the
 * visitor has scrubbed somewhere the log has nothing for.
 */
const JUMP_SECONDS = 120;

/**
 * Cap on messages held for a replay.
 *
 * A long broadcast runs to tens of thousands of lines. The box shows a window of
 * them and the page should not grow without limit; this is a page's worth, roughly,
 * and past it the reader keeps what they have rather than pulling forever.
 */
const MESSAGE_LIMIT = 400;

/**
 * Chat for one broadcast, live or replayed.
 *
 * The two are different reads, and the difference is not cosmetic.
 *
 * A live stream exposes a rolling window of the last few minutes and nothing
 * older, so this polls it and folds each response into the list by id.
 *
 * A finished stream exposes its recording a page at a time. The chat follows the
 * playhead: it holds the stretch around the video's position, extends forward
 * while the video plays on, and starts again from a seek when the visitor scrubs
 * somewhere new. Filtering a single page would blank the log the moment the
 * visitor jumped past the end of it, which is what a page of chat cannot avoid.
 *
 * Fetching is deliberately *not* driven by the clock. The position is sampled
 * every second, and treating each sample as a request would clear and refill the
 * log once a second — a flicker, and a billed serverless call per second. The
 * clock only decides whether the held stretch is still the right one.
 *
 * Polling is paused while the tab is hidden, because a serverless function bills
 * per invocation and chat nobody is looking at is not worth paying for.
 */
export function useLiveChat(videoId: string, currentTime: number): State {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [status, setStatus] = useState<State["status"]>("loading");
  /**
   * Live or replay, as the endpoint reported it.
   *
   * Kept separate from the visible `mode` because it drives *which* effect runs,
   * and it has to be known before the first message arrives. It comes from the
   * server rather than from the site's own stream list: that list only carries the
   * newest broadcasts, so a link to any older one — or to a live stream that has
   * not been picked up yet — would otherwise be read as archived and routed to the
   * replay reader, which finds no offsets and refetches every second.
   */
  const [detected, setDetected] = useState<Mode | null>(null);

  // Refs for everything the timers read, so nothing is rebuilt on a value change.
  const seen = useRef(new Set<string>());
  const cursor = useRef<string | null>(null);
  const failures = useRef(0);
  const modeRef = useRef<Mode | null>(null);
  /** Offsets, in seconds, that the held messages actually cover. */
  const from = useRef(0);
  const to = useRef(0);
  /**
   * Whether anything is actually held yet.
   *
   * A separate flag rather than a test on `from`, because the first page of a
   * replay legitimately starts at offset 0. Reading that as "nothing loaded" sent
   * every sample down the re-seek branch, so the log was cleared and refetched once
   * a second: a flicker, and a billed request per second.
   */
  const loaded = useRef(false);
  /** How many messages are held, so reading forward can stop at some point. */
  const held = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    seen.current.clear();
    cursor.current = null;
    failures.current = 0;
    modeRef.current = null;
    from.current = 0;
    to.current = 0;
    loaded.current = false;
    held.current = 0;

    setMessages([]);
    setTitle(null);
    setMode(null);
    setStatus("loading");
  }, []);

  /**
   * Ask once which kind of broadcast this is.
   *
   * The endpoint reads the video's own player response, so it can tell a running
   * stream from a finished one even for a video the site has no record of. That
   * answer then routes the reading: polling for a live tail, following the
   * playhead for a recording.
   */
  useEffect(() => {
    clear();
    setDetected(null);
    if (!videoId) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(`/api/chat?id=${videoId}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`api returned ${res.status}`);

        const payload = (await res.json()) as Payload;
        const resolved: Mode = payload.mode ?? (payload.isLive ? "live" : "replay");

        setDetected(resolved);
        setMode(resolved);
        setTitle(payload.title ?? null);
      } catch {
        if (controller.signal.aborted) return;
        setStatus("unavailable");
      }
    })();

    return () => controller.abort();
  }, [videoId, clear]);

  /* -------------------------------------------------------------- *
   * Live: poll the rolling window
   * -------------------------------------------------------------- */
  useEffect(() => {
    if (!videoId || detected !== "live") return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

async function tick() {
      // The wait this tick will schedule after itself. Set from the response that
      // is about to be read, so the next interval reflects what the endpoint last
      // said rather than a constant chosen when the effect was built.
      let delay = POLL_DEFAULT_MS;

      try {
        const res = await fetch(`/api/chat?id=${videoId}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`api returned ${res.status}`);

        const payload = (await res.json()) as Payload;
        const incoming = Array.isArray(payload.messages) ? payload.messages : [];
        const fresh = incoming.filter((m) => m?.id && !seen.current.has(m.id));
        for (const m of fresh) seen.current.add(m.id);

        if (fresh.length > 0) {
          setMessages((prev) =>
            [...prev, ...fresh].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)),
          );
        }

modeRef.current = "live";
        setMode("live");
        setTitle((prev) => payload.title ?? prev);
        setStatus(seen.current.size > 0 ? "live" : "quiet");

        failures.current = 0;
        // Read the endpoint's own deadline before the try/catch resets anything, so
        // the wait for the next poll is the one that response asked for.
        delay = nextPollDelay(payload.timeoutMs);
      } catch {
        if (controller.signal.aborted) return;

        failures.current += 1;
        if (failures.current >= MAX_FAILURES) {
          setStatus("unavailable");
          return;
        }
        // A failed poll retries on the default rather than on the last good
        // deadline: that deadline described a response that never arrived, and
        // re-reading it would mean waiting on information that is now stale.
        delay = POLL_DEFAULT_MS;
      }

      if (!controller.signal.aborted) timer = setTimeout(tick, delay);
    }

    void tick();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
      else if (timer) clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [videoId, detected, clear]);

  /* -------------------------------------------------------------- *
   * Replay: follow the playhead
   * -------------------------------------------------------------- */

  /**
   * Fetch one stretch of the recording.
   *
   * `useCursor` walks forward from what is already held, which is the cheap way to
   * extend while a video plays on. Anything else starts again from a seek, because
   * paging forward from the wrong end would walk the length of the broadcast to
   * arrive.
   */
  const loadReplay = useCallback(
    async (seekSeconds: number, useCursor: boolean) => {
      if (!videoId) return;

      const url =
        `/api/chat?id=${videoId}&mode=replay` +
        `&seek=${Math.max(0, Math.floor(seekSeconds))}` +
        (useCursor && cursor.current ? `&cursor=${encodeURIComponent(cursor.current)}` : "");

      const res = await fetch(url, abortRef.current ? { signal: abortRef.current.signal } : {});
      if (!res.ok) throw new Error(`api returned ${res.status}`);

      const payload = (await res.json()) as Payload;
      const incoming = Array.isArray(payload.messages) ? payload.messages : [];

      const fresh = incoming.filter((m) => m?.id && !seen.current.has(m.id));
      for (const m of fresh) seen.current.add(m.id);

      cursor.current = payload.cursor ?? null;
      modeRef.current = "replay";
      setMode("replay");
      setTitle((prev) => payload.title ?? prev);

      // Track the span actually held, so a later move knows whether to extend or
      // to start over. Offsets are null for entries the payload does not date.
      const offsets = fresh
        .map((m) => m.offsetSeconds)
        .filter((v): v is number => typeof v === "number");

      if (offsets.length > 0) {
        const low = Math.min(...offsets);
        const high = Math.max(...offsets);

        if (useCursor) {
          from.current = Math.min(from.current || low, low);
          to.current = Math.max(to.current, high);
        } else {
          from.current = low;
          to.current = high;
        }
      }
      loaded.current = true;
      held.current += fresh.length;

      /*
       * Appended either way. A seek used to replace the list, which read as the
       * chat having been deleted; the transcript is a record of what has been peeked,
       * so a new stretch joins what is already there.
       *
       * The cap drops the *oldest* rather than stopping: a broadcast can run to tens
       * of thousands of lines, and the stretches just peeked at are the ones worth
       * keeping reachable.
       */
      setMessages((prev) => {
        const merged = [...prev, ...fresh].sort(
          (a, b) => (a.offsetSeconds ?? 0) - (b.offsetSeconds ?? 0),
        );
        return merged.length > MESSAGE_LIMIT ? merged.slice(-MESSAGE_LIMIT) : merged;
      });

      setStatus(seen.current.size > 0 ? "replay" : "quiet");
      failures.current = 0;
    },
    [videoId],
  );

  // One controller for the whole replay, torn down when the broadcast changes.
  useEffect(() => {
    if (!videoId || detected !== 'replay') return;

    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, [videoId, detected]);

  // Reset and first read, keyed only on the broadcast and on playback starting.
  // Deliberately not keyed on currentTime: that would clear the log every second.
  useEffect(() => {
    clear();
    if (!videoId || detected !== 'replay') return;

    void (async () => {
      try {
        await loadReplay(currentTime - BEHIND_SECONDS, false);
      } catch {
        if (abortRef.current?.signal.aborted) return;
        failures.current += 1;
        if (failures.current >= MAX_FAILURES) setStatus("unavailable");
      }
    })();
    // currentTime is read, not tracked: it changes every second and the logic below
    // decides for itself when that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, detected, clear, loadReplay]);

  // React to the playhead moving, but only act when it matters.
  useEffect(() => {
    if (!videoId || detected !== "replay") return;

    const target = Math.max(0, currentTime);

    const settle = setTimeout(() => {
      /*
       * A jump past what has been read. Fetch from where the visitor is and *keep*
       * what is already held.
       *
       * Replacing the list here is what made a seek look like it deleted the
       * chat: everything read before vanished and the panel came back holding only
       * the new stretch. The transcript is a record of what has been peeked, so a
       * seek adds to it. Paging forward instead would walk the whole rest of the
       * broadcast to arrive, which is why this seeks rather than pages.
       */
      if (target > to.current + JUMP_SECONDS) {
        void (async () => {
          try {
            await loadReplay(target - BEHIND_SECONDS, false);
          } catch {
            if (abortRef.current?.signal.aborted) return;
            failures.current += 1;
            if (failures.current >= MAX_FAILURES) setStatus("unavailable");
          }
        })();
        return;
      }

      /*
       * Otherwise keep reading forward, so the log fills out as the video plays on
       * and the scroll has something behind the playhead. This is what replaces the
       * load-more button: there is no button because there is nothing to press.
       */
      /*
       * Read forward only when the playhead is actually running out of chat.
       *
       * Reading on every sample loaded a page a second, so ten seconds of watching
       * pulled hundreds of lines nobody had reached yet and the scroll appeared to
       * grow on its own. A little lead is enough: the next page is fetched once the
       * playhead is within half a minute of the end of what is held, so there is
       * always something past it and never a flood.
       */
      if (target < to.current - AHEAD_SECONDS) return;
      if (!cursor.current || seen.current.size >= MESSAGE_LIMIT) return;

      void (async () => {
        try {
          await loadReplay(to.current, true);
        } catch {
          // A failed page keeps what is already held; the next tick retries.
        }
      })();
    }, SEEK_SETTLE_MS);

    return () => clearTimeout(settle);
  }, [videoId, detected, currentTime, loadReplay]);

  return { messages, title, mode, status };
}
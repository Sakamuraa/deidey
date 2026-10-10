import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Archive, ArrowSquareOut, ChatCircle, Eye, Play, Spinner } from "@phosphor-icons/react";

import { ActionLink } from "@/components/Action";
import { Reveal } from "@/lib/reveal";
import { useLiveChat } from "@/lib/useLiveChat";
import { useYouTubePlayer } from "@/lib/useYouTubePlayer";
import { ageLabel, useContent } from "@/lib/useContent";
import type { ContentItem } from "@/lib/useContent";

/**
 * A single broadcast, with the video and the chat beside it.
 *
 * Two data sources with different reachability, which is why this page is built
 * the way it is:
 *
 * - The player is YouTube's own /embed, fetched by the visitor's browser, not by
 *   the server. Measured: 200, 147 KB, no bot wall. The watch page is walled from
 *   a serverless IP but /embed is built for third-party use, so the one surface
 *   that is reachable is the one that matters here.
 *
 * - Chat goes through `/api/chat`, which builds its own message cursor instead of
 *   reusing the one in the watch page. That cursor is an invalidation token, and
 *   posting it back returns 200 with zero messages, which reads exactly like a
 *   quiet chat. Building one from the video and channel id returns real messages.
 *   It still only exists while a stream is running: an archived broadcast has no
 *   chat at all, so the panel names that case rather than showing an empty log.
 */
export function StreamPage() {
  const { streams } = useContent();

  // Read from location rather than from a router hook: this project has a
  // two-line router on purpose and a query string is all that is needed here.
  // The listen target is popstate, which is what a back button fires.
  const [id, setId] = useState(() => new URLSearchParams(window.location.search).get("id"));

  useEffect(() => {
    const read = () => setId(new URLSearchParams(window.location.search).get("id"));
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const item = streams.find((entry) => entry.videoId === id) ?? null;

  /**
   * Whether the video has been started, and where it has got to.
   *
   * The player reports this through YouTube's iframe API rather than this page
   * tracking its own clicks, because the control the visitor presses is inside
   * the iframe. Held here so the chat can wait for playback and then follow it;
   * `useCallback` keeps the identity stable so the player's effect does not re-run
   * on every tick.
   */
  const [playback, setPlayback] = useState({ started: false, currentTime: 0 });
  const onPlayback = useCallback((next: { started: boolean; currentTime: number }) => {
    setPlayback(next);
  }, []);

  // The chat hook lives here rather than inside the panel because the broadcast's
  // name also comes from it: the site carries only the newest streams, so a link
  // to an older one has no local metadata and would otherwise render as a bare
  // "Broadcast". Fetching chat is also what reads the watch page that names it.
  const chat = useLiveChat(id ?? "", playback.currentTime);
  const heading = item?.title ?? chat.title;

  useEffect(() => {
    if (heading) document.title = `${heading} - Pingu Stardine`;
  }, [heading]);

  if (!id) return <Missing />;

  return (
    /* Tighter top padding than the other pages. This one carries a player the
       visitor is meant to press straight away, and the full nav clearance pushed
       the video itself below the fold. */
    <section id="isi-stream" aria-labelledby="stream-heading" className="pt-16 pb-20 md:pt-20 md:pb-24">
      <div className="shell">
        <Reveal amount={0.2}>
          <a
            href="/konten"
            className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
          >
            <Play size={12} aria-hidden="true" weight="fill" />
            Kembali ke daftar
          </a>
        </Reveal>

        <Reveal amount={0.25} delay={0.05}>
          {/* Player and chat sit side by side and end together. The heading and
              meta row are below the pair rather than inside the left column: left
              there they made the left column the tallest thing in the row, and the
              chat panel, which fills its row, grew down to match them. That is why
              it used to hang past the bottom of the video. */}
          <div className="mt-5 grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Player videoId={id} onPlayback={onPlayback} />
            </div>

            <div className="lg:col-span-4">
              <ChatPanel videoId={id} chat={chat} playback={playback} />
            </div>
          </div>

          <h1
            id="stream-heading"
            className="mt-5 font-display text-xl font-semibold leading-snug tracking-tight md:text-3xl"
          >
            {heading ?? "Broadcast"}
          </h1>

          <MetaRow item={item} />
        </Reveal>
      </div>
    </section>
  );
}

function Missing() {
  return (
    <section className="pt-24 pb-24 md:pt-32 md:pb-32">
      <div className="shell">
        <Reveal amount={0.2}>
          <h1 className="text-3xl font-semibold tracking-tight">Broadcast tidak ditemukan</h1>
          <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-fg-muted">
            Tidak ada broadcast dengan id tersebut di daftar terbaru.
          </p>
          <div className="mt-6">
            <ActionLink href="/konten" variant="quiet">
              Lihat daftar broadcast
            </ActionLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The player.
 *
 * The element handed to the YouTube API is an empty div rather than an iframe the
 * page writes itself. YT annotates and owns whatever element it builds the player
 * into, and it does not reliably take over an iframe the page authored; handing it
 * a mount point and a video id is the supported shape. So the iframe, and its
 * src, come from YT and are not in this file.
 *
 * `origin` is passed through so postMessage works, and is read from the live
 * location rather than build-time config so it is right on any host. autoplay is
 * left off and playsinline set, so a phone does not start playing audio nobody
 * asked for.
 */
function Player({
  videoId,
  onPlayback,
}: {
  videoId: string;
  onPlayback: (state: { started: boolean; currentTime: number }) => void;
}) {
  const { started, currentTime, mountRef } = useYouTubePlayer(videoId);

  useEffect(() => {
    onPlayback({ started, currentTime });
  }, [started, currentTime, onPlayback]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-card border border-line bg-cocoa">
      <div
        ref={mountRef}
        className="size-full [&>iframe]:size-full [&>iframe]:border-0"
        title="Pemutar broadcast Pingu Stardine"
      />
    </div>
  );
}

function MetaRow({ item }: { item: ContentItem | null }) {
  if (!item) return null;

  const label = ageLabel(item);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-subtle">
      {item.live && (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-cocoa px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-bg">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-bg opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-bg" />
          </span>
          Live
        </span>
      )}

      {label && <span>{label}</span>}

      {item.viewers !== null && (
        <span className="inline-flex items-center gap-1">
          <Eye size={14} aria-hidden="true" />
          {item.viewers.toLocaleString("id-ID")}
        </span>
      )}

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 hover:text-fg"
      >
        Buka di YouTube
        <ArrowSquareOut size={14} aria-hidden="true" />
      </a>
    </div>
  );
}

/**
 * Live chat.
 *
 * Reads `/api/chat`, which builds its own message cursor from the video and
 * channel id. The cursor a watch page hands out is an invalidation token, not a
 * message position, and posting it back returns an empty chat that is
 * indistinguishable from a quiet one. See api/chat.ts.
 *
 * Two shapes arrive here. A running stream yields a rolling window of the last
 * few minutes, polled. A finished one yields the recording, a page at a time, so
 * the header says replay and the reader pulls further stretches in as they go.
 * A broadcast with no chat at all is the only case that gets an explanation.
 */
/**
 * How much of the recording to hold either side of the playhead.
 *
 * Behind it is a conversation worth reading; a little ahead of it so a message
 * does not appear after the line it answers. A replay page from YouTube spans
 * around twenty minutes, so the window is what keeps a two-second-old video from
 * opening on twenty minutes of chat.
 */
const BEHIND_SECONDS = 90;
const AHEAD_SECONDS = 15;

function ChatPanel({
  videoId,
  chat,
  playback,
}: {
  videoId: string;
  chat: ReturnType<typeof useLiveChat>;
  playback: { started: boolean; currentTime: number };
}) {
  const { started, currentTime } = playback;
  const { messages, status, mode } = chat;
  // Which kind of read this is, as the endpoint reported it, not as the site's
  // stream list guesses: the list only carries the newest broadcasts.
  const isLive = mode === "live";

  const logRef = useRef<HTMLDivElement>(null);

  /**
   * The stretch of the transcript that belongs on screen right now.
   *
   * Two separate things, and keeping them separate is the whole point:
   *
   *   messages  everything ever read. Nothing is dropped, so peeking an hour in
   *             and coming back does not find the earlier chat emptied out.
   *   visible   only the lines around where the video is. Without this the log
   *             opens on forty-seven messages spanning twenty-one minutes while
   *             the video has been running two seconds, which is not a chat
   *             anybody is watching — chat arrives as the broadcast does.
   *
   * A live stream has no fixed positions, so it shows everything it holds.
   */
  const visible = useMemo(() => {
    if (mode !== "replay" || !started) return messages;

    return messages.filter((m) => {
      if (m.offsetSeconds === null) return false;
      // A little behind the playhead, so there is a conversation to read rather
      // than one line, and a little ahead so a reply does not land after the line
      // it answers.
      return m.offsetSeconds <= currentTime + AHEAD_SECONDS && m.offsetSeconds >= currentTime - BEHIND_SECONDS;
    });
  }, [messages, mode, started, currentTime]);

  // Follow new messages in a live stream, which genuinely arrives at the bottom.
  // A replay does not use this: its log is anchored to the playhead instead, and
  // scrolling to the bottom while the video sits an hour in would tear the reader
  // away from the moment they are watching.
  /*
   * Following the tail of a live chat, without ever taking the page away from
   * someone reading it.
   *
   * Three states, and the distinction matters more than the scrolling does:
   *
   *   following  the reader is parked at the bottom, so new lines scroll in
   *   reading    they have scrolled up to look at something, and stay put
   *   returning  they were reading, new lines arrived, and they have not moved
   *
   * The old version inferred all of that from one comparison each time messages
   * arrived -- within eighty pixels of the bottom meant "follow". That is not the
   * same question. Eighty pixels is a line or two of chat, so a reader who had
   * scrolled up a little to re-read something was still inside the threshold and
   * got dragged back to the bottom by the next message, repeatedly, while they
   * were trying to read. It also read the *previous* scroll position at the moment
   * new content landed, by which point the browser had already grown the box, so
   * the measurement was of a box that had just changed underneath it.
   *
   * So the position is sampled from a scroll event rather than from the height at
   * render time, and following is a real boolean that only a deliberate scroll to
   * the bottom turns back on. A small tolerance is kept -- exactly at the bottom
   * is fragile, since sub-pixel rounding puts it just outside -- but it is tight
   * enough that scrolling up by a line is enough to stop following.
   */
  const [following, setFollowing] = useState(true);
  /** Lines that arrived while the reader was looking elsewhere. */
  const [unread, setUnread] = useState(0);

  // Refs, because the scroll handler runs on every frame of a wheel or drag and
  // must not re-render the log to record where the reader is.
  const followingRef = useRef(true);
  const lastCountRef = useRef(0);
  const lastModeRef = useRef<string | null>(null);

  const markFollowing = useCallback((value: boolean) => {
    followingRef.current = value;
    setFollowing(value);
    if (value) setUnread(0);
  }, []);

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;

    const onScroll = () => {
      const slack = node.scrollHeight - node.scrollTop - node.clientHeight;
      // Six pixels: enough to survive sub-pixel rounding at the bottom, tight
      // enough that a deliberate scroll upward stops the following straight away.
      markFollowing(slack <= 6);
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [markFollowing]);

  /*
   * New lines arriving.
   *
   * Following: scroll down to them, smoothly, so the eye can track it rather than
   * being teleported.
   *
   * Reading: count them instead of moving. The count is what lets the reader come
   * back on their own terms -- either by scrolling to the bottom, which turns
   * following back on and clears it, or by pressing the button.
   *
   * The first load is a scroll to the bottom without animation. The log is empty
   * at that point and there is nothing to follow from, so animating would only
   * show the box flying up from nothing.
   */
  useEffect(() => {
    if (mode !== "live") {
      lastModeRef.current = mode;
      return;
    }

    const node = logRef.current;
    if (!node) return;

    const grew = visible.length - lastCountRef.current;
    const firstLoad = lastModeRef.current !== "live";
    lastCountRef.current = visible.length;
    lastModeRef.current = mode;

    if (firstLoad) {
      node.scrollTop = node.scrollHeight;
      markFollowing(true);
      return;
    }

    if (grew <= 0) return;

    if (followingRef.current) {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    } else {
      setUnread((n) => n + grew);
    }
  }, [visible.length, mode, markFollowing]);

  /* Jump back to the tail, by button or by reaching the bottom yourself. */
  const jumpToLatest = useCallback(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    markFollowing(true);
  }, [markFollowing]);

  /*
   * Follow the playhead through the log.
   *
   * The transcript grows in both directions as it is read — forwards as the video
   * plays, backwards when the visitor peeks earlier — so the newest line is rarely
   * the one beside the video. This scrolls to the message nearest where the player
   * is, which is what makes the chat read alongside the broadcast instead of
   * scrolling past it.
   *
   * Each row carries its position in the recording, so the target is found by
   * looking at the DOM rather than by arithmetic on an index that shifts as more
   * arrive. A live stream has no fixed positions and is left alone.
   *
   * The scroll is applied to the log's own scrollTop, not with scrollIntoView.
   * scrollIntoView walks up to every scrollable ancestor and scrolls each one, so
   * on a page where the player and the log sit side by side it moved the document
   * too — the reader was yanked away from the video by chat arriving, which is the
   * opposite of following the playhead. offsetTop is already relative to the log,
   * so the arithmetic is the same and the page stays put.
   */
  useEffect(() => {
    if (!started || mode !== "replay") return;

    const log = logRef.current;
    if (!log) return;

    let nearest: HTMLElement | null = null;
    let nearestGap = Infinity;

    for (const row of log.querySelectorAll<HTMLElement>("li[data-offset]")) {
      const offset = Number(row.dataset.offset);
      if (!Number.isFinite(offset)) continue;

      const gap = Math.abs(offset - currentTime);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = row;
      }
    }

    if (!nearest) return;

    // Centre the row inside the box by hand: half the box's height, minus half the
    // row's, plus whatever the row sits at within the log.
    const target =
      nearest.offsetTop - log.clientHeight / 2 + nearest.offsetHeight / 2;

    // Clamped, because a transcript can be shorter than the box and scrollTop
    // would otherwise be set to a negative number, which the browser ignores and
    // leaves the log pinned to the top for no reason.
    log.scrollTop = Math.max(0, Math.min(target, log.scrollHeight - log.clientHeight));
  }, [currentTime, mode, started, visible.length]);

  return (
    /*
     * A fixed box, not one that grows with its contents.
     *
     * h-full cannot work: a grid row takes its height from its tallest cell, so a
     * panel sized by h-full asks the row how tall it is, and the row is waiting to
     * be told — it settles at the chat's own content height instead. An explicit
     * aspect settles it: the player fills 8 of 12 columns at 16:9, so its height is
     * (width - gap) * 8/12 * 9/16 = 0.375. The panel fills 4 of 12, so at 8:9 its
     * height is (width - gap) * 4/12 * 9/8 = 0.375 as well. The two agree, and the
     * row can take its height from the player.
     *
     * The overflow-hidden and the scrolling child below are what keep it that way:
     * without them the list would push the box out again the moment it filled.
     */
    <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-card border border-line bg-surface lg:aspect-[8/9] lg:max-h-none">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        {mode === "replay" ? (
          <Archive size={18} aria-hidden="true" className="text-fg-muted" />
        ) : (
          <ChatCircle size={18} aria-hidden="true" className="text-fg-muted" />
        )}
        <h2 className="text-sm font-semibold">{mode === "replay" ? "Replay chat" : "Live chat"}</h2>
        {visible.length > 0 && started && (
          <span className="ml-auto font-mono text-xs text-fg-subtle">{visible.length}</span>
        )}
      </div>

      {!started ? (
        /* Waits for playback. A transcript sitting still beside a paused video is
           out of context — a recording holds thousands of lines and none of them
           are the moment being looked at. Once the video is running the log scrolls
           to where the playhead is and the reader can go back from there. */
        <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-8 text-center">
          <Play size={22} aria-hidden="true" className="mx-auto text-fg-subtle" weight="fill" />
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            {status === "loading" ? "Membaca chat…" : "Putar videonya dulu"}
          </p>
          {status !== "loading" && (
            <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
              Chat-nya muncul bareng video, lalu ikut ngikutin waktu tayannya.
            </p>
          )}
        </div>
      ) : visible.length > 0 ? (
        /*
         * Wrapped rather than the log standing alone, so the jump button can sit
         * over the bottom of the box. It is absolutely positioned inside a relative
         * parent, which means it adds no height and does not become part of the
         * scrolling content -- a button in the flow would be pushed out of view by
         * the very messages it exists to follow.
         */
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            id="konten-chat-log"
            ref={logRef}
            className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
            /*
             * Announcements follow the scroll state, not the message count.
             *
             * `polite` while the log is keeping itself current is right: the reader
             * is watching it fill, and a new line is the thing they are here for.
             *
             * `off` while they have scrolled up is the point of the whole three
             * state arrangement. A live region announces on content change whether
             * or not the reader can see the change -- so someone reading back through
             * chat would have every new line announced at them while the line itself
             * had deliberately not been moved into view. The button carries the count
             * instead, so nothing arrives unasked and nothing is lost.
             */
            aria-live={following && mode === "live" ? "polite" : "off"}
          >
            <ul className="flex flex-col gap-3">
            {visible.map((m) => (
              <li key={m.id} data-offset={m.offsetSeconds ?? undefined} className="flex gap-2.5">
                {m.avatar ? (
                  <img
                    src={m.avatar}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    className="mt-0.5 h-7 w-7 shrink-0 rounded-full"
                  />
                ) : (
                  <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-peach-soft" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-semibold text-fg">{m.author || "Tanpa nama"}</span>
                    {m.badge === "member" && (
                      <span className="rounded-full bg-peach-soft px-1.5 py-px text-[0.625rem] font-medium text-shadow">
                        Member
                      </span>
                    )}
                    {m.badge === "paid" && (
                      <span className="rounded-full bg-peach px-1.5 py-px text-[0.625rem] font-medium text-white">
                        Disokong
                      </span>
                    )}
                    {m.at && (
                      <time className="font-mono text-fg-subtle" dateTime={new Date(m.at).toISOString()}>
                        {new Date(m.at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    )}
                  </p>

                  {/* Emoji are sent separately from the text because the channel
                      defines its own, so they are laid out here rather than
                      interpolated into a string. */}
                  <p className="wrap-anywhere mt-0.5 text-sm leading-relaxed text-fg-muted">
                    {m.body}
                    {Object.keys(m.emojis).length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(m.emojis).map(([name, url]) => (
                          <img
                            key={name}
                            src={url}
                            alt={name}
                            title={name}
                            width={20}
                            height={20}
                            loading="lazy"
                            className="inline-block h-5 w-5 align-text-bottom"
                          />
                        ))}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
            </ul>
          </div>

          {/*
            The jump button. Only while a live chat has new lines the reader has
            not scrolled down to, and only then -- its absence is what says the log
            is keeping itself up to date. Scrolling to the bottom by hand clears it
            just as pressing it does, so the two are not different affordances.
          */}
          {unread > 0 && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-xs font-medium text-fg shadow-sm transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              ↓ {unread} baru
              <span className="sr-only"> — ke pesan terbaru</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-8 text-center">
          {mode === "replay" && messages.length > 0 ? (
            /* The transcript is loaded but nothing falls in the window around the
               playhead. That is the normal state wherever the video is quiet, and
               saying so is better than showing an empty panel that looks broken. */
            <>
              <Archive size={22} aria-hidden="true" className="mx-auto text-fg-subtle" />
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                Belum ada chat di menit ini.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
                Kalau quiet, chat-nya akan muncul sendiri sesuai waktu Tayannya.
              </p>
            </>
          ) : status === "loading" ? (
            <>
              <Spinner size={22} aria-hidden="true" className="mx-auto animate-spin text-fg-subtle" />
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">Membaca chat…</p>
            </>
          ) : status === "quiet" && isLive ? (
            <>
              <ChatCircle size={22} aria-hidden="true" className="mx-auto text-fg-subtle" />
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                Stream-nya live, tapi belum ada chat di jam-jam terakhir ini.
              </p>
            </>
          ) : status === "quiet" ? (
            <>
              <Archive size={22} aria-hidden="true" className="mx-auto text-fg-subtle" />
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                Chat dari broadcast ini sudah ditutup YouTube, jadi tidak ada yang
                bisa diputar ulang.
              </p>
            </>
          ) : (
            <>
              <ChatCircle size={22} aria-hidden="true" className="mx-auto text-fg-subtle" />
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                Chat untuk stream ini belum bisa dibaca dari server.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
                YouTube menutup endpoint chatnya dari server. Buka di YouTube untuk ikut chat.
              </p>
            </>
          )}

          <div className="mt-5">
            <ActionLink
              href={`https://www.youtube.com/watch?v=${videoId}`}
              external
              variant="quiet"
              size="md"
            >
              Buka di YouTube
              <ArrowSquareOut size={16} aria-hidden="true" />
            </ActionLink>
          </div>
        </div>
      )}
    </div>
  );
}

/** Exported for the router, which owns the mapping from path to page. */
export { StreamPage as default };
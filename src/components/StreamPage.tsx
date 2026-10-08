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

  // The chat hook lives here rather than inside the panel because the broadcast's
  // name also comes from it: the site carries only the newest streams, so a link
  // to an older one has no local metadata and would otherwise render as a bare
  // "Broadcast". Fetching chat is also what reads the watch page that names it.
  const chat = useLiveChat(id ?? "", item?.live === true);

  /**
   * Whether the video has been started, and where it has got to.
   *
   * The player reports this through YouTube's iframe API rather than this page
   * tracking its own clicks, because the control the visitor presses is inside
   * the iframe. Held here so the chat panel can wait for playback and then follow
   * it; `useCallback` keeps the identity stable so the player's effect does not
   * re-run on every tick.
   */
  const [playback, setPlayback] = useState({ started: false, currentTime: 0 });
  const onPlayback = useCallback((next: { started: boolean; currentTime: number }) => {
    setPlayback(next);
  }, []);

  const heading = item?.title ?? chat.title;

  useEffect(() => {
    if (heading) document.title = `${heading} - Mizu Hamzazu`;
  }, [heading]);

  if (!id) return <Missing />;

  return (
    <section id="isi-stream" aria-labelledby="stream-heading" className="pt-24 pb-24 md:pt-32 md:pb-32">
      <div className="shell">
        <Reveal amount={0.2}>
          <a
            href="/konten"
            className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
          >
            <Play size={14} aria-hidden="true" weight="fill" />
            Kembali ke daftar
          </a>
        </Reveal>

        <Reveal amount={0.25} delay={0.05}>
          {/* Player and chat sit side by side and end together. The heading and
              meta row are below the pair rather than inside the left column: left
              there they made the left column the tallest thing in the row, and the
              chat panel, which fills its row, grew down to match them. That is why
              it used to hang past the bottom of the video. */}
          <div className="mt-8 grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Player videoId={id} onPlayback={onPlayback} />
            </div>

            <div className="lg:col-span-4">
              <ChatPanel item={item} videoId={id} chat={chat} playback={playback} />
            </div>
          </div>

          <h1
            id="stream-heading"
            className="mt-6 font-display text-2xl font-semibold leading-snug tracking-tight md:text-3xl"
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
 * `origin` is required by YouTube's embed API for postMessage to work, so it is
 * read from the live location rather than the build-time config, which would
 * break on any other host. autoplay stays off and playsinline is set, so a phone
 * does not start playing audio the visitor did not ask for.
 *
 * enablejsapi=1 turns on the callbacks the chat panel listens to: without it the
 * page cannot tell whether the video is playing, nor where in the recording it
 * has got to, and a replay chat has nothing to line itself up against.
 */
function Player({
  videoId,
  onPlayback,
}: {
  videoId: string;
  onPlayback: (state: { started: boolean; currentTime: number }) => void;
}) {
  const [origin, setOrigin] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { started, currentTime } = useYouTubePlayer(frameRef);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    onPlayback({ started, currentTime });
  }, [started, currentTime, onPlayback]);

  if (!origin) {
    return <div className="aspect-video w-full rounded-card border border-line bg-surface" />;
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-card border border-line bg-cocoa">
      <iframe
        ref={frameRef}
        src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(origin)}`}
        title="Pemutar broadcast Mizu Hamzazu"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="size-full border-0"
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
function ChatPanel({
  item,
  videoId,
  chat,
  playback,
}: {
  item: ContentItem | null;
  videoId: string;
  chat: ReturnType<typeof useLiveChat>;
  playback: { started: boolean; currentTime: number };
}) {
  const isLive = item?.live === true;
  const { messages, status, mode, more, loadingMore, loadMore } = chat;
  const { started, currentTime } = playback;

  const logRef = useRef<HTMLDivElement>(null);

  /**
   * Which messages belong on screen at this point in the recording.
   *
   * A replay is read against the player rather than down on its own: everything
   * up to where the video is now is history, and the next stretch has not been
   * said yet. Holding a window around the current position keeps the log in step
   * with what is happening on screen instead of sitting still while the video
   * runs on. A live stream has no fixed position, so nothing is filtered.
   */
  const visible = useMemo(() => {
    if (mode !== "replay" || !started) return messages;
    return messages.filter((m) => {
      if (m.offsetSeconds === null) return false;
      // A trailing window: what was just said, plus a little ahead of the playhead.
      return m.offsetSeconds <= currentTime + 15 && m.offsetSeconds >= currentTime - 90;
    });
  }, [messages, mode, started, currentTime]);

  // Keep the newest line in view as the list grows, the way a chat log reads.
  useEffect(() => {
    if (!started) return;
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [visible.length, started]);

  return (
    // h-0 min-h-full rather than h-full. A grid row takes its height from
    // whichever cell is tallest, so a chat panel sized by its own content would
    // set that height itself and the row would never settle at the player's.
    // Zeroing the contribution and then filling the row breaks the cycle.
    <div className="flex h-0 min-h-full max-h-[70vh] flex-col overflow-hidden rounded-card border border-line bg-surface lg:max-h-none">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        {mode === "replay" ? (
          <Archive size={18} aria-hidden="true" className="text-fg-muted" />
        ) : (
          <ChatCircle size={18} aria-hidden="true" className="text-fg-muted" />
        )}
        <h2 className="text-sm font-semibold">{mode === "replay" ? "Replay chat" : "Live chat"}</h2>
        {messages.length > 0 && started && (
          <span className="ml-auto font-mono text-xs text-fg-subtle">{visible.length}</span>
        )}
      </div>

      {!started ? (
        /* Nothing to line up against yet. A replay transcript sitting still next to
           a paused video is a wall of text out of context, so the panel waits. */
        <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-8 text-center">
          <Play size={22} aria-hidden="true" className="mx-auto text-fg-subtle" weight="fill" />
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            {status === "loading" ? "Membaca chat…" : "Putar videonya dulu"}
          </p>
          {status !== "loading" && (
            <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
              Chat-nya muncul bareng video, mengikuti waktu Tayannya.
            </p>
          )}
        </div>
      ) : visible.length > 0 ? (
        <div
          id="konten-chat-log"
          ref={logRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          aria-live="polite"
        >
          <ul className="flex flex-col gap-3">
            {visible.map((m) => (
              <li key={m.id} className="flex gap-2.5">
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

          {/* A replay is read a page at a time, so it needs a way to ask for the
              next stretch. A live stream has nothing to page through. */}
          {mode === "replay" && more && (
            <div className="mt-4 border-t border-line pt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-button border border-line px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-peach-soft hover:text-fg disabled:cursor-progress disabled:opacity-60"
              >
                {loadingMore ? "Membaca…" : "Muat chat sebelumnya"}
              </button>
            </div>
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
                Belum ada chat di menit ini. Kalau chat-nya ada tapi belum ikut
                terbaca, muat lagi.
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
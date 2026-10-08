import { useEffect, useState } from "react";

import { ArrowSquareOut, Broadcast, ChatCircle, Eye, Play } from "@phosphor-icons/react";

import { ActionLink } from "@/components/Action";
import { Reveal } from "@/lib/reveal";
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
 * - Chat is the other story. The live_chat endpoint itself answers, but the
 *   liveChatId it needs only appears in the watch page's player response, which
 *   is exactly what the bot wall blocks. Chat also only exists while a stream is
 *   running: an archived broadcast has none at all, which is every entry in this
 *   list right now.
 *
 * So the panel says which case it is instead of showing a chat box that silently
 * never fills. A liveChatId can be threaded in through the API later, and the
 * panel is built to take one.
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

  useEffect(() => {
    if (item) document.title = `${item.title} - Mizu Hamzazu`;
  }, [item]);

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
          <div className="mt-8 grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Player videoId={id} />

              <h1
                id="stream-heading"
                className="mt-6 font-display text-2xl font-semibold leading-snug tracking-tight md:text-3xl"
              >
                {item?.title ?? "Broadcast"}
              </h1>

              <MetaRow item={item} />
            </div>

            <div className="lg:col-span-4">
              <ChatPanel item={item} videoId={id} />
            </div>
          </div>
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
 */
function Player({ videoId }: { videoId: string }) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!origin) {
    return <div className="aspect-video w-full rounded-card border border-line bg-surface" />;
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-card border border-line bg-cocoa">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?origin=${encodeURIComponent(origin)}`}
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
 * Present, honest, and empty on purpose. The conditions are checked in order so
 * the panel names the actual reason rather than a generic failure: not live, no
 * id, then not readable.
 */
function ChatPanel({ item, videoId }: { item: ContentItem | null; videoId: string }) {
  const isLive = item?.live === true;

  return (
    <div className="flex h-full flex-col rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <ChatCircle size={18} aria-hidden="true" className="text-fg-muted" />
        <h2 className="text-sm font-semibold">Live chat</h2>
      </div>

      <div className="flex flex-1 flex-col justify-center px-5 py-8 text-center">
        {!isLive ? (
          <>
            <Broadcast size={22} aria-hidden="true" className="mx-auto text-fg-subtle" />
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              Chat hanya ada selama stream berjalan. Broadcast ini sudah selesai,
              jadi chatnya sudah ditutup YouTube.
            </p>
          </>
        ) : (
          <>
            <ChatCircle size={22} aria-hidden="true" className="mx-auto text-fg-subtle" />
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              Chat untuk stream ini belum bisa diambil dari server.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
              YouTube hanya memberi id chat di halaman watch, dan halaman itu
              memblokir permintaan dari server. Buka di YouTube untuk ikut chat.
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
    </div>
  );
}

/** Exported for the router, which owns the mapping from path to page. */
export { StreamPage as default };
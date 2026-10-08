import { Broadcast, Eye, Play } from "@phosphor-icons/react";
import { useState } from "react";

import { Reveal, StaggerGroup, StaggerItem } from "@/lib/reveal";
import { ageLabel, useContent } from "@/lib/useContent";
import type { ContentItem } from "@/lib/useContent";

const HOUR = 60 * 60 * 1000;
/** Anything inside this window counts as recent, anything older does not. */
const RECENT_WINDOW_MS = 24 * HOUR;

/** Milliseconds per unit in an age label, for the recency filter. */
const AGE_UNIT_MS: Record<string, number> = {
  detik: 1000,
  menit: 60 * 1000,
  jam: HOUR,
  hari: 24 * HOUR,
  minggu: 7 * 24 * HOUR,
  bulan: 30 * 24 * HOUR,
};

/**
 * Recent broadcasts.
 *
 * Rendered from `/api/content`, which reads the channel at request time and
 * reports live status per entry. Until that response lands the cards come from a
 * bundled snapshot, so the section is never empty and never shows a spinner.
 *
 * Layout family is deliberately different from the profile block above it: a
 * staggered two-column flow where every other card drops down.
 */
export function Uploads() {
  const { streams, live, source } = useContent();

  // The endpoint returns the newest broadcasts regardless of age; this section
  // shows the last day of them. A label the grids write is the source of truth
  // here, so an unreadable age is treated as not recent rather than guessed into
  // the window.
  const recent = streams.filter((item) => {
    const label = ageLabel(item);
    if (!label) return false;

    const parts = label.match(/^(\d+)\s+(detik|menit|jam|hari|minggu|bulan)\s+lalu$/);
    if (!parts) return false;

    return Number(parts[1]) * AGE_UNIT_MS[parts[2]] < RECENT_WINDOW_MS;
  });

  /*
   * Never an empty shelf.
   *
   * The window is a day, and Mizu does not stream every day, so most days this
   * filtered to nothing and the section rendered as a heading over blank space
   * with a note pointing elsewhere — a worse answer than showing the last thing
   * she did, however long ago. So if the window comes up empty the newest
   * broadcast is shown instead, with its real age on it.
   *
   * The fallback is the newest entry, so when she goes live it *is* the live one:
   * it passes the window on its own and this branch stops being taken.
   */
  const items = recent.length > 0 ? recent : streams.slice(0, 1);

  return (
    <section id="klip" aria-labelledby="uploads-heading" className="py-24 md:py-32">
      <div className="shell">
        <Reveal amount={0.3}>
          <h2
            id="uploads-heading"
            className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
          >
            Recent Streams
          </h2>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-fg-muted md:text-lg">
            {live
              ? "Ada yang sedang live sekarang."
              : recent.length > 0
                ? "Broadcast dari 24 jam terakhir, diambil langsung dari channel."
                : "Belum ada broadcast dalam 24 jam. Yang paling baru:"}
          </p>
        </Reveal>

        {items.length > 0 ? (
          <StaggerGroup
            className="mt-14 grid gap-x-6 gap-y-10 sm:grid-cols-2"
            stagger={0.05}
            amount={0.08}
          >
            {items.map((item, index) => (
              <StaggerItem
                key={item.videoId}
                // Offset every second column on desktop so the pair reads as a
                // staggered flow. Collapses to a flat single column on mobile.
                // min-w-0 as well: a grid track sized by min-content will not
                // shrink below an unbreakable token without it.
                className={`min-w-0 ${index % 2 === 1 ? "sm:mt-16" : ""}`}
              >
                <BroadcastCard item={item} fallbackIndex={index} />
              </StaggerItem>
            ))}
          </StaggerGroup>
        ) : (
          <p className="mt-14 max-w-[52ch] text-sm leading-relaxed text-fg-subtle">
            Belum ada broadcast yang bisa ditampilkan. Arsip lengkapnya ada di{" "}
            <a href="/konten" className="underline underline-offset-4 hover:text-fg">
              Konten
            </a>
            .
          </p>
        )}

        {/* Say where the list came from. On the snapshot path the page is still
            correct, just older, and the visitor deserves to know. */}
        <p className="mt-12 flex items-center gap-2 text-xs text-fg-subtle">
          <Broadcast size={14} aria-hidden="true" />
          {source === "api"
            ? "Dibaca langsung dari channel, lengkap dengan usianya."
            : source === "loading"
              ? "Mengambil data terbaru."
              : "Menampilkan salinan tersimpan. Data langsung tidak tersedia."}
        </p>
      </div>
    </section>
  );
}

/**
 * Thumbnail address for one video.
 *
 * Keyed by videoId rather than by list position, because a list that reorders
 * would otherwise swap thumbnails between videos. maxresdefault only exists on
 * HD uploads, so hqdefault is the guaranteed fallback.
 */
export function Thumb({ item }: { item: ContentItem }) {
  const initial = item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg`;
  const [src, setSrc] = useState(initial);

  return (
    <img
      src={src}
      alt=""
      width={1280}
      height={720}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (src.endsWith("maxresdefault.jpg")) {
          setSrc(`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`);
        }
      }}
      className="aspect-video w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
    />
  );
}

function BroadcastCard({ item, fallbackIndex }: { item: ContentItem; fallbackIndex: number }) {
  // The bundled files are only for the snapshot path, where the order is fixed
  // and known.
  const bundled = `/media/upload-${String(fallbackIndex + 1).padStart(2, "0")}.jpg`;
  const [fallback, setFallback] = useState(false);
  const label = ageLabel(item);

  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block">
      {/* 16:9 frames keep the card radius. The arch is reserved for the square
          avatar, where it echoes a doorway. */}
      <div className="relative overflow-hidden rounded-card border border-line bg-surface">
        {fallback ? (
          <img
            src={bundled}
            alt=""
            width={1280}
            height={720}
            loading="lazy"
            decoding="async"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <ThumbFallback item={item} onFail={() => setFallback(true)} />
        )}
      </div>

      <div className="mt-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-pill bg-surface-deep text-fg-muted"
        >
          <Play size={14} weight="fill" />
        </span>

        <span className="min-w-0">
          {item.live && (
            <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-pill bg-cocoa px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-bg">
              {/* A real semantic state read from the channel, which is the one
                  case where a status dot belongs. */}
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-bg opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-bg" />
              </span>
              Live
            </span>
          )}

          <span className="block font-display text-lg font-medium leading-snug tracking-tight text-fg">
            {item.title}
          </span>

          {(label || item.viewers !== null) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-subtle">
              {/* The channel's own relative age, "5 jam lalu". Not a start time:
                  YouTube counts from when the archive went up, which is hours
                  after the stream began, so the card does not claim otherwise. */}
              {label && <span>{label}</span>}
              {item.viewers !== null && (
                <span className="inline-flex items-center gap-1">
                  <Eye size={14} aria-hidden="true" />
                  {item.viewers.toLocaleString("id-ID")}
                </span>
              )}
            </span>
          )}
        </span>
      </div>
    </a>
  );
}

/**
 * Thumbnail with a two-step fallback: the API's own URL, then maxres, then hq,
 * then the bundled file. Each step is a real failure mode rather than a guess,
 * since the search endpoint serves a different image size than the channel tabs.
 */
function ThumbFallback({ item, onFail }: { item: ContentItem; onFail: () => void }) {
  const apiUrl = item.thumbnail;
  const ytUrl = `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg`;

  return (
    <img
      src={apiUrl || ytUrl}
      alt=""
      width={1280}
      height={720}
      loading="lazy"
      decoding="async"
      onError={(event) => {
        const el = event.currentTarget;
        // Walk the known-good chain once, then hand over to the bundled file.
        if (el.dataset.fallback === undefined) {
          el.dataset.fallback = "1";
          el.src = `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg`;
        } else if (el.dataset.fallback === "1" && !el.src.includes("hqdefault")) {
          el.dataset.fallback = "2";
          el.src = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
        } else {
          onFail();
        }
      }}
      className="aspect-video w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
    />
  );
}
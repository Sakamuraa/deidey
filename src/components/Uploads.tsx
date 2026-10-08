import { Broadcast, Eye, Play } from "@phosphor-icons/react";
import { useState } from "react";

import { Reveal, StaggerGroup, StaggerItem } from "@/lib/reveal";
import { useUploads } from "@/lib/useUploads";
import type { Upload } from "@/lib/useUploads";

/**
 * Latest broadcasts.
 *
 * Rendered from `/api/uploads`, which reads the channel at request time and
 * reports live status per entry. Until that response lands the cards come from
 * a bundled snapshot, so the section is never empty and never shows a spinner.
 *
 * Layout family is deliberately different from the profile block above it: a
 * staggered two-column flow where every other card drops down.
 */
export function Uploads() {
  const { uploads, live, source } = useUploads();
  const items = uploads ?? [];

  return (
    <section id="klip" aria-labelledby="uploads-heading" className="py-24 md:py-32">
      <div className="shell">
        <Reveal amount={0.3}>
          <h2
            id="uploads-heading"
            className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
          >
            Yang baru keluar
          </h2>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-fg-muted md:text-lg">
            {live
              ? "Ada yang sedang live sekarang."
              : "Delapan broadcast terakhir, diambil langsung dari channel."}
          </p>
        </Reveal>

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
              className={index % 2 === 1 ? "sm:mt-16" : ""}
            >
              <BroadcastCard item={item} fallbackIndex={index} />
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* Say where the list came from. On the snapshot path the page is still
            correct, just older, and the visitor deserves to know. */}
        <p className="mt-12 flex items-center gap-2 text-xs text-fg-subtle">
          <Broadcast size={14} aria-hidden="true" />
          {source === "api"
            ? live
              ? "Dibaca langsung dari channel, disegarkan tiap lima menit selama ada yang live."
              : "Dibaca langsung dari channel, termasuk jam mulai tiap broadcast."
            : source === "loading"
              ? "Mengambil data terbaru."
              : "Menampilkan salinan tersimpan. Data langsung tidak tersedia."}
        </p>
      </div>
    </section>
  );
}

function BroadcastCard({
  item,
  fallbackIndex,
}: {
  item: Upload;
  fallbackIndex: number;
}) {
  // Thumbnails must track the video, so the live path addresses them by
  // videoId. The bundled files are only for the snapshot path, where the order
  // is fixed and known.
  const bundled = `/media/upload-${String(fallbackIndex + 1).padStart(2, "0")}.jpg`;
  const [src, setSrc] = useState(
    item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg` : bundled,
  );

  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block">
      {/* 16:9 frames keep the card radius. The arch is reserved for the square
          avatar, where it echoes a doorway. */}
      <div className="relative overflow-hidden rounded-card border border-line bg-surface">
        <img
          src={src}
          alt=""
          width={1280}
          height={720}
          loading="lazy"
          decoding="async"
          // maxresdefault only exists on HD uploads; hqdefault always does.
          onError={() => {
            if (src.endsWith("maxresdefault.jpg")) {
              setSrc(`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`);
            }
          }}
          className="aspect-video w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
        />
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

          {(item.startedAt || item.viewers !== null) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-subtle">
              {/* Every card carries its real broadcast start, read from
                  liveBroadcastDetails. The feed's publish time is hours late
                  and can fall on a different day, so it is never used here. */}
              {item.startedAt && (
                <span>
                  Mulai
                  {item.startedDay ? ` ${item.startedDay}` : ""}
                  {item.startedDate ? ` ${item.startedDate}` : ""}, {item.startedAt}
                </span>
              )}
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
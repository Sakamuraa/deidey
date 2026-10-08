import { Broadcast, FilmSlate, Scissors } from "@phosphor-icons/react";
import { useState } from "react";

import { ActionLink } from "@/components/Action";
import { Reveal, StaggerGroup, StaggerItem } from "@/lib/reveal";
import { ageLabel, useContent } from "@/lib/useContent";
import type { ContentItem } from "@/lib/useContent";

/**
 * The three content categories, and which one this page is showing.
 *
 * Streams come from the channel's /streams tab, videos from its /videos tab, and
 * clips from a search across the site for her name. None of those three surfaces
 * carries the others' content, which is why all three are read rather than one
 * list being filtered into three.
 *
 * They are routes rather than tabs because a tab cannot be linked to, and a
 * stream card has to point at one specific stream. `/konten` is the streams list
 * on its own; a stream card links to `/konten/streams?id=...`.
 */
type Category = "streams" | "videos" | "clips";

const CATEGORIES: Record<Category, {
  path: string;
  label: string;
  title: string;
  blurb: string;
  empty: string;
  icon: typeof Broadcast;
}> = {
  streams: {
    path: "/konten",
    label: "Streams",
    title: "Streams",
    blurb: "Broadcast utuh dari channel, terbaru lebih dulu. Klik salah satu untuk memutar.",
    empty: "Belum ada broadcast yang terbaca.",
    icon: Broadcast,
  },
  videos: {
    path: "/konten/video",
    label: "Video",
    title: "Video",
    blurb: "Upload non-broadcast: cover, roleplay, dan lagu orisinal.",
    empty: "Belum ada video yang terbaca.",
    icon: FilmSlate,
  },
  clips: {
    path: "/konten/clips",
    label: "Clips",
    title: "Clips",
    blurb: "Konten dari channel lain yang menyebut namanya, lewat judul atau deskripsi.",
    empty: "Belum ada klip yang menyebut namanya.",
    icon: Scissors,
  },
};

const ORDER: Category[] = ["streams", "videos", "clips"];

/**
 * One content category per path.
 *
 * These were tabs before, which put them in the same view. Tabs cannot be linked
 * to, and a stream card needs to point at one specific stream, so the categories
 * became routes. `/konten` is the streams list on its own; the other two keep
 * their own paths.
 */
export function Konten({ category = "streams" }: { category?: Category }) {
  const { streams, videos, clips, live, source } = useContent();

  const active = CATEGORIES[category];

  const items: Record<Category, ContentItem[]> = { streams, videos, clips };
  const list = items[category];

  return (
    // #konten belongs to <main>, which is what the skip link targets, so this
    // section takes its own id rather than duplicating it.
    <section id="isi-konten" aria-labelledby="konten-heading" className="py-24 md:py-32">
      <div className="shell">
        <Reveal amount={0.3}>
          {/* h1, not h2. The home page's h1 lives in the hero, which this route
              does not render, so this is the only page-level heading here. */}
          <h1
            id="konten-heading"
            className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
          >
            {active.title}
          </h1>
          <p className="mt-5 flex items-center gap-2.5 text-base leading-relaxed text-fg-muted md:text-lg">
            <active.icon size={20} aria-hidden="true" className="shrink-0 text-fg-subtle" />
            {active.blurb}
          </p>
        </Reveal>

        {/* Category switcher. Real links now, not buttons: each one is its own
            address, so it can be shared, bookmarked and crawled. */}
        <Reveal amount={0.2} delay={0.05}>
          <nav
            aria-label="Kategori konten"
            className="mt-12 flex flex-wrap items-center gap-2 border-b border-line pb-4"
          >
            {ORDER.map((key) => {
              const entry = CATEGORIES[key];
              const selected = key === category;
              const count = items[key].length;

              return (
                <a
                  key={key}
                  href={entry.path}
                  aria-current={selected ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-btn px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                    selected
                      ? "bg-cocoa text-bg"
                      : "text-fg-muted hover:bg-surface hover:text-fg"
                  }`}
                >
                  {entry.label}
                  <span
                    className={`font-mono text-xs ${selected ? "text-bg/70" : "text-fg-subtle"}`}
                  >
                    {count}
                  </span>
                </a>
              );
            })}
          </nav>
        </Reveal>

        <div className="mt-10">
          {list.length > 0 ? (
            <StaggerGroup
              key={category}
              className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3"
              stagger={0.04}
              amount={0.06}
            >
              {list.map((item) => (
                // min-w-0 so a long unbreakable token cannot stretch the track.
                // See the note on wrap-anywhere in TweetCard.
                <StaggerItem key={item.videoId} className="min-w-0">
                  <ContentCard item={item} category={category} />
                </StaggerItem>
              ))}
            </StaggerGroup>
          ) : (
            <p className="mt-8 max-w-[52ch] text-sm leading-relaxed text-fg-subtle">
              {active.empty}
              {source === "loading" ? " Sedang diambil." : ""}
            </p>
          )}

          <p className="mt-12 flex items-center gap-2 text-xs text-fg-subtle">
            <Broadcast size={14} aria-hidden="true" />
            {source === "api"
              ? live
                ? "Ada yang sedang live. Daftar disegarkan tiap lima menit selama itu berjalan."
                : "Dibaca langsung dari YouTube saat halaman dibuka."
              : source === "loading"
                ? "Mengambil data terbaru."
                : "Menampilkan salinan tersimpan. Data langsung tidak tersedia."}
          </p>

          {live && category !== "streams" ? (
            <div className="mt-8">
              <ActionLink href="/konten" variant="quiet" size="md">
                Lihat yang sedang live
              </ActionLink>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * One content card.
 *
 * A stream links to the player page on this site; the other categories go
 * straight out to YouTube. That split is the reason `/konten/streams?id=` exists:
 * a broadcast has a page worth landing on, while a cover video and a clip do
 * not.
 */
function ContentCard({ item, category }: { item: ContentItem; category: Category }) {
  const label = ageLabel(item);

  const href =
    category === "streams" ? `/konten/streams?id=${item.videoId}` : item.url;

  const external = category !== "streams";

  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group block"
    >
      <div className="relative overflow-hidden rounded-card border border-line bg-surface">
        <CardThumb item={item} />
        {item.live && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-pill bg-cocoa px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-bg">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-bg opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-bg" />
            </span>
            Live
          </span>
        )}
      </div>

      <p className="mt-3.5 font-display text-base font-medium leading-snug tracking-tight text-fg wrap-anywhere">
        {item.title}
      </p>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-fg-subtle">
        {item.channel && <span className="truncate">{item.channel}</span>}
        {item.channel && (label || item.duration) ? <span aria-hidden="true">·</span> : null}
        {item.duration && <span className="font-mono">{item.duration}</span>}
        {label && (
          <>
            {item.duration ? <span aria-hidden="true">·</span> : null}
            <span>{label}</span>
          </>
        )}
      </p>
    </a>
  );
}

/**
 * Thumbnail with a fallback chain.
 *
 * The endpoint's own image URL is preferred, then maxres, then hq. The search
 * surface serves a different image size than the channel tabs, so all three can
 * legitimately 404 and the chain matters.
 */
function CardThumb({ item }: { item: ContentItem }) {
  const [step, setStep] = useState(0);

  const sources = [
    item.thumbnail,
    `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
  ].filter(Boolean);

  const src = sources[Math.min(step, sources.length - 1)] ?? "";

  return (
    <img
      key={src}
      src={src}
      alt=""
      width={1280}
      height={720}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (step < sources.length - 1) setStep(step + 1);
      }}
      className="aspect-video w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
    />
  );
}
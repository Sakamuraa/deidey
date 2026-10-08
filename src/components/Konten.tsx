import { Broadcast, FilmSlate, Scissors } from "@phosphor-icons/react";
import { useState } from "react";

import { ActionLink } from "@/components/Action";
import { Reveal, StaggerGroup, StaggerItem } from "@/lib/reveal";
import { ageLabel, useContent } from "@/lib/useContent";
import type { ContentItem } from "@/lib/useContent";

/**
 * The three content categories.
 *
 * Streams come from the channel's /streams tab, videos from its /videos tab, and
 * clips from a search across the site for her name. None of those three surfaces
 * carries the others' content, which is why all three are read rather than one
 * list being filtered into three.
 */
type TabKey = "streams" | "videos" | "clips";

const TABS: Array<{
  key: TabKey;
  label: string;
  title: string;
  blurb: string;
  empty: string;
  icon: typeof Broadcast;
}> = [
  {
    key: "streams",
    label: "Streams",
    title: "Streams",
    blurb: "Broadcast utuh dari channel, terbaru lebih dulu.",
    empty: "Belum ada broadcast yang terbaca.",
    icon: Broadcast,
  },
  {
    key: "videos",
    label: "Video",
    title: "Video",
    blurb: "Upload non-broadcast: cover, roleplay, dan lagu orisinal.",
    empty: "Belum ada video yang terbaca.",
    icon: FilmSlate,
  },
  {
    key: "clips",
    label: "Clips",
    title: "Clips",
    blurb: "Konten dari channel lain yang menyebut namanya, lewat judul atau deskripsi.",
    empty: "Belum ada klip yang menyebut namanya.",
    icon: Scissors,
  },
];

/**
 * Content index, one tab per category.
 *
 * Tabs are real buttons in a tablist rather than three links, so arrow keys and
 * screen readers treat this as the single control it is. The panel swaps in place
 * instead of navigating, which is why the tab state lives here and not in the
 * URL: there is one page, three views of it.
 */
export function Konten() {
  const { streams, videos, clips, live, source } = useContent();
  const [tab, setTab] = useState<TabKey>("streams");

  const active = TABS.find((entry) => entry.key === tab) ?? TABS[0];
  const Icon = active.icon;

  const items: Record<TabKey, ContentItem[]> = { streams, videos, clips };
  const list = items[active.key];

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
            Konten
          </h1>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-fg-muted md:text-lg">
            Tiga kategori, semuanya dibaca dari channel dan dari pencarian YouTube
            saat halaman dibuka.
          </p>
        </Reveal>

        {/* Tabs. aria-controls points at the one panel that exists, so the
            relationship is announced without three dead targets. */}
        <Reveal amount={0.2} delay={0.05}>
          <div
            role="tablist"
            aria-label="Kategori konten"
            className="mt-12 flex flex-wrap items-center gap-2 border-b border-line pb-4"
          >
            {TABS.map((entry) => {
              const selected = entry.key === tab;
              const count = items[entry.key].length;

              return (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  id={`tab-${entry.key}`}
                  aria-selected={selected}
                  aria-controls="konten-panel"
                  // Roving tab index: only the selected tab is in the tab order,
                  // which is what lets arrow keys move between them instead of
                  // Tab visiting all three.
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(entry.key)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                    event.preventDefault();

                    const step = event.key === "ArrowRight" ? 1 : -1;
                    const next = TABS[(TABS.indexOf(entry) + step + TABS.length) % TABS.length];
                    setTab(next.key);
                    document.getElementById(`tab-${next.key}`)?.focus();
                  }}
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
                </button>
              );
            })}
          </div>
        </Reveal>

        <div
          role="tabpanel"
          id="konten-panel"
          aria-labelledby={`tab-${active.key}`}
          tabIndex={0}
          className="mt-10 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <Reveal amount={0.2}>
            <div className="flex items-center gap-2.5">
              <Icon size={20} aria-hidden="true" className="text-fg-muted" />
              <h3 className="font-display text-xl font-semibold tracking-tight">{active.title}</h3>
            </div>
            <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-fg-muted">
              {active.blurb}
            </p>
          </Reveal>

          {list.length > 0 ? (
            <StaggerGroup
              key={active.key}
              className="mt-8 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3"
              stagger={0.04}
              amount={0.06}
            >
              {list.map((item) => (
                <StaggerItem key={item.videoId}>
                  <ContentCard item={item} />
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

          {live && tab !== "streams" ? (
            <div className="mt-8">
<ActionLink href="/#klip" variant="quiet" size="md">
              Lihat yang sedang live
            </ActionLink>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ContentCard({ item }: { item: ContentItem }) {
  const label = ageLabel(item);

  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block">
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

      <p className="mt-3.5 font-display text-base font-medium leading-snug tracking-tight text-fg">
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
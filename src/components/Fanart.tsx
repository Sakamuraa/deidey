import { ArrowSquareOut, Image as ImageIcon, Spinner } from "@phosphor-icons/react";

import { ActionLink } from "@/components/Action";
import { Reveal, StaggerGroup, StaggerItem } from "@/lib/reveal";
import { useFanart } from "@/lib/useFanart";
import type { Fanart } from "@/lib/useFanart";

/**
 * Fan art.
 *
 * Every post here was made by somebody else, so the page leads with who drew it and
 * links straight back to the original. The artwork is the creator's work and the
 * artist's; this page is an index of links, not a gallery to download from.
 *
 * Images are served from Twitter's own host rather than through the instance that
 * read the feed, because a proxy dies with the instance and the art outlives it.
 */
export function Fanart() {
  const { fanart, reason, searchUrl } = useFanart();

  return (
    <section id="isi-fanart" aria-labelledby="fanart-heading" className="pt-24 pb-24 md:pt-32 md:pb-32">
      <div className="shell">
        <Reveal amount={0.3}>
          <p className="text-sm font-medium text-accent">Karya dari orang lain</p>
          <h1
            id="fanart-heading"
            className="mt-4 text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
          >
            Fan Art
          </h1>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-fg-muted md:text-lg">
            Ilustrasi yang orang buat buat Mizu, diambil dari/posts bertanda{" "}
            <span className="font-mono text-fg">#ForMizu</span> di X.
          </p>
        </Reveal>

        {fanart.length > 0 ? (
          <StaggerGroup
            className="mt-14 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3"
            stagger={0.04}
            amount={0.02}
          >
            {fanart.map((item) => (
              <StaggerItem key={item.id} className="min-w-0">
                <FanartCard item={item} />
              </StaggerItem>
            ))}
          </StaggerGroup>
        ) : reason === "loading" ? (
          <p className="mt-14 flex items-center gap-2.5 text-sm text-fg-muted">
            <Spinner size={18} aria-hidden="true" className="animate-spin" />
            Mencari fan art…
          </p>
        ) : (
          <div className="mt-14 max-w-[52ch]">
            <p className="flex items-center gap-2.5 text-sm leading-relaxed text-fg-muted">
              <ImageIcon size={20} aria-hidden="true" className="text-fg-subtle" />
              Fan art belum bisa dibaca dari server untuk sekarang.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
              Buka pencarannya langsung di X.
            </p>
            <div className="mt-6">
              <ActionLink href={searchUrl} external variant="quiet">
                Buka pencarian #ForMizu
                <ArrowSquareOut size={16} aria-hidden="true" />
              </ActionLink>
            </div>
          </div>
        )}

        <Reveal amount={0.2} delay={0.05}>
          <p className="mt-14 text-xs leading-relaxed text-fg-subtle">
            Setiap karya milik kreatornya. Buka{" "}
            <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-fg">
              post aslinya
            </a>{" "}
            untuk lihat kredit dan konteksnya.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * One piece.
 *
 * The image is the only thing that goes to the caption's link, and it is labelled
 * with the artist's handle rather than left as an unlabelled picture: the person
 * who drew it is the most useful thing on the card.
 */
function FanartCard({ item }: { item: Fanart }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden bg-surface-deep"
      >
        <img
          src={item.image}
          alt={`Ilustrasi fan art oleh ${item.author}`}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
        />
      </a>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-fg-subtle">
          <span className="font-semibold text-fg">{item.author}</span>
          {item.postedLabel && <span className="font-mono">{item.postedLabel}</span>}
        </p>

        {item.caption && (
          <p className="mt-2 wrap-anywhere text-sm leading-relaxed text-fg-muted">{item.caption}</p>
        )}

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs text-fg-subtle transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <span>Buka di X</span>
          <ArrowSquareOut size={13} aria-hidden="true" />
          <span className="sr-only">— karya {item.author}</span>
        </a>
      </div>
    </article>
  );
}
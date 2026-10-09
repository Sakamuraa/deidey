import { CalendarBlank, Clock } from "@phosphor-icons/react";

import { ActionLink } from "@/components/Action";
import { Thumb } from "@/components/Uploads";
import { Reveal } from "@/lib/reveal";
import type { ContentItem } from "@/lib/useContent";

/**
 * The next stream.
 *
 * Kept apart from the broadcast cards on purpose. A live card says "now" and a
 * finished one says "then"; this says "not yet", and rendering it as one more
 * tile in the same grid would blur exactly the distinction it exists to make.
 *
 * No countdown. The /streams grid carries a scheduled item but not its start time
 * in anything this endpoint reads, so a ticking clock would have to be built from
 * a number that is not there. The honest thing is to link to the stream, where
 * YouTube shows the real time.
 *
 * Two colour decisions worth stating, both of which were wrong first:
 *
 * The wash over the thumbnail is a fixed ink, not `--cocoa` or `--fg`. Both of
 * those flip between themes here -- `--cocoa` is near-black in the light theme
 * and near-white in the dark one -- so a wash built on either lightens the image
 * in one theme and darkens it in the other. An overlay's only job is to darken.
 *
 * The badge is `--glow` on a literal dark ink rather than on a token, because
 * `--glow` is the one accent that does not change between themes: whatever sits
 * on it has to stay legible in both.
 */
export function UpcomingCard({ item }: { item: ContentItem | null }) {
  if (!item) return null;

  return (
    <Reveal amount={0.25}>
      <article
        aria-labelledby="upcoming-heading"
        className="mt-10 overflow-hidden rounded-card border border-glow/45 bg-surface"
      >
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="w-full shrink-0 sm:w-56">
            <div className="relative overflow-hidden rounded-btn">
              <Thumb item={item} />
              {/*
                Dimming rather than hiding. The thumbnail is the reason to click,
                so it stays; the wash plus the badge is what stops it reading as a
                stream that is already running.
              */}
              <div aria-hidden="true" className="absolute inset-0 bg-[#0b1424]/55" />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-btn bg-glow px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#14203a]">
                <CalendarBlank size={13} weight="fill" aria-hidden="true" />
                Mendatang
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h3
              id="upcoming-heading"
              className="text-lg font-semibold leading-snug text-fg sm:text-xl"
            >
              {item.title}
            </h3>

            <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
              <Clock size={15} aria-hidden="true" className="text-glow" />
              <>Stream berikutnya sudah dijadwalkan.</>
            </p>

            <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
              "Waktu mulainya ada di halaman stream-nya."
            </p>

            <div className="mt-5">
              <ActionLink href={item.url} external variant="quiet">
                Buka di YouTube
              </ActionLink>
            </div>
          </div>
        </div>
      </article>
    </Reveal>
  );
}
import { ArrowUpRight } from "@phosphor-icons/react";

import { channels } from "@/content/site";
import { Reveal } from "@/lib/reveal";

/**
 * Channel links as a full-bleed peach band. Layout family: one wide statement
 * row per channel, not cards. Kept separate from the upload grid above so the
 * page does not repeat a card layout twice in a row.
 */
const ROWS = [
  {
    key: "youtube",
    label: channels.youtube.label,
    handle: channels.youtube.handle,
    note: channels.youtube.note,
    url: channels.youtube.url,
  },
  {
    key: "x",
    label: channels.x.label,
    handle: channels.x.handle,
    note: channels.x.note,
    url: channels.x.url,
  },
  {
    key: "trakteer",
    label: channels.trakteer.label,
    handle: channels.trakteer.handle,
    note: channels.trakteer.note,
    url: channels.trakteer.url,
  },
];

/**
 * Channel links.
 *
 * `standalone` promotes the heading to an h1 and pads the top, for when this is
 * the whole page rather than the closing block of the home page. Two headings
 * on one page is the thing this flag exists to prevent.
 */
export function Channels({ standalone = false }: { standalone?: boolean } = {}) {
  const Heading = standalone ? "h1" : "h2";

  return (
    <section
      id={standalone ? "isi-channel" : "channel"}
      aria-labelledby="channels-heading"
      // See the note in Profile: pt- swaps the top gap only. The bottom gap has
      // to stay, or the last channel row touches the footer.
      className={standalone ? "pb-24 pt-24 md:pb-32 md:pt-32" : "py-24 md:py-32"}
    >
      <div className="shell">
        <Reveal amount={0.3}>
          <Heading
            id="channels-heading"
            className="max-w-[18ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
          >
            Di mana Mizu bisa ditemukan
          </Heading>
        </Reveal>

        <Reveal delay={0.06} amount={0.2}>
          <ul className="mt-12 border-t border-line">
            {ROWS.map((row) => (
              <li key={row.key} className="border-b border-line">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group grid items-baseline gap-x-8 gap-y-1 py-7 transition-colors duration-200 hover:bg-surface sm:grid-cols-[11rem_1fr_auto]"
                >
                  <span className="font-display text-xl font-semibold tracking-tight text-fg">
                    {row.label}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-sm text-fg-muted">{row.handle}</span>
                    <span className="mt-1 block text-sm text-fg-subtle">{row.note}</span>
                  </span>
                  <ArrowUpRight
                    size={22}
                    aria-hidden="true"
                    className="shrink-0 self-center text-fg-subtle transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg"
                  />
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
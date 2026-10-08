import {
  ArrowBendUpLeft,
  ArrowSquareOut,
  ChatCircle,
  Eye,
  Heart,
} from "@phosphor-icons/react";

import { ActionLink } from "@/components/Action";
import { channels } from "@/content/site";
import { Reveal, StaggerGroup, StaggerItem } from "@/lib/reveal";
import { useTweets } from "@/lib/useTweets";
import type { Tweet } from "@/lib/useTweets";

/**
 * Recent posts, newest first.
 *
 * The card is built from the site's own shapes rather than X's: a peach left
 * rule, the display face for the text, and the same border and radius tokens as
 * every other panel. Embedding X's own widget would drag in their styling and
 * their cookie banner, and would render a login wall for anyone not signed in.
 *
 * On the data: X offers no anonymous timeline. Everything tried is written up in
 * the README, and the honest outcome is that this page shows a committed copy
 * rather than live data. It says so under the grid instead of implying otherwise.
 */
export function Tweets() {
  const { tweets, note } = useTweets();

  return (
    <section id="tweets" aria-labelledby="tweets-heading" className="py-24 md:py-32">
      <div className="shell">
        <Reveal amount={0.3}>
          {/* h1, since the hero that carries the other h1 is not on this route. */}
          <h1
            id="tweets-heading"
            className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
          >
            Tweets
          </h1>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-fg-muted md:text-lg">
            Postingan terbaru dari {channels.x.handle}, terbaru lebih dulu.
          </p>
        </Reveal>

        {tweets.length > 0 ? (
          <StaggerGroup
            className="mt-14 grid gap-5 lg:grid-cols-2"
            stagger={0.04}
            amount={0.06}
          >
            {tweets.map((tweet) => (
              <StaggerItem key={tweet.id}>
                <TweetCard tweet={tweet} />
              </StaggerItem>
            ))}
          </StaggerGroup>
        ) : (
          <Reveal amount={0.2} delay={0.05}>
            <div className="mt-14 max-w-[56ch] rounded-card border border-line bg-surface p-8">
              <p className="text-base leading-relaxed text-fg-muted">
                X menutup pembacaan timeline tanpa login. Halaman profilnya masih
                bisa dibuka, tapi tidak memuat isi tweet di dalam HTML-nya, jadi
                tidak ada yang bisa diambil dari server.
              </p>
              <div className="mt-6">
                <ActionLink href={channels.x.url} external variant="quiet">
                  Buka {channels.x.handle} di X
                  <ArrowSquareOut size={16} aria-hidden="true" />
                </ActionLink>
              </div>
            </div>
          </Reveal>
        )}

        <p className="mt-12 text-xs text-fg-subtle">{note}</p>
      </div>
    </section>
  );
}

/** Compact count, in Indonesian units so "1.200" never becomes "1,200". */
function compact(value: number | null): string | null {
  if (value === null) return null;
  if (value < 1000) return String(value);

  const units: Array<[number, string]> = [
    [1_000_000_000, " M"],
    [1_000_000, " jt"],
    [1000, " rb"],
  ];

  for (const [size, suffix] of units) {
    if (value >= size) {
      const scaled = value / size;
      // One decimal, then trimmed, so 1.200 shows as "1,2 rb" not "1,20 rb".
      return `${scaled.toFixed(1).replace(/\.0$/, "").replace(".", ",")}${suffix}`;
    }
  }
  return String(value);
}

/** A date in Indonesian, short form, e.g. "8 Okt 2026". */
function formatDate(iso: string | null): string {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function TweetCard({ tweet }: { tweet: Tweet }) {
  const stats: Array<[string, number | null]> = [
    ["balasan", tweet.replies],
    ["retweet", tweet.retweets],
    ["suka", tweet.likes],
  ];

  const icon: Record<string, typeof Heart> = {
    balasan: ChatCircle,
    retweet: ArrowBendUpLeft,
    suka: Heart,
  };

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface">
      {/* Peach left rule. The one decorative touch, matching the pull-quote's
          treatment so the two read as the same family. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-peach" />

      <div className="flex items-center gap-2 px-6 pb-3 pt-5 text-xs text-fg-subtle">
        <span className="font-mono">{channels.x.handle}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={tweet.postedAt ?? undefined}>{formatDate(tweet.postedAt)}</time>
      </div>

      <a
        href={tweet.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group/card px-6 pb-5 focus-visible:outline-2 focus-visible:outline-offset-[-4px]"
      >
        <p className="whitespace-pre-wrap break-words font-display text-[1.0625rem] leading-relaxed text-fg">
          {tweet.text}
        </p>
      </a>

      {tweet.image && (
        <a href={tweet.url} target="_blank" rel="noopener noreferrer" className="block px-6">
          <img
            src={tweet.image}
            alt=""
            width={1200}
            height={675}
            loading="lazy"
            decoding="async"
            className="w-full rounded-btn border border-line object-cover"
          />
        </a>
      )}

      <div className="mt-auto flex items-center gap-5 px-6 pb-5 pt-4 text-xs text-fg-subtle">
        {stats.map(([label, value]) => {
          const shown = compact(value);
          if (shown === null) return null;

          const Icon = icon[label];
          return (
            <span key={label} className="inline-flex items-center gap-1.5">
              <Icon size={14} aria-hidden="true" />
              {shown}
              <span className="sr-only">{label}</span>
            </span>
          );
        })}

        {compact(tweet.views) && (
          <span className="inline-flex items-center gap-1.5">
            <Eye size={14} aria-hidden="true" />
            {compact(tweet.views)}
            <span className="sr-only">dilihat</span>
          </span>
        )}

        <ArrowSquareOut
          size={14}
          aria-hidden="true"
          className="ml-auto transition-transform duration-200 group-hover/card:-translate-y-0.5 group-hover/card:translate-x-0.5"
        />
      </div>
    </article>
  );
}
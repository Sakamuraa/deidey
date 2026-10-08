import { useState } from "react";

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
            // items-start so each card is only as tall as its own content. The
            // default stretch is what made a text-only post sit inside a tall
            // empty box next to a post carrying a 16:9 image.
            className="mt-14 grid items-start gap-5 lg:grid-cols-2"
            stagger={0.04}
            amount={0.06}
          >
            {tweets.map((tweet) => (
              <StaggerItem key={tweet.id} className="min-w-0">
                <TweetCard tweet={tweet} />
              </StaggerItem>
            ))}
          </StaggerGroup>
        ) : (
          <Reveal amount={0.2} delay={0.05}>
            <div className="mt-14 max-w-[56ch] rounded-card border border-line bg-surface p-8">
              <p className="text-base leading-relaxed text-fg-muted">
                Feed publiknya sedang tidak terbaca dari server, jadi belum ada
                yang bisa ditampilkan. Halaman profilnya tetap bisa dibuka di X.
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

/**
 * Attached media.
 *
 * Nitter proxies images through whichever instance served the feed, so the URL
 * stops working when that instance does. A failed load therefore hides the
 * element instead of leaving an empty bordered gap, which is also why the image
 * carries its own alt-free wrapper rather than a fixed height.
 */
function TweetImage({ tweet }: { tweet: Tweet }) {
  const [failed, setFailed] = useState(false);
  if (failed || !tweet.image) return null;

  return (
    <a href={tweet.url} target="_blank" rel="noopener noreferrer" className="block px-6">
      <img
        src={tweet.image}
        alt=""
        width={1200}
        height={675}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="w-full rounded-btn border border-line object-cover"
      />
    </a>
  );
}

/**
 * URLs inside a post.
 *
 * Defined here rather than imported from api/tweets.ts, because the client
 * bundle must not pull in the serverless module.
 */
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/**
 * Post text with its URLs turned into links.
 *
 * A URL inside a post is printed inert otherwise: it looks like the thing to
 * click and does nothing. Each one opens in a new tab, and the full address is
 * kept rather than shortened, because a truncated URL cannot be verified by
 * reading it.
 *
 * Nested anchors are avoided by the surrounding link being dropped: the body is
 * no longer wrapped in one, so a URL inside it can be a real link.
 */
function TweetBody({ text }: { text: string }) {
  // Split with the URL group captured, which makes the odd indexes URLs by
  // construction. Testing each part against a global regex instead would be
  // stateful: lastIndex survives between calls and the answer flips on every
  // other one.
  const parts = text.split(URL_PATTERN);

  if (parts.length === 1) return <>{text}</>;

  // Trailing punctuation is almost never part of the address, and keeping it
  // inside the href would send the visitor to a URL with a full stop on the end.
  const TRAILING = /[.,;:!?)\]}'"]+$/;

  return (
    <>
      {parts.map((part, index) => {
        if (part === "") return null;
        if (index % 2 === 0) return <span key={index}>{part}</span>;

        const suffix = part.match(TRAILING)?.[0] ?? "";
        const href = suffix ? part.slice(0, -suffix.length) : part;

        return (
          <span key={index}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-line-strong decoration-1 underline-offset-[3px] transition-colors hover:text-fg hover:decoration-peach focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {part}
            </a>
          </span>
        );
      })}
    </>
  );
}

function TweetCard({ tweet }: { tweet: Tweet }) {
  // Every count is null from this feed, so this list is empty and the whole row
  // hides. The code stays because an X API key would populate it, and a null
  // read is the honest way to say "not measured" rather than a hardcoded 0.
  const stats: Array<[string, number | null]> = [
    ["balasan", tweet.replies],
    ["retweet", tweet.retweets],
    ["suka", tweet.likes],
    ["dilihat", tweet.views],
  ];

  const icon: Record<string, typeof Heart> = {
    balasan: ChatCircle,
    retweet: ArrowBendUpLeft,
    suka: Heart,
    dilihat: Eye,
  };

  const visible = stats.filter(([, value]) => value !== null);

  return (
    // No h-full. Cards size to their own content, so a post with no image does
    // not get stretched to match one that has a 16:9 image under it.
    <article className="relative flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      {/* Peach left rule. The one decorative touch, matching the pull-quote's
          treatment so the two read as the same family. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-peach" />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-6 pb-3 pt-5 text-xs text-fg-subtle">
        <span className="font-mono">{channels.x.handle}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={tweet.postedAt ?? undefined}>
          {/* The API formats this in WIB, so the clock is local to the channel
              rather than UTC. The dateTime attribute keeps the true instant for
              anything reading the markup. */}
          {tweet.postedLabel ?? formatDate(tweet.postedAt)}
        </time>
      </div>

      {/* Not wrapped in an anchor. A link inside a link is invalid HTML and the
          inner one is what browsers actually follow, so the body needs to be
          plain text with its own links for the URLs to work. */}
      <div className="px-6 pb-5">
        {/* wrap-anywhere, not break-words. overflow-wrap: break-word only breaks once a
          line is already overflowing, so it does not shrink the element's
          min-content width, and a bare YouTube URL is one unbroken token. In a
          grid that makes the track wider than the viewport: 38px of horizontal
          scroll at 390px before this change. anywhere affects intrinsic sizing,
          so the track can shrink. */}
        <p className="whitespace-pre-wrap wrap-anywhere font-display text-[1.0625rem] leading-relaxed text-fg">
          <TweetBody text={tweet.text} />
        </p>
      </div>

      {tweet.image && <TweetImage tweet={tweet} />}

      {/* Permalink, always visible so there is a route to the post even when the
          body carries no link of its own. */}
      <div className="flex items-center px-6 pb-5 pt-4 text-xs text-fg-subtle">
        <a
          href={tweet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <span className="font-mono">{tweet.id}</span>
          <ArrowSquareOut size={14} aria-hidden="true" />
          <span className="sr-only">Buka postingan ini di X</span>
        </a>
      </div>

      {/* Footer row. mt-auto is gone along with h-full: with cards no longer
          stretched, there is no free space to push it down. */}
      {(visible.length > 0 || tweet.isRetweet) && (
        <div className="flex items-center gap-5 px-6 pb-5 pt-4 text-xs text-fg-subtle">
          {visible.map(([label, value]) => {
            const Icon = icon[label];
            return (
              <span key={label} className="inline-flex items-center gap-1.5">
                <Icon size={14} aria-hidden="true" />
                {compact(value)}
                <span className="sr-only">{label}</span>
              </span>
            );
          })}

          {tweet.isRetweet && (
            <span className="inline-flex items-center gap-1.5">
              <ArrowBendUpLeft size={14} aria-hidden="true" />
              Retweet
            </span>
          )}

          <ArrowSquareOut
            size={14}
            aria-hidden="true"
            className="ml-auto transition-transform duration-200 group-hover/card:-translate-y-0.5 group-hover/card:translate-x-0.5"
          />
        </div>
      )}
    </article>
  );
}
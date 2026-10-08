import { motion, useReducedMotion } from "motion/react";

import { ActionLink } from "@/components/Action";
import { XMark, YoutubeMark } from "@/components/ChannelIcons";
import { channels, site } from "@/content/site";
import { asset } from "@/lib/paths";
import { EASE_OUT_EXPO } from "@/lib/reveal-motion";

/**
 * Asymmetric split hero: type left, the real channel avatar in an arch frame
 * right. The arch is the shape the rest of the page borrows from.
 *
 * Height is `min-h-[calc(100dvh-4rem)]`, never `h-screen`, so a collapsing
 * mobile address bar cannot clip the CTAs. Four text elements total: eyebrow,
 * name, one line of bio, CTA row.
 */
export function Hero() {
  const reduceMotion = useReducedMotion();

  const enter = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: EASE_OUT_EXPO },
        };

  return (
    <section id="atas" className="relative isolate overflow-hidden" aria-labelledby="hero-name">
      <div aria-hidden="true" className="dawn-wash absolute inset-0 -z-10" />

      <div className="shell grid min-h-[calc(100dvh-4rem)] items-center gap-12 py-14 md:grid-cols-12 md:gap-10 md:py-20">
        <div className="md:col-span-7">
          <motion.p {...enter(0.04)} className="text-sm font-medium text-accent">
            {site.channelTitle}
          </motion.p>

          <motion.h1
            {...enter(0.1)}
            id="hero-name"
            className="mt-4 text-[clamp(2.6rem,7.5vw,5rem)] font-semibold leading-[1.02] tracking-tight"
          >
            {site.name}
          </motion.h1>

          <motion.p {...enter(0.18)} className="mt-6 max-w-[44ch] text-lg leading-relaxed text-fg-muted">
            {site.bio}
          </motion.p>

          <motion.div {...enter(0.26)} className="mt-9 flex flex-wrap items-center gap-3">
            <ActionLink href={channels.youtube.url} external size="lg">
              <YoutubeMark size={18} />
              Tonton di YouTube
            </ActionLink>
            <ActionLink href={channels.x.url} external variant="quiet" size="lg">
              <XMark size={18} />
              Ikuti di X
            </ActionLink>
          </motion.div>
        </div>

        <motion.figure {...enter(0.22)} className="md:col-span-5">
          <div
            className="overflow-hidden rounded-arch border border-line-strong bg-surface-deep"
            style={{
              boxShadow:
                "0 24px 60px -28px color-mix(in oklab, var(--milk) 60%, transparent)",
            }}
          >
            <img
              src={asset(site.avatar)}
              alt={site.avatarAlt}
              width={800}
              height={800}
              // Above the fold and the largest paint: fetch it early, decode it
              // eagerly, and keep the square ratio reserved so CLS stays at 0.
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="aspect-square w-full object-cover"
            />
          </div>
          <figcaption className="mt-4 text-sm text-fg-subtle">
            Fan art dari channel. Gambar milik kreator.
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
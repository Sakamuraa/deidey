import { Play } from "@phosphor-icons/react";

import { uploads } from "@/content/site";
import { asset } from "@/lib/paths";
import { Reveal, StaggerGroup, StaggerItem } from "@/lib/reveal";

/**
 * Latest uploads, straight from the RSS feed. Layout family is deliberately
 * different from the profile grid above it: an offset two-column flow where
 * every other card drops down, rather than a uniform row.
 *
 * Thumbnails are real files downloaded from i.ytimg.com, so there is nothing
 * to swap before publishing. Aspect ratio is reserved per card to keep CLS at 0.
 */
export function Uploads() {
  return (
    <section id="klip" aria-labelledby="uploads-heading" className="py-24 md:py-32">
      <div className="shell">
        <Reveal amount={0.3}>
          <h2 id="uploads-heading" className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Yang baru keluar
          </h2>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-fg-muted md:text-lg">
            Delapan upload terakhir dari kanal. Judul, hari, dan jam mengikuti
            penanda waktu di feed aslinya.
          </p>
        </Reveal>

        <StaggerGroup
          className="mt-14 grid gap-x-6 gap-y-10 sm:grid-cols-2"
          stagger={0.05}
          amount={0.08}
        >
          {uploads.items.map((item, index) => (
            <StaggerItem
              key={item.url}
              // Offset every second column on desktop so the pair reads as a
              // staggered flow. Collapses to a flat single column on mobile.
              className={index % 2 === 1 ? "sm:mt-16" : ""}
            >
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                {/* 16:9 thumbnails keep the card radius. The arch is reserved
                    for the square avatar, where it echoes a doorway. */}
                <div className="overflow-hidden rounded-card border border-line bg-surface">
                  <img
                    src={asset(item.file)}
                    alt=""
                    width={1280}
                    height={720}
                    loading="lazy"
                    decoding="async"
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
                    <span className="block font-display text-lg font-medium leading-snug tracking-tight text-fg">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-sm text-fg-subtle">
                      {item.day}, {item.time}
                    </span>
                  </span>
                </div>
              </a>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
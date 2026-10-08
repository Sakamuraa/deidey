import { CrownSimple, Palette, PersonSimple } from "@phosphor-icons/react";

import { hashtags, series, site } from "@/content/site";
import { Reveal, StaggerGroup, StaggerItem } from "@/lib/reveal";

/**
 * Profile section, two blocks.
 *
 * Block one: editorial pull-quote plus a hairline fact strip. Deliberately a
 * different composition from the hero's split, so the page does not repeat the
 * same layout twice in a row.
 *
* Block two: credits and series as two parallel definition lists, which is a
  * third family again.
  *
  * Copy provenance: the heading and the blockquote are the creator's own
  * words, taken verbatim from her X bio and her YouTube channel description.
  * Nothing in this section is written in her voice or claims anything about
  * her preferences.
  */
/**
 * Profile.
 *
 * `detail` promotes the heading to an h1 and leads with the long-form page
 * treatment, for when this is the whole route. On the home page it is a section
 * and the hero already owns the h1.
 *
 * The detail variant adds what the section could not fit: the quote gets its own
 * block with the sentence it came from named, and the hashtag list explains each
 * tag's use rather than leaving it as two bare words.
 */
export function Profile({ detail = false }: { detail?: boolean } = {}) {
  const Heading = detail ? "h1" : "h2";

  return (
    <section
      id={detail ? "isi-tentang" : "tentang"}
      aria-labelledby="profile-heading"
      // The standalone variant swaps the section's py- for pt- so the top gap
      // matches the sticky nav instead of doubling up. It must keep a bottom
      // gap: without one the last list butts straight into the footer, which is
      // what the detail page looked like before this.
      className={detail ? "pb-24 pt-24 md:pb-32 md:pt-32" : "py-24 md:py-32"}
    >
      <div className="shell">
        {detail && (
          <Reveal amount={0.3}>
            <p className="text-sm font-medium text-accent">{site.channelTitle}</p>
            <Heading
              id="profile-heading"
              className="mt-4 text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
            >
              Tentang Mizu
            </Heading>
            <p className="mt-5 max-w-[58ch] text-base leading-relaxed text-fg-muted md:text-lg">
              Halaman ini mengumpulkan apa yang tertulis tentang dirinya, dan
              tidak lebih dari itu.
            </p>
          </Reveal>
        )}

        <div className={`grid gap-14 md:grid-cols-12 md:gap-12 ${detail ? "mt-16" : ""}`}>
          <Reveal className="md:col-span-5" amount={0.3}>
            {/* Verbatim from the X bio: "Hamster Princess". A subheading here
                because the h1 above already exists on the detail route. */}
            {detail ? (
              <h2 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
                Hamster Princess
              </h2>
            ) : (
              <h2
                id="profile-heading"
                className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
              >
                Hamster Princess
              </h2>
            )}

            <figure className="mt-8 border-l-2 border-peach pl-5">
              <CrownSimple size={22} className="text-milk" aria-hidden="true" />
              <blockquote className="mt-3 font-display text-xl leading-relaxed">
                Kenalin aku Mizu, salah satu putri dari kerajaan hamzazu!
              </blockquote>
              <figcaption className="mt-3 text-sm text-fg-subtle">
                Dari deskripsi channel YouTube, ditulis sendiri olehnya.
              </figcaption>
            </figure>

            {/* Only on the full page: what each hashtag is for, spelled out.
                The section version has room for the pairs but not the reasons. */}
            {detail && (
              <dl className="mt-10">
                {hashtags.map((tag) => (
                  <div
                    key={tag.tag}
                    className="flex items-baseline justify-between gap-4 border-b border-line py-3"
                  >
                    <dt className="font-medium text-fg">{tag.tag}</dt>
                    <dd className="shrink-0 text-sm text-fg-subtle">{tag.use}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Reveal>

          <Reveal className="md:col-span-6 md:col-start-7" delay={0.08} amount={0.3}>
            {/* Facts only. No description of her appearance and no guesses
                about what she likes: neither is something a source states. */}
            <p className="max-w-[54ch] text-base leading-relaxed text-fg-muted md:text-lg">
              Bio resminya menyebut ID/EN VTuber dengan model Live 2D.
              Delapan upload terakhir di feed berjarak enam hari, dua di
              antaranya dari seri Until Then.
            </p>

            <StaggerGroup className="mt-10 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
              <StaggerItem className="bg-surface p-5">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-fg-subtle">
                  Bahasa
                </p>
                <p className="mt-2 text-sm leading-snug text-fg">Indonesia dan Inggris</p>
              </StaggerItem>
              <StaggerItem className="bg-surface p-5">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-fg-subtle">
                  Format
                </p>
                <p className="mt-2 text-sm leading-snug text-fg">Live 2D</p>
              </StaggerItem>
              <StaggerItem className="bg-surface p-5">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-fg-subtle">
                  Channel
                </p>
                <p className="mt-2 text-sm leading-snug text-fg">{site.joined}</p>
              </StaggerItem>
            </StaggerGroup>

            <ul className="mt-8 flex flex-wrap gap-2">
              {hashtags.map((tag) => (
                <li
                  key={tag.tag}
                  className="inline-flex items-center gap-2 rounded-pill border border-line-strong px-3 py-1.5 text-sm text-fg-muted"
                >
                  <span className="font-medium text-fg">{tag.tag}</span>
                  <span className="text-fg-subtle">{tag.use}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal className="mt-24 md:mt-28" amount={0.2}>
          <div className="grid gap-14 md:grid-cols-12 md:gap-12">
            <div className="md:col-span-5">
              <h3 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
                <PersonSimple size={22} className="text-milk" aria-hidden="true" />
                Credit karakter
              </h3>
              <dl className="mt-6">
                {site.credits.map((credit) => (
                  <div
                    key={credit.role}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-4"
                  >
                    <dt className="text-sm text-fg-muted">{credit.role}</dt>
                    <dd className="font-medium text-fg">{credit.name}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="md:col-span-6 md:col-start-7">
              <h3 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
                <Palette size={22} className="text-milk" aria-hidden="true" />
                Seri yang dijalankan
              </h3>
              {/* Single column on every width. Two columns overflowed the shell
                  at md because the longest series name plus its kind label did
                  not fit in half a row. */}
              <ul className="mt-6">
                {series.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-baseline justify-between gap-4 border-b border-line py-3"
                  >
                    <span className="text-fg">{item.name}</span>
                    <span className="shrink-0 text-sm text-fg-subtle">{item.kind}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
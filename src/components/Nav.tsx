import { Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { ActionLink } from "@/components/Action";
import { HeartMark, XMark, YoutubeMark } from "@/components/ChannelIcons";
import { channels, navigation, site } from "@/content/site";
import { asset } from "@/lib/paths";
import { useTheme } from "@/lib/useTheme";

/** Light/dark switch. Reads and writes the same attribute the pre-paint script set. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === "dark" ? "Mode terang" : "Mode gelap";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Ganti ke ${nextLabel.toLowerCase()}`}
      title={nextLabel}
      className={`grid size-10 shrink-0 place-items-center rounded-btn border border-line-strong text-fg-muted transition-colors duration-200 hover:bg-surface hover:text-fg ${className}`}
    >
      {theme === "dark" ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}

/**
 * Sticky bar, 64px in every breakpoint so it never eats a phone viewport.
 * The channel links live inside it, which is what satisfies "YouTube and X
 * reachable without scrolling on mobile".
 */
export function Nav({
  route,
  onNavigate,
}: {
  route: "home" | "konten";
  onNavigate: (route: "home" | "konten") => void;
}) {
  const [scrolled, setScrolled] = useState(false);

  // An IntersectionObserver sentinel instead of a scroll listener: one
  // observation per state change rather than a callback on every scroll frame.
  useEffect(() => {
    const sentinel = document.getElementById("nav-sentinel");
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div id="nav-sentinel" aria-hidden="true" className="h-px" />
      <header
        className={`sticky top-0 z-40 h-16 border-b backdrop-blur-md ${
          scrolled
            ? "border-line bg-bg/90 supports-[backdrop-filter]:bg-bg/75"
            : "border-transparent bg-transparent"
        }`}
      >
        <div className="shell flex h-full items-center justify-between gap-4">
          <a
            // Home is a separate route, so on /konten the wordmark has to leave
            // the page rather than jump to a top anchor that is not there.
            href={route === "home" ? "#atas" : "/"}
            onClick={
              route === "konten"
                ? (event) => {
                    event.preventDefault();
                    onNavigate("home");
                    window.scrollTo(0, 0);
                  }
                : undefined
            }
            className="flex items-center gap-2.5 font-display text-[1.05rem] font-semibold tracking-tight"
          >
            <img
              src={asset(site.avatarSmall)}
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-pill object-cover"
            />
            <span>Mizu Hamzazu</span>
          </a>

          <nav aria-label="Bagian halaman" className="hidden md:block">
            <ul className="flex items-center gap-7">
              {navigation
                // Section anchors belong to the home page, so they are hidden on
                // /konten rather than rendered as links that go nowhere.
                .filter((item) => item.scope === "all" || item.scope === route)
                .map((item) => {
                  // "/" is never in the list, so the only cross-page target is
                  // /konten and the target route follows from it.
                  const isCrossPage = item.href.startsWith("/");
                  const current = isCrossPage && route === "konten";

                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        onClick={
                          isCrossPage
                            ? (event) => {
                                event.preventDefault();
                                onNavigate("konten");
                                window.scrollTo(0, 0);
                              }
                            : undefined
                        }
                        className={`inline-flex h-9 items-center text-sm transition-colors duration-200 ${
                          current ? "text-fg" : "text-fg-muted hover:text-fg"
                        }`}
                      >
                        {item.label}
                      </a>
                    </li>
                  );
                })}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ul className="flex items-center gap-2">
              <li>
                <ActionLink
                  href={channels.youtube.url}
                  external
                  variant="quiet"
                  size="icon"
                  aria-label={`${channels.youtube.label} ${channels.youtube.handle}`}
                  title={`${channels.youtube.label} ${channels.youtube.handle}`}
                >
                  <YoutubeMark size={18} />
                </ActionLink>
              </li>
              <li>
                <ActionLink
                  href={channels.x.url}
                  external
                  variant="quiet"
                  size="icon"
                  aria-label={`${channels.x.label} ${channels.x.handle}`}
                  title={`${channels.x.label} ${channels.x.handle}`}
                >
                  <XMark size={18} />
                </ActionLink>
              </li>
            </ul>
          </div>
        </div>
      </header>
    </>
  );
}

/** Footer row of channel links, same treatment as the nav. */
export function ChannelButtons() {
  const items = [
    {
      label: channels.youtube.label,
      handle: channels.youtube.handle,
      url: channels.youtube.url,
      icon: <YoutubeMark size={18} />,
    },
    {
      label: channels.x.label,
      handle: channels.x.handle,
      url: channels.x.url,
      icon: <XMark size={18} />,
    },
    {
      label: channels.trakteer.label,
      handle: channels.trakteer.handle,
      url: channels.trakteer.url,
      icon: <HeartMark size={18} />,
    },
  ];

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <li key={item.url}>
          <ActionLink href={item.url} external variant="quiet">
            {item.icon}
            {item.label}
          </ActionLink>
        </li>
      ))}
    </ul>
  );
}
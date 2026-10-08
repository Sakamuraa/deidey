import { Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { ActionLink } from "@/components/Action";
import { HeartMark, XMark, YoutubeMark } from "@/components/ChannelIcons";
import { channels, navigation, site, type Route } from "@/content/site";
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
  route: Route;
  onNavigate: (route: Route) => void;
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
            // The wordmark always goes to the home route, never to a top anchor:
            // on every other page there is no #atas, so an anchor would land on
            // a position that happens to exist and read as a broken page.
            href="/"
            onClick={(event) => {
              if (route === "/") return;
              event.preventDefault();
              onNavigate("/");
            }}
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
              {navigation.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    aria-current={route === item.href ? "page" : undefined}
                    onClick={(event) => {
                      // Modified clicks must reach the browser: a new tab or a
                      // download is the visitor's explicit request.
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                        return;
                      }

                      event.preventDefault();
                      onNavigate(item.href);
                    }}
                    className={`inline-flex h-9 items-center text-sm transition-colors duration-200 ${
                      route === item.href ? "text-fg" : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
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
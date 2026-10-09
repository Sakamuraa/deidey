import { List, Moon, Sun, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { ActionLink } from "@/components/Action";
import { XMark, YoutubeMark } from "@/components/ChannelIcons";
import { channels, navigation, site, type Route } from "@/content/site";
import { asset } from "@/lib/paths";
import { useTheme } from "@/lib/useTheme";

/**
 * The two icon controls in the bar share one class string.
 *
 * They are siblings, so a size or radius difference between them reads as a
 * mistake even when neither is wrong. Kept next to ThemeToggle rather than in
 * Action.tsx because that module's ActionButton is a plain function component and
 * cannot take a ref, which the menu trigger needs for focus restoration on Escape.
 */
const ICON_BUTTON =
  "grid size-10 shrink-0 place-items-center rounded-btn border border-line-strong " +
  "text-fg-muted transition-colors duration-200 hover:bg-surface hover:text-fg";

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
      className={`${ICON_BUTTON} ${className}`}
    >
      {theme === "dark" ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}

/**
 * Sticky bar, 64px in every breakpoint so it never eats a phone viewport.
 *
 * The bar carries three things and nothing else: the wordmark, the page links, and
 * the theme toggle. The channel links used to live here too, which meant the one
 * row that is present on every single page was the row that changed the most --
 * and on a phone it pushed the wordmark and the toggle into a two-item scramble
 * while the actual page links stayed hidden behind `md:block`, leaving a mobile
 * visitor with no way to reach any other route. The channels are one tap away on
 * /channel and in the footer, which is where a link that leaves the site belongs.
 *
 * Mobile gets the page links in a panel instead of inline, since five items plus a
 * wordmark plus a toggle do not fit on a 360px row.
 */
export function Nav({
  route,
  onNavigate,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

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

  /*
   * Following a link inside the panel must close it.
   *
   * Without this the menu survives the route change and stays open over the new
   * page, covering the thing the visitor just asked for. Keyed on the route rather
   * than on the click, so a browser back or forward lands in the same state.
   */
  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  /*
   * Escape closes and hands focus back to the button.
   *
   * Returning focus is the part that matters: a keyboard visitor who closes the
   * menu and is left on `document.body` has to tab back from the top of the page
   * to reach the bar again.
   */
  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  /*
   * Lock the page behind the open panel.
   *
   * The panel is short and the page behind it is long, so on a phone the two
   * scroll together and the menu appears to have no bottom edge. Restoring the
   * previous value rather than clearing it keeps whatever the page had set.
   */
  useEffect(() => {
    if (!menuOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  /**
   * One handler for both the inline links and the panel.
   *
   * Modified clicks have to reach the browser: a new tab or a download is the
   * visitor's explicit request, not something a router should swallow.
   */
  function follow(event: MouseEvent<HTMLAnchorElement>, href: Route) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(href);
  }

  return (
    <>
      <div id="nav-sentinel" aria-hidden="true" className="h-px" />
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-md ${
          scrolled
            ? "border-line bg-bg/90 supports-[backdrop-filter]:bg-bg/75"
            : "border-transparent bg-transparent"
        }`}
      >
        {/*
          `min-h-16` rather than `h-16`: the panel below is part of this header, so
          the bar has to be able to grow when it opens. A fixed height would clip it
          or force the page content underneath.
        */}
        <div className="shell flex min-h-16 items-center justify-between gap-4">
          <a
            // The wordmark always goes to the home route, never to a top anchor:
            // on every other page there is no #atas, so an anchor would land on
            // a position that happens to exist and read as a broken page.
            href="/"
            onClick={(event) => follow(event, "/")}
            className="flex items-center gap-2.5 font-display text-[1.05rem] font-semibold tracking-tight"
          >
            <img
              src={asset(site.avatarSmall)}
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-pill object-cover"
            />
            <span>{site.name}</span>
          </a>

          <nav aria-label="Bagian halaman" className="hidden md:block">
            <ul className="flex items-center gap-7">
              {navigation.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    aria-current={route === item.href ? "page" : undefined}
                    onClick={(event) => follow(event, item.href)}
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

            {/*
              `md:hidden` on the trigger rather than on a wrapper, so the toggle keeps
              its own size and the row does not reflow when the breakpoint changes.
            */}
            <button
              ref={menuButton}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="nav-menu"
              aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
              title={menuOpen ? "Tutup menu" : "Buka menu"}
              onClick={() => setMenuOpen((open) => !open)}
              className={`${ICON_BUTTON} md:hidden`}
            >
              {/*
                The icon is aria-hidden because the button already carries the
                state in its accessible name, and a bare glyph read out as "list"
                tells a screen reader nothing about what it does.
              */}
              {menuOpen ? (
                <X size={20} aria-hidden="true" />
              ) : (
                <List size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/*
          The panel. Rendered only while open, so nothing focusable is hidden
          behind `display:none` while the rest of the page is still tabbable.
          A different landmark label from the inline nav above, since both are in
          the DOM at large viewports and two identically named navs are ambiguous.
        */}
        {menuOpen && (
          <div id="nav-menu" className="border-t border-line bg-bg md:hidden">
            <nav aria-label="Menu halaman" className="shell">
              <ul className="flex flex-col py-2">
                {navigation.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={route === item.href ? "page" : undefined}
                      onClick={(event) => follow(event, item.href)}
                      className={`flex min-h-12 items-center border-b border-line text-base transition-colors duration-200 last:border-b-0 ${
                        route === item.href ? "text-fg" : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}

/** Footer row of channel links, same treatment as the nav. */
export function ChannelButtons() {
  /*
   * Generated from the channel table rather than listed out. This used to be a
   * hand-built array of three, which meant the footer and the /channel page could
   * disagree about which channels she has -- and they already did, once.
   *
   * Only the two with a brand mark get one. Phosphor ships no Facebook,
   * Instagram or TikTok logo, and reaching for a generic glyph on all three would
   * be decoration pretending to be recognition. Those render as the wordmark
   * alone, which is also what a footer this size wants.
   */
  const icons: Partial<Record<keyof typeof channels, ReactNode>> = {
    youtube: <YoutubeMark size={18} />,
    x: <XMark size={18} />,
  };

  const items = (Object.keys(channels) as (keyof typeof channels)[]).map((key) => ({
    key,
    label: channels[key].label,
    url: channels[key].url,
    icon: icons[key],
  }));

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
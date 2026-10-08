import { useEffect, useState } from "react";

import { Channels } from "@/components/Channels";
import { Fanart } from "@/components/Fanart";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Konten } from "@/components/Konten";
import { Nav } from "@/components/Nav";
import { Profile } from "@/components/Profile";
import { RevealFailsafe } from "@/components/RevealFailsafe";
import { StreamPage } from "@/components/StreamPage";
import { Tweets } from "@/components/Tweets";
import { Uploads } from "@/components/Uploads";
import { ROUTES, type Route } from "@/content/site";

/**
 * Page composition, and the routing that chooses it.
 *
 * Five routes, one bundle. The router is a table lookup rather than a library:
 * no nesting, no loaders, no params, so a dependency would be more machinery
 * than the routing itself.
 *
 *   /                  Hero, Profile, Uploads (24h window), Channels
 *   /tentang           Profile, with the full detail this page has room for
 *   /konten            Broadcast list
 *   /konten/streams    One broadcast: player and live chat
 *   /konten/video      Uploads that are not broadcasts
 *   /konten/clips      Clips from other channels naming her
 *   /tweets            Recent posts
 *   /channel           Channel links
 *
 * The route list itself is imported from content/site.ts, so the nav and the
 * router read the same table and cannot disagree about what paths exist.
 */
function normalise(pathname: string): Route {
  // A trailing slash is the same page, and an unknown path falls back to home so
  // a typo lands somewhere real instead of on a blank shell.
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  return (ROUTES as readonly string[]).includes(trimmed) ? (trimmed as Route) : "/";
}

function currentRoute(): Route {
  if (typeof window === "undefined") return "/";
  return normalise(window.location.pathname);
}

export default function App() {
  const [route, setRoute] = useState<Route>(currentRoute);

  /**
   * Change route and record it in history.
   *
   * The pushState is the load-bearing part, not the setState. Without it the
   * address bar never changes, so a refresh drops the visitor back to the home
   * page and the back button walks off the site. Both were verified broken
   * before this existed.
   */
  const navigate = (next: Route) => {
    setRoute((current) => {
      if (current === next) return current;
      window.history.pushState({ route: next }, "", next);
      return next;
    });

    window.scrollTo(0, 0);
  };

  // popstate covers the back and forward buttons. Scroll resets rather than
  // restores, because routes have independent scroll depths and carrying one
  // route's offset into another reads as a jump.
  useEffect(() => {
    const onPop = () => {
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <div className="grain relative min-h-dvh">
      {/* One main, one skip target, on every route. */}
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-btn focus:bg-cocoa focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-bg"
      >
        Lompat ke konten
      </a>

      <Nav route={route} onNavigate={navigate} />

      <main id="konten">
        {route === "/" ? (
          <>
            <Hero />
            <Profile />
            <Uploads />
            <Channels />
          </>
        ) : null}

        {route === "/tentang" ? <Profile detail /> : null}
        {route === "/konten" ? <Konten category="streams" /> : null}
        {route === "/konten/streams" ? <StreamPage /> : null}
        {route === "/konten/video" ? <Konten category="videos" /> : null}
        {route === "/konten/clips" ? <Konten category="clips" /> : null}
        {route === "/tweets" ? <Tweets /> : null}
        {route === "/fanart" ? <Fanart /> : null}
        {route === "/channel" ? <Channels standalone /> : null}
      </main>

      <Footer route={route} />
      <RevealFailsafe />
    </div>
  );
}
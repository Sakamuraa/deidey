import { useEffect, useState } from "react";

import { Channels } from "@/components/Channels";
import { Footer } from "@/components/Footer";
import { Konten } from "@/components/Konten";
import { Hero } from "@/components/Hero";
import { Nav } from "@/components/Nav";
import { Profile } from "@/components/Profile";
import { RevealFailsafe } from "@/components/RevealFailsafe";
import { Uploads } from "@/components/Uploads";

/**
 * Page composition, and the routing that chooses it.
 *
 * Two pages, one bundle. The router is a single pathname comparison rather than a
 * library: with two routes there is nothing to nest, no loaders, and no params,
 * so a dependency would be more machinery than the routing itself.
 *
 *   /          Hero, Profile, Uploads (24h window), Channels
 *   /konten    Konten, three tabs over streams, videos and clips
 *
 * Links are plain anchors. A full page load per navigation is the right trade
 * here: both pages are one small bundle already in the HTTP cache, and it keeps
 * scroll restoration, back-button behaviour and right-click-open-new-tab working
 * without reimplementing any of it.
 */
function currentRoute(): "home" | "konten" {
  if (typeof window === "undefined") return "home";
  return window.location.pathname.replace(/\/+$/, "") === "/konten" ? "konten" : "home";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  /**
   * Change route and record it in history.
   *
   * The pushState is the load-bearing part, not the setState. Without it the
   * address bar keeps saying "/" while /konten is on screen, so a refresh lands
   * on the home page and the back button walks off to wherever the visitor was
   * before the site. Both were verified broken before this existed.
   */
  const navigate = (next: "home" | "konten") => {
    setRoute((current) => {
      if (current === next) return current;

      const path = next === "konten" ? "/konten" : "/";
    // A same-route click must not stack history entries, or the back button
    // would need two presses to leave the page.
    window.history.pushState({ route: next }, "", path);
    return next;
    });

    window.scrollTo(0, 0);
  };

  // popstate covers the back button and forward button. Scroll is reset here
  // rather than restored, because the two routes have independent scroll depths
  // and restoring one route's offset into the other reads as a jump.
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
      {/* One main, one skip target, both routes. The href is an id, so the
          browser jumps on it for free even when the route has just swapped in. */}
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-btn focus:bg-cocoa focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-bg"
      >
        Lompat ke konten
      </a>

      <Nav route={route} onNavigate={navigate} />

      {route === "konten" ? (
        <main id="konten">
          <Konten />
        </main>
      ) : (
        <main id="konten">
          <Hero />
          <Profile />
          <Uploads />
          <Channels />
        </main>
      )}

      <Footer />
      <RevealFailsafe />
    </div>
  );
}
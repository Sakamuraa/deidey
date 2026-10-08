import { Channels } from "@/components/Channels";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Nav } from "@/components/Nav";
import { Profile } from "@/components/Profile";
import { RevealFailsafe } from "@/components/RevealFailsafe";
import { Uploads } from "@/components/Uploads";

/**
 * Page composition.
 *
 * Four sections, four different layout families:
 *   Hero ...... asymmetric split, arch-framed avatar
 *   Profile ... editorial pull-quote + hairline fact strip, then a credit pair
 *   Uploads ... staggered two-column flow with alternating offset
 *   Channels .. full-width statement rows on a peach band
 *
 * `grain` on the root is a fixed, pointer-events-none overlay. The same noise
 * on a scrolling container would repaint the GPU every frame.
 */
export default function App() {
  return (
    <div className="grain relative min-h-dvh">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-btn focus:bg-cocoa focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-bg"
      >
        Lompat ke konten
      </a>

      <Nav />

      <main id="konten">
        <Hero />
        <Profile />
        <Uploads />
        <Channels />
      </main>

      <Footer />
      <RevealFailsafe />
    </div>
  );
}
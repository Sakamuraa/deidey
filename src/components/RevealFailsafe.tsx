import { useEffect } from "react";

/**
 * Makes the scroll-triggered entrances safe for print and for tools that
 * snapshot the page without scrolling.
 *
 * `Reveal` starts its content at `opacity: 0` and lets an IntersectionObserver
 * reveal it. That is right on screen, but a print job, a "save as PDF", or a
 * headless full-page capture never scrolls, so those blocks would print blank.
 *
 * Before printing (or when a print stylesheet is active) we force every pending
 * block to its final state and release the page to paint, then restore. Nothing
 * on screen changes, because `data-reveal-settled` is only set around the print
 * event.
 */
export function RevealFailsafe() {
  useEffect(() => {
    const settle = () => {
      document.documentElement.dataset.revealSettled = "on";
      // Give the browser a frame to paint the forced state before the dialog
      // captures the page.
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          delete document.documentElement.dataset.revealSettled;
        }, 300);
      });
    };

    window.addEventListener("beforeprint", settle);
    // Safari and older Chromium do not always fire beforeprint reliably, so
    // match the print media query as well.
    const media = window.matchMedia("print");
    const onMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) settle();
    };
    media.addEventListener("change", onMediaChange);

    return () => {
      window.removeEventListener("beforeprint", settle);
      media.removeEventListener("change", onMediaChange);
    };
  }, []);

  return null;
}
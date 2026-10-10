import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { EASE_OUT_EXPO } from "@/lib/reveal-motion";

/**
 * A number that slides when it changes.
 *
 * Up when the count rises, down when it falls, so the direction of the change is
 * readable without reading the digits. The old value leaves in the direction the
 * new one arrives from, which is what makes the pair look like one number rolling
 * rather than two numbers cross-fading.
 *
 * Why a rolling pair rather than a counting animation
 * ---------------------------------------------------
 * Animating from old to new would sweep through every intermediate value, so a
 * jump of 400 to 410 would crawl through 400, 401, ... and a jump of 12 to 340
 * would count up through every number in between. A viewer count does not grow
 * one viewer at a time; it is re-reported by YouTube and lands wherever it lands.
 * Rolling the two real values says exactly what happened.
 *
 * Below the threshold nothing animates. A count that moves by one or two is
 * noise, and a number twitching every ten seconds is worse than a number that only
 * moves when the move is worth seeing.
 *
 * Accessibility
 * -------------
 * The moving digits are aria-hidden and a single sr-only span carries the value.
 *
 * During the animation two numbers are genuinely in the DOM at once -- that is
 * what the roll is. A screen reader walking that DOM would read both, and an
 * aria-label on the wrapper would be worse: it replaces the element's contents
 * outright, which would swallow the "menonton" that sits next to it in the card.
 * So the visual side is hidden and the value is stated once, in text, outside the
 * clipping box.
 */
export function LiveNumber({
  value,
  format = (n: number) => n.toLocaleString("id-ID"),
  /** Changes smaller than this do not animate. */
  threshold = 3,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  threshold?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState<number>(value);
  const previous = useRef<number>(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    // The first render is not a change, so nothing should move.
    if (from === value) return;
    setShown(value);
  }, [value]);

  // `shown` trails `value` by one render, so a jump of 400 -> 410 gives delta +10
  // and the incoming number enters from below while the old one leaves upward.
  const delta = value - shown;
  const willAnimate = !reduceMotion && Math.abs(delta) >= threshold;

  return (
    <span className={`inline-flex items-baseline ${className ?? ""}`}>
      <span
        data-live-number
        aria-hidden="true"
        className="relative inline-flex overflow-hidden align-baseline"
      >
<AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={shown}
            /*
             * 1.6em, and the units are the point.
             *
             * A percentage translate in y is measured against the element's own
             * height, and this element is one line tall -- so the original "55%"
             * came out at roughly eight pixels. Traced in a browser at that value it
             * moved about one pixel of eased travel and read as nothing at all.
             * Measured in em it moves a line and a half, which is what makes the
             * direction legible without looking like the page is jumping.
             */
            initial={willAnimate ? { y: delta > 0 ? "1.6em" : "-1.6em", opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            // An empty exit rather than undefined: this project sets
            // exactOptionalPropertyTypes, which will not accept an explicit
            // undefined. Below the threshold the old value just goes.
            exit={willAnimate ? { y: delta > 0 ? "-1.6em" : "1.6em", opacity: 0 } : {}}
            transition={{ duration: 0.44, ease: EASE_OUT_EXPO }}
            // tabular figures so a three-digit and a four-digit count do not change
            // the width of everything to their right as they roll.
            className="inline-block [font-variant-numeric:tabular-nums]"
          >
            {format(shown)}
          </motion.span>
        </AnimatePresence>
      </span>

      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
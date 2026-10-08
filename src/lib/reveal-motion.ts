import type { Variants } from "motion/react";

/**
 * Shared entrance choreography. One easing curve and one distance for the whole
 * page so sections feel like they belong to the same system.
 */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.62, delay, ease: EASE_OUT_EXPO },
  }),
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: (delay: number) => ({
    opacity: 1,
    transition: { duration: 0.7, delay, ease: EASE_OUT_EXPO },
  }),
};

/** Parent variant for a staggered group. Only `visible` matters: `hidden` is an
 *  empty object so the group itself does not animate before its children do. */
export const staggerParent = (stagger: number): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger } },
});
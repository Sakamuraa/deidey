import { motion, useReducedMotion } from "motion/react";

import { fadeUp, staggerParent } from "@/lib/reveal-motion";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Seconds of stagger. Keep under 0.3s or a repeat view feels sluggish. */
  delay?: number;
  /** How much of the element must be visible before the entrance plays. */
  amount?: number;
  as?: "div" | "section" | "li" | "article" | "header";
};

/**
 * Scroll-triggered entrance for a single block. Uses Motion's `whileInView`
 * (an IntersectionObserver under the hood), never a scroll listener.
 *
 * Under `prefers-reduced-motion` we pass `initial: false`, which renders the
 * final state immediately. The animation is removed rather than shortened.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  amount = 0.25,
  as = "div",
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  return (
    <Component
      data-reveal=""
      className={className}
      initial={reduceMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={fadeUp}
      custom={delay}
    >
      {children}
    </Component>
  );
}

/**
 * Staggered reveal for a list. Children must each be a `StaggerItem`, and both
 * components live in the same client tree so the variant context propagates.
 */
export function StaggerGroup({
  children,
  className,
  stagger = 0.06,
  amount = 0.2,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  amount?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-reveal=""
      className={className}
      initial={reduceMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={staggerParent(stagger)}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  // No reduced-motion branch here on purpose: StaggerGroup sets
  // `initial: false` under the media query and the variants collapse with it.
  const Component = motion[as];

  return (
    <Component data-reveal="" className={className} variants={fadeUp}>
      {children}
    </Component>
  );
}
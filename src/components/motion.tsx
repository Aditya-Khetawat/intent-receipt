"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { animate, MotionConfig, useReducedMotion } from "motion/react";

/** House easing: confident deceleration, no bounce. Mirrors --ease-out-expo in globals.css. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Spring for things that slide between positions (active pills, tab underline). */
export const SLIDE = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;

/**
 * App-wide motion defaults. reducedMotion="user" makes Motion drop transform/layout
 * movement for visitors who ask for less motion, while opacity and colour still change.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.28, ease: EASE }}>
      {children}
    </MotionConfig>
  );
}

/**
 * A number that counts to its new value when it changes. The server-rendered text is the
 * final value, so nothing is hidden before hydration; only later changes animate.
 */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || from.current === value) return;
    if (reduce) {
      el.textContent = format(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.6,
      ease: EASE,
      onUpdate: (n) => (el.textContent = format(n)),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, format, reduce]);
  return (
    <span ref={ref} className="tabular-nums">
      {format(value)}
    </span>
  );
}

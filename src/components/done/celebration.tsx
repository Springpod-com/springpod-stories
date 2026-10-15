"use client";

import { tokens } from "@springpod/design-system/tokens";
import { useEffect, useRef } from "react";

const { teal, blue, yellow, purple, navy } = tokens.color.palette;
const COLOURS = [teal.DEFAULT, blue.DEFAULT, yellow.DEFAULT, purple.DEFAULT, teal[400], navy.DEFAULT];

/**
 * One short confetti burst on the done screen (build plan Q5: kept, not a reward).
 * Skipped entirely for prefers-reduced-motion. Decorative only.
 */
export function Celebration() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);
    const pieces = Array.from({ length: 140 }, () => ({
      x: width / 2,
      y: height * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 13 - 4,
      r: Math.random() * 6 + 4,
      c: COLOURS[Math.floor(Math.random() * COLOURS.length)]!,
      a: Math.random() * 6,
      s: (Math.random() - 0.5) * 0.3,
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of pieces) {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.s;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      }
      if (++frame < 110) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50 size-full" />;
}

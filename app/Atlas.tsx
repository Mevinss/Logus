"use client";
import { useEffect, useRef } from "react";

// Relief-print landscape for the entry card: an open book over engraved contour
// lines with a rising sun. The contour layer drifts slowly and the book follows
// the pointer a little; both stop when the user prefers reduced motion.
const W = 640,
  H = 450;
const ink = "#153f36",
  sage = "#a7b49a",
  paper = "#f1e7c8",
  clay = "#d9815b";

function drawBook(ctx: CanvasRenderingContext2D) {
  let seed = 24;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const polygon = (pts: number[][], fill: string) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const leaf = (side: number, t: number, offset: number) => {
    const x = 318 + side * (176 * t),
      y = 264 - 45 * Math.sin(t * 2.45) - 15 * t;
    return [x + offset * 0.51, y + offset];
  };
  for (let depth = 12; depth >= 0; depth--)
    for (const side of [-1, 1]) {
      const pts: number[][] = [];
      for (let j = 0; j <= 48; j++) {
        const p = leaf(side, j / 48, 0);
        pts.push([p[0], p[1] + depth * 1.35]);
      }
      for (let j = 48; j >= 0; j--) {
        const p = leaf(side, j / 48, 88);
        pts.push([p[0], p[1] + depth * 1.35]);
      }
      polygon(pts, depth > 9 ? ink : depth % 2 ? sage : paper);
    }
  for (const side of [-1, 1])
    for (let row = 0; row < 19; row++) {
      const start = 0.12,
        end = 0.87 - (row % 6 === 5 ? 0.19 : 0);
      ctx.beginPath();
      for (let j = 0; j <= 35; j++) {
        const p = leaf(side, start + ((end - start) * j) / 35, 12 + row * 3.7);
        if (j === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.strokeStyle = row % 6 === 0 ? "#84947f" : "#a6ab94";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  polygon(
    [
      [314, 263],
      [321, 263],
      [368, 356],
      [367, 379],
      [360, 374],
      [354, 381],
      [356, 351],
    ],
    clay,
  );
  // Print grain, clipped to the book so the moving layer below stays visible.
  ctx.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle =
      random() > 0.52 ? "rgba(255,245,207,.12)" : "rgba(0,17,13,.12)";
    ctx.fillRect(random() * W, 150 + random() * 260, random() * 1.6 + 0.4, 0.75);
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawLand(ctx: CanvasRenderingContext2D, phase: number) {
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, W, H);
  const sunY = 126 - Math.sin(phase / 3) * 6;
  const glow = ctx.createRadialGradient(396, sunY, 40, 396, sunY, 120);
  glow.addColorStop(0, "rgba(217,129,91,.35)");
  glow.addColorStop(1, "rgba(217,129,91,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(250, 0, 300, 260);
  ctx.fillStyle = clay;
  ctx.beginPath();
  ctx.arc(396, sunY, 55, 0, 2 * Math.PI);
  ctx.fill();
  for (let i = 0; i < 52; i++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y =
        208 +
        i * 3 +
        Math.sin(x / 83 + i / 28 + phase) * 21 +
        Math.cos(x / 54 + i / 20 - phase * 0.6) * 9;
      if (!x) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = i % 3 === 0 ? "#718977" : "#496d5b";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

export default function Atlas() {
  const land = useRef<HTMLCanvasElement>(null),
    book = useRef<HTMLCanvasElement>(null),
    frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = Math.min(2, window.devicePixelRatio || 1);
    const setup = (c: HTMLCanvasElement | null) => {
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return null;
      c.width = W * k;
      c.height = H * k;
      ctx.scale(k, k);
      return ctx;
    };
    const lc = setup(land.current),
      bc = setup(book.current);
    if (!lc || !bc) return;
    drawBook(bc);
    drawLand(lc, 0);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    let raf = 0,
      visible = true,
      last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden || now - last < 40) return;
      last = now;
      drawLand(lc, (now - start) / 4000);
    };
    raf = requestAnimationFrame(tick);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (frame.current) io.observe(frame.current);
    const el = frame.current;
    const move = (e: PointerEvent) => {
      if (!el || e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5,
        y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--tilt-x", (x * 10).toFixed(1) + "px");
      el.style.setProperty("--tilt-y", (y * 8).toFixed(1) + "px");
    };
    const leave = () => {
      el?.style.setProperty("--tilt-x", "0px");
      el?.style.setProperty("--tilt-y", "0px");
    };
    el?.parentElement?.addEventListener("pointermove", move);
    el?.parentElement?.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el?.parentElement?.removeEventListener("pointermove", move);
      el?.parentElement?.removeEventListener("pointerleave", leave);
    };
  }, []);
  return (
    <div className="atlas" ref={frame} aria-hidden="true">
      <canvas ref={land} width={W} height={H} />
      <canvas ref={book} width={W} height={H} className="atlas-book" />
    </div>
  );
}

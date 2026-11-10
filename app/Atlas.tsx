"use client";
import { useEffect, useRef } from "react";

// A two-colour relief-print landscape, drawn at the display's pixel density.
export default function Atlas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = 2;
    canvas.width = 640 * k;
    canvas.height = 450 * k;
    ctx.scale(k, k);
    const ink = "#153f36",
      sage = "#a7b49a",
      paper = "#f1e7c8",
      clay = "#d9815b";
    let seed = 24;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    function polygon(pts: number[][], fill: string) {
      ctx!.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y)));
      ctx!.closePath();
      ctx!.fillStyle = fill;
      ctx!.fill();
    }
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, 640, 450);
    ctx.fillStyle = clay;
    ctx.beginPath();
    ctx.arc(396, 126, 55, 0, 2 * Math.PI);
    ctx.fill();
    // Fine contour lines rise from the horizon like an engraved atlas plate.
    for (let i = 0; i < 52; i++) {
      ctx.beginPath();
      for (let x = 0; x <= 640; x += 3) {
        const y =
          208 +
          i * 3 +
          Math.sin(x / 83 + i / 28) * 21 +
          Math.cos(x / 54 + i / 20) * 9;
        if (!x) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 3 === 0 ? "#718977" : "#496d5b";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // An open volume in perspective, with curved leaves and a stamped binding.
    const leaf = (side: number, t: number, offset: number) => {
      const spineX = 318,
        spineY = 264;
      const x = spineX + side * (176 * t),
        y = spineY - 45 * Math.sin(t * 2.45) - 15 * t;
      return [x + offset * 0.51, y + offset];
    };
    for (let depth = 12; depth >= 0; depth--) {
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
    }
    for (const side of [-1, 1])
      for (let row = 0; row < 19; row++) {
        const start = 0.12,
          end = 0.87 - (row % 6 === 5 ? 0.19 : 0);
        ctx.beginPath();
        for (let j = 0; j <= 35; j++) {
          const p = leaf(
            side,
            start + ((end - start) * j) / 35,
            12 + row * 3.7,
          );
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
    for (let i = 0; i < 19000; i++) {
      ctx.fillStyle =
        random() > 0.52 ? "rgba(255,245,207,.095)" : "rgba(0,17,13,.10)";
      ctx.fillRect(random() * 640, random() * 450, random() * 1.6 + 0.4, 0.75);
    }
  }, []);
  return (
    <canvas
      ref={ref}
      width="640"
      height="450"
      aria-hidden="true"
      className="atlas"
    />
  );
}

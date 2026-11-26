"use client";
// Small interaction helpers: sliding tab ink, skeleton placeholders,
// an animated score ring, a one-shot celebration and a pointer spotlight.
// Every effect is decorative and respects prefers-reduced-motion in CSS.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const ACTIVE = ".active,[aria-selected=true],[aria-current=page]";

// Absolutely positioned underline that glides to the active child of its parent.
export function SlideInk({ watch }: { watch?: unknown }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const ink = ref.current,
      host = ink?.parentElement;
    if (!ink || !host) return;
    const place = () => {
      const el = host.querySelector<HTMLElement>(ACTIVE);
      if (!el) {
        ink.style.opacity = "0";
        return;
      }
      ink.style.opacity = "1";
      ink.style.width = el.offsetWidth + "px";
      ink.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop + el.offsetHeight - 2}px)`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(host);
    const mo = new MutationObserver(place);
    mo.observe(host, { subtree: true, attributes: true, attributeFilter: ["class", "aria-selected", "aria-current"] });
    addEventListener("resize", place);
    return () => {
      ro.disconnect();
      mo.disconnect();
      removeEventListener("resize", place);
    };
  }, [watch]);
  return <span ref={ref} className="slide-ink" aria-hidden="true" />;
}

// Shimmering placeholder rows that keep the loading text for screen readers.
export function Skeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="skeleton" role="status">
      <span className="sr-only">{label}</span>
      <i className="sk-line sk-title" aria-hidden="true" />
      {Array.from({ length: rows }, (_, i) => (
        <i key={i} className="sk-line" style={{ width: 92 - i * 14 + "%" }} aria-hidden="true" />
      ))}
    </div>
  );
}

// Ring that fills to score / max when it mounts.
export function ScoreRing({ score, max }: { score: number; max: number }) {
  const ratio = max ? Math.max(0, Math.min(1, score / max)) : 0,
    r = 34,
    c = 2 * Math.PI * r;
  const level = ratio >= 0.75 ? "is-high" : ratio >= 0.5 ? "is-mid" : "is-low";
  return (
    <svg className={"score-ring " + level} viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
      <circle cx="40" cy="40" r={r} className="ring-track" />
      <circle
        cx="40"
        cy="40"
        r={r}
        className="ring-fill"
        strokeDasharray={c}
        style={{ ["--ring-off" as string]: String(c * (1 - ratio)), ["--ring-len" as string]: String(c) }}
      />
      <text x="40" y="45" textAnchor="middle">{Math.round(ratio * 100)}%</text>
    </svg>
  );
}

// A short burst of paper pieces; renders once, then removes itself.
export function Celebrate() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 2600);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  const colors = ["var(--good)", "var(--warm)", "var(--gold)", "var(--accent)"];
  return (
    <div className="celebrate" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2,
          dist = 90 + ((i * 37) % 90);
        return (
          <i
            key={i}
            style={{
              background: colors[i % colors.length],
              ["--dx" as string]: Math.cos(angle) * dist + "px",
              ["--dy" as string]: Math.sin(angle) * dist - 40 + "px",
              ["--rot" as string]: (i * 47) % 360 + "deg",
              animationDelay: (i % 5) * 18 + "ms",
            }}
          />
        );
      })}
    </div>
  );
}

// Tracks the pointer over interactive cards so CSS can draw a soft spotlight.
export function Spotlight() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover)").matches) return;
    const sel = ".t-lesson,.t-groupcard,.t-panel,.st-cards>.st-card,.t-run";
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", e.clientX - r.left + "px");
      el.style.setProperty("--my", e.clientY - r.top + "px");
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, []);
  return null;
}

"use client";
import { useI18n } from "./I18n";
import type { AnyRow } from "./teacher-ui";

type Bar = { label: string; count: number; correct?: boolean };

// Horizontal bars in the style of a survey summary: one row per option with
// its count and share. The right answer wears the accent colour and a check
// mark, every other bar stays neutral, so meaning never rests on colour alone.
export function Bars({ bars, total, unit, solid }: { bars: Bar[]; total: number; unit?: string; solid?: boolean }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <ul className={solid ? "chart-bars is-solid" : "chart-bars"}>
      {bars.map((b, i) => {
        const share = total ? Math.round((100 * b.count) / total) : 0;
        return (
          <li key={i} className={b.correct ? "is-correct" : undefined} title={`${b.label}: ${b.count} (${share} %)`}>
            <span className="chart-label">
              {b.correct && <span aria-hidden="true">✓ </span>}
              {unit ? `${b.label} ${unit}` : b.label}
            </span>
            <span className="chart-track">
              <span className="chart-fill" style={{ width: `${(100 * b.count) / max}%` }} />
            </span>
            <span className="chart-value">
              {b.count} <small>({share} %)</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function QuestionChart({ metric }: { metric: AnyRow }) {
  const { t } = useI18n();
  if (!metric.chart?.length) return null;
  const open = metric.type === "open";
  const total = open ? metric.assessed : metric.answered;
  if (!total) return <p className="chart-empty">{t("chart.noAnswers")}</p>;
  return (
    <figure className="chart">
      <figcaption>{open ? t("chart.scores", { max: metric.maxPoints }) : t("chart.options", { count: total })}</figcaption>
      <Bars bars={metric.chart} total={total} unit={open ? t("chart.pointsShort") : undefined} />
    </figure>
  );
}

export function ScoreChart({ run }: { run: AnyRow }) {
  const { t } = useI18n();
  if (!run.gradedCount) return null;
  return (
    <figure className="chart">
      <figcaption>{t("chart.results", { count: run.gradedCount, percent: run.averagePercent })}</figcaption>
      <Bars
        bars={run.distribution.map((b: AnyRow) => ({ label: `${b.from}–${b.to} %`, count: b.count }))}
        total={run.gradedCount}
        solid
      />
    </figure>
  );
}

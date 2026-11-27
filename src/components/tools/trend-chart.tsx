"use client";
import * as React from "react";
import type { TrendRow } from "@/lib/tools/trend";

const HEIGHT = 260;
const PAD = { top: 14, right: 14, bottom: 34, left: 40 };

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Response and remission markers: shapes, not colour alone (WCAG 1.4.1). Also used by the legend. */
export function ResponseShape({ cx, cy, r = 9 }: { cx: number; cy: number; r?: number }) {
  return <path d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`} fill="none" stroke="var(--accent)" strokeWidth={2.25} />;
}
export function RemissionShape({ cx, cy, r = 10 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ok)" strokeWidth={2.25} strokeDasharray="3 2.5" />;
}

/**
 * Totals by session number over the measure's severity bands, drawn at the container's real pixel width so text
 * stays readable on a phone. The table next to it carries the same data for screen readers and keyboard users;
 * the SVG has a title and a text summary. No animation.
 */
export function TrendChart({
  rows,
  range,
  bands,
  title,
  summary,
  responseLine,
  remissionBelow,
}: {
  rows: readonly TrendRow[];
  range: { min: number; max: number };
  bands: readonly { min: number; max: number; label: string }[];
  title: string;
  summary: string;
  /** Total at which response is met (50% of baseline), when the response rule applies. */
  responseLine: number | null;
  remissionBelow: number | null;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const titleId = React.useId();
  const descId = React.useId();
  const w = Math.max(0, width - PAD.left - PAD.right);
  const h = HEIGHT - PAD.top - PAD.bottom;
  const sessions = rows.map((r) => r.session);
  const sMin = Math.min(...sessions);
  const sMax = Math.max(...sessions);
  const x = (s: number) => PAD.left + (sMax === sMin ? w / 2 : ((s - sMin) / (sMax - sMin)) * w);
  const y = (t: number) => PAD.top + (1 - (t - range.min) / (range.max - range.min)) * h;
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  const ticks = [...new Set([...sorted.map((b) => b.min), range.max])];
  const step = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(w / 44))));
  const xLabels = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);

  return (
    <div ref={ref} className="w-full">
      {width > 0 && rows.length > 0 ? (
        <svg width={width} height={HEIGHT} role="img" aria-labelledby={`${titleId} ${descId}`} className="block overflow-visible">
          <title id={titleId}>{title}</title>
          <desc id={descId}>{summary}</desc>
          {sorted.map((b, i) => {
            const top = y(Math.min(range.max, sorted[i + 1]?.min ?? range.max));
            const bottom = y(b.min);
            return (
              <g key={b.label}>
                <rect x={PAD.left} y={top} width={w} height={bottom - top} fill={i % 2 ? "var(--surface-2)" : "var(--surface)"} />
                <text x={PAD.left + w - 6} y={top + 13} textAnchor="end" fontSize={12} fill="var(--muted)">
                  {b.label}
                </text>
              </g>
            );
          })}
          <rect x={PAD.left} y={PAD.top} width={w} height={h} fill="none" stroke="var(--border)" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left - 4} x2={PAD.left} y1={y(t)} y2={y(t)} stroke="var(--muted)" />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          {xLabels.map((r) => (
            <text key={r.session} x={x(r.session)} y={HEIGHT - PAD.bottom + 18} textAnchor="middle" fontSize={12} fill="var(--muted)">
              #{r.session}
            </text>
          ))}
          <text x={PAD.left + w / 2} y={HEIGHT - 2} textAnchor="middle" fontSize={12} fill="var(--muted)">
            Session #
          </text>
          {responseLine !== null ? (
            <line x1={PAD.left} x2={PAD.left + w} y1={y(responseLine)} y2={y(responseLine)} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" />
          ) : null}
          {remissionBelow !== null ? (
            <line x1={PAD.left} x2={PAD.left + w} y1={y(remissionBelow)} y2={y(remissionBelow)} stroke="var(--ok)" strokeWidth={1.5} strokeDasharray="2 4" />
          ) : null}
          {rows.length > 1 ? (
            <polyline
              points={rows.map((r) => `${x(r.session)},${y(r.total)}`).join(" ")}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          ) : null}
          {rows.map((r) => (
            <g key={r.session}>
              {r.response ? <ResponseShape cx={x(r.session)} cy={y(r.total)} /> : null}
              {r.remission ? <RemissionShape cx={x(r.session)} cy={y(r.total)} r={r.response ? 13 : 10} /> : null}
              <circle cx={x(r.session)} cy={y(r.total)} r={4.5} fill="var(--surface)" stroke="var(--primary)" strokeWidth={2.5} />
            </g>
          ))}
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} aria-hidden />
      )}
    </div>
  );
}

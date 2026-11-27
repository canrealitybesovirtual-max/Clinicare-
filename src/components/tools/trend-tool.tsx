"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { Measure } from "@/lib/schemas";
import { scoreMeasure } from "@/lib/measures";
import {
  TREND_GOVERNANCE,
  TREND_RULES,
  analyzeTrend,
  notOnTrack,
  pointError,
  removePoint,
  upsertPoint,
  type MeasureTrendRules,
  type TrendPoint,
  type TrendSummary,
} from "@/lib/tools/trend";
import { useSession } from "@/state/session";
import { AdultOnly } from "@/components/measures/adult-only";
import { ClinicianReviewBadge, Governance, SourcesList } from "@/components/content/content-meta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { RemissionShape, ResponseShape, TrendChart } from "./trend-chart";

type TrendMeasureId = keyof typeof TREND_RULES;
const isTrendMeasure = (m: Measure): m is Measure & { id: TrendMeasureId } => m.id in TREND_RULES;

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function summaryText(m: Measure, t: TrendSummary): string {
  if (!t.baseline || !t.latest) return `No ${m.shortName} totals entered yet.`;
  const base = t.rows[0]!;
  const parts = [`Baseline, session #${base.session}: ${base.total}${base.band ? ` (${base.band})` : ""}.`];
  const last = t.rows[t.rows.length - 1]!;
  if (t.rows.length > 1) {
    const pct = last.percentChange !== null ? `, ${Math.abs(last.percentChange)}% ${last.change! < 0 ? "lower" : "higher"}` : "";
    parts.push(
      `Latest, session #${last.session}: ${last.total}${last.band ? ` (${last.band})` : ""}, ${
        last.change === 0 ? "no change" : `${Math.abs(last.change!)} points ${last.change! < 0 ? "lower" : "higher"}${pct}`
      }.`,
    );
  }
  if (t.firstResponse !== null) parts.push(`Response first met at session #${t.firstResponse}.`);
  if (t.firstRemission !== null) parts.push(`Remission first met at session #${t.firstRemission}.`);
  return parts.join(" ");
}

function markers(row: TrendSummary["rows"][number], rules: MeasureTrendRules): string {
  const out: string[] = [];
  if (row.response) out.push("Response");
  if (row.remission) out.push("Remission");
  if (row.improved) out.push(`Down ${rules.meaningfulChange}+ points`);
  if (row.worsened) out.push(`Up ${rules.meaningfulChange}+ points`);
  return out.join(" · ");
}

function changeText(row: TrendSummary["rows"][number]): string {
  if (row.change === null) return "—";
  return `${signed(row.change)}${row.percentChange !== null ? ` (${signed(row.percentChange)}%)` : ""}`;
}

function RemoveButton({ session, onRemove }: { session: number; onRemove: (session: number) => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" aria-label={`Remove session #${session}`} onClick={() => onRemove(session)}>
      <Trash2 aria-hidden />
    </Button>
  );
}

/** Measure trend. Totals live only in this screen's memory; Clear session and the idle wipe remount it. */
export function TrendTool({ measures }: { measures: Measure[] }) {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <TrendInner key={resetCount} measures={measures.filter(isTrendMeasure)} />
    </AdultOnly>
  );
}

/**
 * Reads ?measure=<id> (the link under a completed measure on the Measures screen). Only a measure this tool
 * charts is acted on; anything else is ignored.
 */
function MeasureParam({ ids, onValue }: { ids: readonly TrendMeasureId[]; onValue: (id: TrendMeasureId) => void }) {
  const raw = useSearchParams().get("measure");
  React.useEffect(() => {
    const id = ids.find((x) => x === raw);
    if (id) onValue(id);
  }, [raw, ids, onValue]);
  return null;
}

function TrendInner({ measures }: { measures: (Measure & { id: TrendMeasureId })[] }) {
  const { state } = useSession();
  const [measureId, setMeasureId] = React.useState<TrendMeasureId>(measures[0]?.id ?? "phq-9");
  const measureIds = React.useMemo(() => measures.map((x) => x.id), [measures]);
  const [points, setPoints] = React.useState<Record<string, TrendPoint[]>>({});
  const [session, setSession] = React.useState("");
  const [total, setTotal] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const sessionRef = React.useRef<HTMLInputElement>(null);

  const m = measures.find((x) => x.id === measureId) ?? measures[0]!;
  const range = { min: m.scoring.min, max: m.scoring.max };
  const rules = TREND_RULES[m.id];
  const list = points[m.id] ?? [];
  const trend = analyzeTrend(list, rules, m.scoring.bands);
  const summary = summaryText(m, trend);

  // This session's total, when the measure was completed on the Measures screen.
  const answers = state.measureAnswers[m.id];
  const live = answers ? scoreMeasure(m, answers) : null;
  const liveTotal = live?.complete ? live.total : null;

  function add(e: React.FormEvent) {
    e.preventDefault();
    const s = Number(session);
    const t = Number(total);
    const problem = session === "" || total === "" ? "Enter a session # and a total." : pointError(s, t, range);
    if (problem) {
      setError(problem);
      return;
    }
    const replaced = list.some((p) => p.session === s);
    setPoints((all) => ({ ...all, [m.id]: upsertPoint(all[m.id] ?? [], { session: s, total: t }) }));
    setAnnounce(`${replaced ? "Updated" : "Added"} session #${s}: ${m.shortName} total ${t}.`);
    setError(null);
    setSession(String(Math.min(200, s + 1)));
    setTotal("");
    sessionRef.current?.focus();
  }

  function remove(sessionNo: number) {
    setPoints((all) => ({ ...all, [m.id]: removePoint(all[m.id] ?? [], sessionNo) }));
    setAnnounce(`Removed session #${sessionNo}.`);
    sessionRef.current?.focus();
  }

  const responseLine = trend.markersApply && rules.responseShare !== undefined && trend.baseline ? trend.baseline.total * rules.responseShare : null;
  const remissionLine = trend.markersApply && rules.remissionBelow !== undefined ? rules.remissionBelow : null;

  return (
    <div className="space-y-6">
      <React.Suspense fallback={null}>
        <MeasureParam ids={measureIds} onValue={setMeasureId} />
      </React.Suspense>
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <ClinicianReviewBadge />
          <span className="text-sm text-muted">Nothing is saved. Totals clear when you leave this page.</span>
        </div>
        <ChoiceGroup
          legend="Measure"
          name="trend-measure"
          value={measureId}
          options={measures.map((x) => ({ value: x.id, label: x.shortName }))}
          onChange={(v) => {
            setMeasureId(v);
            setError(null);
          }}
        />
        <form onSubmit={add} noValidate className="space-y-3" aria-describedby={error ? "trend-error" : undefined}>
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[10rem_10rem_auto]">
            <div className="space-y-1.5">
              <label htmlFor="trend-session" className="block text-sm font-semibold">
                Session #
              </label>
              <input
                id="trend-session"
                ref={sessionRef}
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                value={session}
                onChange={(e) => setSession(e.target.value.replace(/\D/g, ""))}
                aria-invalid={error ? true : undefined}
                className="block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="trend-total" className="block text-sm font-semibold">
                {m.shortName} total <span className="font-normal text-muted">({range.min}–{range.max})</span>
              </label>
              <input
                id="trend-total"
                inputMode="numeric"
                autoComplete="off"
                maxLength={2}
                value={total}
                onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))}
                aria-invalid={error ? true : undefined}
                className="block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text"
              />
            </div>
            <Button type="submit" className="col-span-2 sm:col-span-1">
              <Plus aria-hidden />
              Add to trend
            </Button>
          </div>
          {liveTotal !== null ? (
            <p className="text-sm">
              This session’s {m.shortName} total is <strong>{liveTotal}</strong>.{" "}
              <button
                type="button"
                onClick={() => setTotal(String(liveTotal))}
                className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2"
              >
                Use it as the total
              </button>
            </p>
          ) : null}
          <p id="trend-error" role="alert" className="text-sm font-semibold text-crisis empty:hidden">
            {error}
          </p>
          <p role="status" className="sr-only">
            {announce}
          </p>
        </form>
      </Card>

      <Card className="space-y-4">
        <h2 id="trend-heading" className="text-lg font-semibold">
          {m.shortName} by session
        </h2>
        <p className="text-sm leading-relaxed">{summary}</p>
        {list.length ? (
          <>
            <TrendChart
              rows={trend.rows}
              range={range}
              bands={m.scoring.bands}
              title={`${m.shortName} totals by session number`}
              summary={summary}
              responseLine={responseLine}
              remissionBelow={remissionLine}
            />
            {rules.rules.some((r) => r.id !== "change") ? (
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Chart key">
                <li className="flex items-center gap-2">
                  <svg width="24" height="24" aria-hidden>
                    <ResponseShape cx={12} cy={12} />
                  </svg>
                  Response (dashed line: 50% of baseline)
                </li>
                <li className="flex items-center gap-2">
                  <svg width="24" height="24" aria-hidden>
                    <RemissionShape cx={12} cy={12} />
                  </svg>
                  Remission (dotted line: below {rules.remissionBelow})
                </li>
              </ul>
            ) : null}
            {!trend.markersApply && rules.responseShare !== undefined ? (
              <p className="text-sm text-muted">Response and remission are not marked: the baseline total is below {rules.elevatedFrom}.</p>
            ) : null}
            {/* Phones: one card per session, so every value and Remove fit without scrolling sideways. */}
            <ul className="space-y-2 sm:hidden" aria-labelledby="trend-heading">
              {trend.rows.map((r, i) => (
                <li key={r.session} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                  <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-muted">Session #</dt>
                    <dd className="font-semibold">
                      {r.session}
                      {i === 0 ? <span className="ml-1 font-normal text-muted">(baseline)</span> : null}
                    </dd>
                    <dt className="text-muted">Total</dt>
                    <dd>
                      {r.total}
                      {r.band ? <span className="text-muted"> · {r.band}</span> : null}
                    </dd>
                    <dt className="text-muted">Change</dt>
                    <dd>{changeText(r)}</dd>
                    <dt className="text-muted">Markers</dt>
                    <dd>{markers(r, rules) || "—"}</dd>
                  </dl>
                  <RemoveButton session={r.session} onRemove={remove} />
                </li>
              ))}
            </ul>
            <div className="relative hidden overflow-x-auto sm:block" tabIndex={0} role="region" aria-labelledby="trend-heading">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{m.shortName} totals by session number, with severity band, change from baseline and markers</caption>
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">Session #</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Total</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Severity band</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Change from baseline</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Markers</th>
                    <th scope="col" className="py-2 font-semibold"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {trend.rows.map((r, i) => (
                    <tr key={r.session} className="border-b border-border">
                      <th scope="row" className="py-1.5 pr-3 font-semibold">
                        #{r.session}
                        {i === 0 ? <span className="ml-1 font-normal text-muted">(baseline)</span> : null}
                      </th>
                      <td className="py-1.5 pr-3">{r.total}</td>
                      <td className="py-1.5 pr-3">{r.band ?? "—"}</td>
                      <td className="py-1.5 pr-3">{changeText(r)}</td>
                      <td className="py-1.5 pr-3">{markers(r, rules) || "—"}</td>
                      <td className="py-1.5">
                        <RemoveButton session={r.session} onRemove={remove} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Add the first total above. The first session you add is the baseline.</p>
        )}
      </Card>

      {notOnTrack(trend) ? (
        <Notice tone="info" title="Not on track: worth a review">
          <ClinicianReviewBadge />
          <p>
            Totals have not come down from the baseline, or have risen. Consider reviewing the alliance, the formulation,
            the fit and intensity of the work, consulting or stepping up care, and re-checking safety. This is a prompt
            for your review, not a decision.
          </p>
          <p className="flex flex-wrap gap-x-4">
            <Link href="/practice/outcome-monitoring" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
              Outcome monitoring guide
            </Link>
            <Link href="/practice/unwanted-effects-of-therapy" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
              Unwanted effects of therapy
            </Link>
          </p>
        </Notice>
      ) : null}

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">How the markers are defined</h2>
        <dl className="space-y-3 text-sm">
          {rules.rules.map((r) => (
            <div key={r.id}>
              <dt className="font-semibold">{r.label}</dt>
              <dd className="leading-relaxed">
                {r.definition} Source:{" "}
                <ExternalLink href={r.source.url}>{r.source.title}</ExternalLink>
                <span className="text-muted">
                  {" "}
                  · {r.source.publisher}
                  {r.source.year ? `, ${r.source.year}` : ""}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          {rules.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>Markers are prompts for review with the client, not outcome decisions. A total is screening information, not a diagnosis.</li>
        </ul>
        <div>
          <h3 className="text-sm font-semibold">Severity bands</h3>
          <SourcesList sources={m.sources} className="mt-2" />
        </div>
        <Governance {...TREND_GOVERNANCE} />
      </Card>
    </div>
  );
}

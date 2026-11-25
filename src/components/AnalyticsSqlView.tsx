import React, { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { computeStationAnalytics } from '../engine/ewmaPredictor';
import { exportSchemaSql, getEffectiveHour } from '../engine/queueStore';
import type { QueuePulseState, ServiceEventType } from '../engine/types';
import {
  formatHourSlot,
  formatShortTime,
  formatSignedMinutes,
} from '../utils/formatters';

interface AnalyticsSqlViewProps {
  state: QueuePulseState;
  nowMs: number;
}

type SubTab = 'audit' | 'feedback' | 'schema';

export function AnalyticsSqlView({ state, nowMs }: AnalyticsSqlViewProps) {
  const [selectedLocId, setSelectedLocId] = useState<number>(1);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('audit');
  const [eventTypeFilter, setEventTypeFilter] = useState<ServiceEventType | 'ALL'>('ALL');
  const [selectedChartHour, setSelectedChartHour] = useState<number | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const effectiveHour = getEffectiveHour(state, nowMs);

  const selectedLocation =
    state.locations.find((l) => l.id === selectedLocId) ?? state.locations[0];

  const analytics = useMemo(
    () =>
      computeStationAnalytics(
        selectedLocation.id,
        state.history,
        state.learnedBiasMatrix,
        effectiveHour
      ),
    [selectedLocation.id, state.history, state.learnedBiasMatrix, effectiveHour]
  );

  const sqlOutput = useMemo(() => exportSchemaSql(state), [state]);

  const filteredEvents = useMemo(() => {
    return state.events.filter((ev) => {
      if (eventTypeFilter !== 'ALL' && ev.event_type !== eventTypeFilter) {
        return false;
      }
      return true;
    });
  }, [state.events, eventTypeFilter]);

  const maxChartWait = useMemo(
    () =>
      Math.max(
        10,
        ...analytics.hourlyProfile.map((p) => p.avgWait)
      ),
    [analytics.hourlyProfile]
  );

  const inspectedSlot = useMemo(() => {
    const targetHour = selectedChartHour ?? effectiveHour;
    return (
      analytics.hourlyProfile.find((p) => p.hour === targetHour) ??
      analytics.hourlyProfile[5]
    );
  }, [analytics.hourlyProfile, selectedChartHour, effectiveHour]);

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(sqlOutput);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      setCopiedSql(false);
    }
  };

  const handleDownloadSql = () => {
    const blob = new Blob([sqlOutput], { type: 'text/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tableSummaries = [
    { name: 'Locations', rows: state.locations.length, pk: 'id (UNIQUE code)' },
    { name: 'QueueTokens', rows: state.tokens.length, pk: 'id (FK → Locations)' },
    { name: 'ServiceEvents', rows: state.events.length, pk: 'id (FK → Tokens, Loc)' },
    { name: 'WaitTimeHistory', rows: state.history.length, pk: 'id (FK → Locations)' },
    { name: 'Feedback', rows: state.feedback.length, pk: 'id (FK → QueueTokens)' },
  ];

  return (
    <div className="space-y-7">
      {/* Header + Station Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            EWMA Predictive Analytics &amp; Relational Schema
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Self-correcting wait-time error convergence (α = 0.25), immutable audit trail, and ANSI SQL DDL export.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 self-start lg:self-auto">
          {state.locations.map((loc) => {
            const active = loc.id === selectedLocation.id;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  setSelectedLocId(loc.id);
                  setSelectedChartHour(null);
                }}
                className={`min-h-[36px] px-3 text-xs font-mono rounded-md cursor-pointer ${
                  active
                    ? 'bg-white text-slate-950 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {loc.code}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4-Column Tabular KPI Strip */}
      <section
        aria-label="Station predictive accuracy metrics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-500">
            Hour {formatHourSlot(analytics.currentHour)} Benchmark
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-950">
            {analytics.currentHourBenchmark.toFixed(1)}m
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {selectedLocation.name}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-500">Learned EWMA Bias</div>
          <div
            className={`mt-1.5 text-2xl sm:text-3xl font-bold font-mono tabular-nums ${
              analytics.learnedBias > 0.5
                ? 'text-amber-700'
                : analytics.learnedBias < -0.5
                  ? 'text-emerald-700'
                  : 'text-slate-950'
            }`}
          >
            {formatSignedMinutes(analytics.learnedBias)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Adaptive offset for {formatHourSlot(analytics.currentHour)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-500">Mean Absolute Error (MAE)</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-950">
            {analytics.mae.toFixed(2)}m
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Across {analytics.totalSamples} observations
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-500">Accuracy (≤ 3m Tolerance)</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-700">
            {analytics.accuracyWithin3m.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Within 3-minute student window
          </div>
        </div>
      </section>

      {/* Responsive 24-Hour Campus Peak Profile Chart */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Hourly Wait-Time Profile &amp; Learned Bias — {selectedLocation.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click or tap any campus hour bar to inspect average wait and EWMA bias calibration.
            </p>
          </div>

          {inspectedSlot && (
            <div className="text-xs font-mono tabular-nums text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <span className="font-semibold text-slate-950">
                {formatHourSlot(inspectedSlot.hour)}
              </span>{' '}
              · Avg Wait {inspectedSlot.avgWait.toFixed(1)}m · Bias{' '}
              {formatSignedMinutes(inspectedSlot.learnedBias)} · {inspectedSlot.sampleCount}{' '}
              samples
            </div>
          )}
        </div>

        {/* Interactive Responsive Bar Chart */}
        <div className="mt-6">
          <div
            className="grid grid-cols-6 sm:grid-cols-12 gap-2 sm:gap-3 items-end h-52"
            role="group"
            aria-label="Hourly average wait times"
          >
            {analytics.hourlyProfile.map((slot) => {
              const heightPct = Math.max(
                8,
                Math.round((slot.avgWait / maxChartWait) * 100)
              );
              const isSelected = inspectedSlot?.hour === slot.hour;
              const isPeak = slot.avgWait >= 12;

              return (
                <button
                  key={slot.hour}
                  type="button"
                  onClick={() => setSelectedChartHour(slot.hour)}
                  aria-label={`Hour ${formatHourSlot(slot.hour)}, average wait ${slot.avgWait.toFixed(1)} minutes, learned bias ${formatSignedMinutes(slot.learnedBias)}`}
                  className="h-full flex flex-col items-center justify-end gap-1.5 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-lg py-1"
                >
                  <span className="text-[11px] font-mono tabular-nums text-slate-600">
                    {slot.avgWait > 0 ? `${Math.round(slot.avgWait)}m` : '—'}
                  </span>
                  <div className="w-full flex-1 flex items-end justify-center px-0.5 sm:px-1">
                    <div
                      className={`w-full max-w-[34px] rounded-t-md transition-all duration-200 ${
                        isSelected
                          ? 'bg-blue-700'
                          : isPeak
                            ? 'bg-amber-500 group-hover:bg-amber-600'
                            : 'bg-slate-300 group-hover:bg-slate-400'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-mono tabular-nums ${
                      isSelected
                        ? 'text-blue-700 font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    {String(slot.hour).padStart(2, '0')}h
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
            <span>Selected hour (Indigo)</span>
            <span aria-hidden="true">·</span>
            <span>Peak surge ≥ 12m (Amber)</span>
            <span aria-hidden="true">·</span>
            <span>Normal flow (Slate)</span>
          </div>
        </div>
      </section>

      {/* Bottom Data Explorer Tabs: Audit Trail / Feedback / Relational Schema & SQL */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div
            role="tablist"
            aria-label="Database records view"
            className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg self-start"
          >
            {[
              { id: 'audit' as SubTab, label: `Audit Trail (${state.events.length})` },
              { id: 'feedback' as SubTab, label: `Feedback (${state.feedback.length})` },
              { id: 'schema' as SubTab, label: '3NF Schema & SQL' },
            ].map((tab) => {
              const active = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeSubTab === 'audit' && (
            <div className="flex items-center gap-2">
              <label htmlFor="audit-event-filter" className="text-xs text-slate-500">
                Event
              </label>
              <select
                id="audit-event-filter"
                value={eventTypeFilter}
                onChange={(e) =>
                  setEventTypeFilter(e.target.value as ServiceEventType | 'ALL')
                }
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-800"
              >
                <option value="ALL">All Events</option>
                <option value="ARRIVED">ARRIVED</option>
                <option value="CALLED">CALLED</option>
                <option value="SERVICE_STARTED">SERVICE_STARTED</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="NO_SHOW">NO_SHOW</option>
              </select>
            </div>
          )}

          {activeSubTab === 'schema' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopySql}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    <span>Copied SQL</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy SQL</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadSql}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-xs font-semibold text-white cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Download schema.sql</span>
              </button>
            </div>
          )}
        </div>

        {/* Tab 1: Audit Trail */}
        {activeSubTab === 'audit' && (
          <div className="mt-4">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-2.5 pr-4">Time</th>
                    <th className="py-2.5 pr-4">Token</th>
                    <th className="py-2.5 pr-4">Event Type</th>
                    <th className="py-2.5 pr-4">Desk / Operator</th>
                    <th className="py-2.5">Audit Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredEvents.slice(0, 25).map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {formatShortTime(ev.event_timestamp)}
                      </td>
                      <td className="py-2.5 pr-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {ev.token_number}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-blue-700 whitespace-nowrap">
                        {ev.event_type}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-slate-700 whitespace-nowrap">
                        {ev.counter_number > 0 ? `Desk ${ev.counter_number} · ` : ''}
                        {ev.operator_name}
                      </td>
                      <td className="py-2.5 text-xs text-slate-600">{ev.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked audit rows */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredEvents.slice(0, 20).map((ev) => (
                <div key={ev.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                    <span className="font-semibold text-slate-950">
                      {ev.token_number} · {ev.event_type}
                    </span>
                    <span className="text-slate-500">
                      {formatShortTime(ev.event_timestamp)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">{ev.remarks}</div>
                  <div className="text-[11px] text-slate-400">
                    {ev.counter_number > 0 ? `Desk ${ev.counter_number} · ` : ''}
                    {ev.operator_name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Student Feedback */}
        {activeSubTab === 'feedback' && (
          <div className="mt-4 divide-y divide-slate-100">
            {state.feedback.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No student feedback submitted yet. Complete a token and submit a rating from the Student Hub.
              </p>
            ) : (
              state.feedback.map((fb) => {
                const loc = state.locations.find((l) => l.id === fb.location_id);
                return (
                  <div
                    key={fb.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-500">
                        <span className="font-semibold text-slate-950">
                          {fb.token_number}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">{loc?.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatShortTime(fb.created_at)}</span>
                      </div>
                      <p className="text-sm text-slate-800">
                        {fb.comments || 'No written review provided.'}
                      </p>
                    </div>
                    <div className="text-left sm:text-right font-mono tabular-nums shrink-0">
                      <div className="text-sm font-bold text-amber-700">
                        {fb.rating} / 5 Stars
                      </div>
                      <div className="text-xs text-slate-500">
                        Perceived {fb.perceived_wait_minutes.toFixed(1)}m vs Actual{' '}
                        {fb.actual_wait_minutes !== null
                          ? `${fb.actual_wait_minutes.toFixed(1)}m`
                          : '—'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 3: Normalized 3NF Relational Schema & ANSI SQL Export */}
        {activeSubTab === 'schema' && (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {tableSummaries.map((tbl) => (
                <div
                  key={tbl.name}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                >
                  <div className="font-mono text-xs font-semibold text-slate-950">
                    {tbl.name}
                  </div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-blue-700">
                    {tbl.rows}{' '}
                    <span className="text-xs font-sans font-normal text-slate-500">
                      rows
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-mono text-slate-500 truncate">
                    {tbl.pk}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>schema.sql — ANSI SQL DDL &amp; Live Data Snapshot</span>
                <span>ON DELETE CASCADE enforced</span>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[340px] leading-relaxed">
                <code>{sqlOutput}</code>
              </pre>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

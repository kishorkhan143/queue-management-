import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FastForward,
  Play,
  RotateCcw,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { getRankedWaitingQueue, getStationLiveSummary } from '../engine/queueStore';
import type { QueuePulseState } from '../engine/types';
import {
  formatElapsedSeconds,
  formatHourSlot,
  formatSignedMinutes,
  priorityLabel,
} from '../utils/formatters';

export interface CalibrationNotice {
  tokenNumber: string;
  estimatedWait: number;
  actualWait: number;
  errorDelta: number;
  previousBias: number;
  updatedBias: number;
  hourSlot: number;
}

interface StaffConsoleViewProps {
  state: QueuePulseState;
  nowMs: number;
  lastCalibration: CalibrationNotice | null;
  onCallNext: (locationId: number, counterNumber: number, operatorName: string) => void;
  onCommenceService: (tokenId: number, operatorName: string) => void;
  onCompleteService: (
    tokenId: number,
    operatorName: string,
    actualWaitOverride?: number
  ) => void;
  onMarkNoShow: (tokenId: number, operatorName: string) => void;
  onAdvanceAging: (seconds: number) => void;
  onSimulateBurst: (locationId: number) => void;
  onResetDemo: () => void;
}

export function StaffConsoleView({
  state,
  nowMs,
  lastCalibration,
  onCallNext,
  onCommenceService,
  onCompleteService,
  onMarkNoShow,
  onAdvanceAging,
  onSimulateBurst,
  onResetDemo,
}: StaffConsoleViewProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<number>(1);
  const [selectedDesk, setSelectedDesk] = useState<number>(1);
  const [operatorName, setOperatorName] = useState<string>('Suresh K.');
  const [actualWaitDrafts, setActualWaitDrafts] = useState<Record<number, string>>({});

  const summary = useMemo(
    () => getStationLiveSummary(state, selectedLocationId, nowMs),
    [state, selectedLocationId, nowMs]
  );

  const rankedWaiting = useMemo(
    () => getRankedWaitingQueue(state, selectedLocationId, nowMs),
    [state, selectedLocationId, nowMs]
  );

  const desks = useMemo(
    () =>
      Array.from(
        { length: summary.location.counter_count },
        (_, idx) => idx + 1
      ),
    [summary.location.counter_count]
  );

  const activeDesk = Math.min(selectedDesk, summary.location.counter_count);
  const nextUp = rankedWaiting[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Header + Simulation Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Staff Counter Operator Console
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Call highest-priority tokens, manage active desks, and trigger real-time EWMA wait-time calibration upon completion.
          </p>
        </div>

        {/* Simulation Automation Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAdvanceAging(300)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
            <span>Advance Clock +5m</span>
          </button>
          <button
            type="button"
            onClick={() => onSimulateBurst(selectedLocationId)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
            <span>Simulate 2 Arrivals</span>
          </button>
          <button
            type="button"
            onClick={onResetDemo}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Demo</span>
          </button>
        </div>
      </div>

      {/* Station Switcher + Desk & Operator Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Select campus station"
          className="flex flex-wrap gap-1.5"
        >
          {state.locations.map((loc) => {
            const active = loc.id === selectedLocationId;
            const locWaiting = state.tokens.filter(
              (t) => t.location_id === loc.id && t.status === 'WAITING'
            ).length;
            return (
              <button
                key={loc.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSelectedLocationId(loc.id);
                  setSelectedDesk(1);
                }}
                className={`min-h-[42px] px-3.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                {loc.code} · {locWaiting} waiting
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="staff-desk-select"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Active Desk
            </label>
            <select
              id="staff-desk-select"
              value={activeDesk}
              onChange={(e) => setSelectedDesk(Number(e.target.value))}
              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono text-slate-900"
            >
              {desks.map((d) => (
                <option key={d} value={d}>
                  Desk {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="staff-operator-name"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Operator
            </label>
            <input
              id="staff-operator-name"
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              className="w-36 min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* EWMA Self-Correction Receipt Banner */}
      {lastCalibration && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-sm text-emerald-950"
        >
          <div>
            <span className="font-semibold">
              EWMA Model Calibrated ({lastCalibration.tokenNumber})
            </span>
            <span className="mx-2 text-emerald-700">·</span>
            <span className="font-mono tabular-nums text-xs sm:text-sm">
              Actual {lastCalibration.actualWait.toFixed(1)}m vs Est{' '}
              {lastCalibration.estimatedWait.toFixed(1)}m → Error Δ{' '}
              {formatSignedMinutes(lastCalibration.errorDelta)}
            </span>
          </div>
          <div className="font-mono tabular-nums text-xs sm:text-sm font-semibold text-emerald-800">
            Hour {formatHourSlot(lastCalibration.hourSlot)} Bias:{' '}
            {formatSignedMinutes(lastCalibration.previousBias)} →{' '}
            {formatSignedMinutes(lastCalibration.updatedBias)}
          </div>
        </div>
      )}

      {/* Main 2-Column Staff Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Counter Operations & Active Desks */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                {summary.location.name}
              </h2>
              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                {summary.location.counter_count} counters · Current EWMA bias{' '}
                {formatSignedMinutes(summary.learnedBias)}
              </p>
            </div>
          </div>

          {/* Primary Call Next Action */}
          <div className="rounded-xl bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>Next highest-priority token</span>
              {nextUp && (
                <span className="font-mono tabular-nums font-semibold text-blue-700">
                  Score {nextUp.priority.totalScore.toFixed(1)}
                </span>
              )}
            </div>

            {nextUp ? (
              <div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-950">
                  {nextUp.token.token_number}{' '}
                  <span className="font-sans font-medium text-sm text-slate-700">
                    — {nextUp.token.student_name}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {priorityLabel(nextUp.token.priority_level)} ·{' '}
                  {nextUp.token.workload_label} · Waiting{' '}
                  {formatElapsedSeconds(nextUp.priority.elapsedSeconds)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No students waiting at {summary.location.code}. Use “Simulate 2 Arrivals” or wait for student check-ins.
              </p>
            )}

            <button
              type="button"
              disabled={!nextUp}
              onClick={() =>
                onCallNext(selectedLocationId, activeDesk, operatorName)
              }
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              <span>Call Next Token to Desk {activeDesk}</span>
            </button>
          </div>

          {/* Active Tokens at Desks (CALLED & SERVING) */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Active Desks ({summary.activeTokens.length})
            </h3>

            {summary.activeTokens.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                No active tokens currently at counters.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {summary.activeTokens.map((tok) => {
                  const draftVal =
                    actualWaitDrafts[tok.id] ??
                    String(
                      tok.actual_wait_minutes ?? tok.estimated_wait_minutes
                    );

                  return (
                    <div
                      key={tok.id}
                      className="py-3.5 first:pt-1 last:pb-0 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-mono text-slate-500">
                            Desk {tok.counter_number ?? 1} ·{' '}
                            <span
                              className={
                                tok.status === 'CALLED'
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-emerald-700 font-semibold'
                              }
                            >
                              {tok.status}
                            </span>
                          </div>
                          <div className="text-lg font-bold font-mono tabular-nums text-slate-950 mt-0.5">
                            {tok.token_number}{' '}
                            <span className="font-sans text-sm font-medium text-slate-700">
                              · {tok.student_name}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {tok.workload_label} · Est. wait{' '}
                            <span className="font-mono tabular-nums">
                              {tok.estimated_wait_minutes.toFixed(1)}m
                            </span>
                          </div>
                        </div>
                      </div>

                      {tok.status === 'CALLED' ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onCommenceService(tok.id, operatorName)}
                            className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Commence Service</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onMarkNoShow(tok.id, operatorName)}
                            className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>No-Show</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label
                              htmlFor={`actual-wait-${tok.id}`}
                              className="text-xs font-medium text-slate-700"
                            >
                              Actual wait observed (min)
                            </label>
                            <input
                              id={`actual-wait-${tok.id}`}
                              type="number"
                              step="0.5"
                              min="0.5"
                              value={draftVal}
                              onChange={(e) =>
                                setActualWaitDrafts((prev) => ({
                                  ...prev,
                                  [tok.id]: e.target.value,
                                }))
                              }
                              className="w-24 min-h-[38px] px-2.5 py-1 text-sm font-mono tabular-nums rounded-lg border border-slate-300 text-slate-900"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const parsed = Number(draftVal);
                              onCompleteService(
                                tok.id,
                                operatorName,
                                Number.isFinite(parsed) && parsed > 0
                                  ? parsed
                                  : undefined
                              );
                            }}
                            className="w-full min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                            <span>Complete Service &amp; Calibrate EWMA</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right: Dynamic Priority Queue Inspector */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Anti-Starvation Priority Queue ({rankedWaiting.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Score = BaseWeight + ExpressBonus + (ElapsedSeconds /{' '}
                {summary.service.agingDivisorSeconds}s)
              </p>
            </div>
          </div>

          {rankedWaiting.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No waiting tokens in {summary.location.name}.
            </div>
          ) : (
            <>
              {/* Desktop / Tablet Table */}
              <div className="hidden sm:block overflow-x-auto mt-2">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                      <th className="py-2.5 pr-3">Rank</th>
                      <th className="py-2.5 pr-3">Token &amp; Student</th>
                      <th className="py-2.5 pr-3">Workload</th>
                      <th className="py-2.5 pr-3 text-right">Waited</th>
                      <th className="py-2.5 pr-3 text-right">Base + Exp + Age</th>
                      <th className="py-2.5 text-right">Total Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {rankedWaiting.map((item) => (
                      <tr key={item.token.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-3 font-mono tabular-nums text-slate-500">
                          #{item.position}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="font-mono tabular-nums font-semibold text-slate-950">
                            {item.token.token_number}
                          </div>
                          <div className="text-xs text-slate-600">
                            {item.token.student_name} ·{' '}
                            {priorityLabel(item.token.priority_level)}
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-xs text-slate-600 max-w-[180px]">
                          <div className="truncate" title={item.token.workload_label}>
                            {item.token.workload_label}
                          </div>
                          {item.priority.expressReason && (
                            <div className="text-emerald-700 font-medium truncate">
                              {item.priority.expressReason}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums text-xs text-slate-600">
                          {formatElapsedSeconds(item.priority.elapsedSeconds)}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums text-xs text-slate-600">
                          {item.priority.baseWeight} + {item.priority.expressBonus} +{' '}
                          <span className="text-blue-700 font-medium">
                            {item.priority.agingBonus.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono tabular-nums font-bold text-slate-950">
                          {item.priority.totalScore.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Priority Cards */}
              <div className="sm:hidden divide-y divide-slate-100 mt-2">
                {rankedWaiting.map((item) => (
                  <div key={item.token.id} className="py-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono tabular-nums text-sm font-bold text-slate-950">
                        #{item.position} · {item.token.token_number}
                      </div>
                      <div className="font-mono tabular-nums text-sm font-bold text-blue-700">
                        {item.priority.totalScore.toFixed(1)} pts
                      </div>
                    </div>
                    <div className="text-sm text-slate-800">
                      {item.token.student_name} ·{' '}
                      <span className="text-slate-500">
                        {priorityLabel(item.token.priority_level)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {item.token.workload_label}
                    </div>
                    <div className="text-xs font-mono tabular-nums text-slate-500">
                      Base {item.priority.baseWeight} + Exp {item.priority.expressBonus} + Age{' '}
                      {item.priority.agingBonus.toFixed(1)} · Waited{' '}
                      {formatElapsedSeconds(item.priority.elapsedSeconds)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

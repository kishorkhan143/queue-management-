import React, { useMemo, useState } from 'react';
import { getEffectiveHour, getStationLiveSummary } from '../engine/queueStore';
import type { QueuePulseState } from '../engine/types';
import {
  congestionMeta,
  formatHourSlot,
  formatSignedMinutes,
  priorityLabel,
} from '../utils/formatters';

interface PublicBoardViewProps {
  state: QueuePulseState;
  nowMs: number;
}

export function PublicBoardView({ state, nowMs }: PublicBoardViewProps) {
  const [selectedStation, setSelectedStation] = useState<number | 'ALL'>('ALL');
  const effectiveHour = getEffectiveHour(state, nowMs);

  const summaries = useMemo(
    () =>
      state.locations.map((loc) => getStationLiveSummary(state, loc.id, nowMs)),
    [state, nowMs]
  );

  const visibleSummaries = useMemo(
    () =>
      selectedStation === 'ALL'
        ? summaries
        : summaries.filter((s) => s.location.id === selectedStation),
    [summaries, selectedStation]
  );

  const totalWaiting = summaries.reduce((acc, s) => acc + s.waitingCount, 0);
  const totalServing = summaries.reduce(
    (acc, s) => acc + s.activeTokens.length,
    0
  );

  const calledTokens = useMemo(
    () =>
      state.tokens
        .filter((t) => t.status === 'CALLED')
        .map((t) => ({
          token: t,
          location: state.locations.find((l) => l.id === t.location_id),
        })),
    [state.tokens, state.locations]
  );

  return (
    <div className="space-y-6">
      {/* Header & Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Live Campus Queue Board
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Public lobby display showing active desk calls, next in line, and live EWMA wait forecasts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSelectedStation('ALL')}
            className={`min-h-[36px] px-3 text-xs font-medium rounded-md cursor-pointer ${
              selectedStation === 'ALL'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Stations
          </button>
          {state.locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => setSelectedStation(loc.id)}
              className={`min-h-[36px] px-2.5 text-xs font-mono rounded-md cursor-pointer ${
                selectedStation === loc.id
                  ? 'bg-white text-slate-950 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {loc.code}
            </button>
          ))}
        </div>
      </div>

      {/* High-Contrast Airport-Style Board Container */}
      <section
        aria-label="Airport-style live queue display board"
        className="rounded-2xl bg-slate-950 text-slate-100 border border-slate-800 overflow-hidden"
      >
        {/* Board Telemetry Strip */}
        <div className="px-5 sm:px-7 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-900/70">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm font-mono tabular-nums">
            <div>
              <span className="text-slate-400">Campus Slot </span>
              <span className="text-white font-semibold">
                {formatHourSlot(effectiveHour)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Active Counters </span>
              <span className="text-emerald-400 font-semibold">
                {totalServing} Serving
              </span>
            </div>
            <div>
              <span className="text-slate-400">Total Waiting </span>
              <span className="text-amber-400 font-semibold">
                {totalWaiting} Students
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Rajalakshmi Engineering College · Central Service Hubs
          </div>
        </div>

        {/* Immediate Counter Call Banner */}
        {calledTokens.length > 0 && (
          <div className="px-5 sm:px-7 py-3.5 bg-amber-500/15 border-b border-amber-500/30 flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="text-xs font-semibold tracking-wide text-amber-300">
              Now Calling to Counter
            </span>
            {calledTokens.map(({ token, location }) => (
              <span
                key={token.id}
                className="text-sm font-mono tabular-nums text-white font-semibold"
              >
                {token.token_number} → {location?.code} Desk {token.counter_number ?? 1}{' '}
                <span className="font-sans font-normal text-amber-200">
                  ({token.student_name})
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Station Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:gap-px bg-slate-800">
          {visibleSummaries.map((summary) => {
            const {
              location,
              activeTokens,
              rankedWaiting,
              estimatedWait,
              learnedBias,
              congestion,
            } = summary;
            const cMeta = congestionMeta(congestion);

            return (
              <div
                key={location.id}
                className="bg-slate-950 p-5 sm:p-7 flex flex-col justify-between gap-6"
              >
                {/* Station Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400">
                      <span className="text-blue-400 font-semibold">
                        [{location.code}]
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{location.counter_count} Active Counters</span>
                      <span aria-hidden="true">·</span>
                      <span className={cMeta.boardTextClass}>{cMeta.label}</span>
                    </div>
                    <h2 className="mt-1.5 text-lg sm:text-xl font-bold text-white tracking-tight">
                      {location.name}
                    </h2>
                  </div>

                  <div className="text-left sm:text-right font-mono tabular-nums">
                    <div className="text-2xl font-bold text-white">
                      ~{estimatedWait.toFixed(1)}m
                    </div>
                    <div className="text-xs text-slate-400">
                      Bias {formatSignedMinutes(learnedBias)} · {rankedWaiting.length} ahead
                    </div>
                  </div>
                </div>

                {/* NOW SERVING Section */}
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-2.5">
                    Now Serving at Counters
                  </div>
                  {activeTokens.length === 0 ? (
                    <div className="py-3 px-4 rounded-xl bg-slate-900/70 border border-slate-800 text-sm text-slate-400">
                      All {location.counter_count} desks currently open — no active token
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activeTokens.map((tok) => (
                        <div
                          key={tok.id}
                          className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-slate-400">
                              Desk {tok.counter_number ?? 1} ·{' '}
                              <span
                                className={
                                  tok.status === 'CALLED'
                                    ? 'text-amber-400'
                                    : 'text-emerald-400'
                                }
                              >
                                {tok.status === 'CALLED' ? 'Calling' : 'Serving'}
                              </span>
                            </div>
                            <div className="text-xl font-bold font-mono tabular-nums text-white mt-0.5">
                              {tok.token_number}
                            </div>
                            <div className="text-xs text-slate-300 truncate">
                              {tok.student_name}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* NEXT IN LINE Section */}
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span>Next in Line (Priority Order)</span>
                    <span>Est. Wait / Score</span>
                  </div>
                  {rankedWaiting.length === 0 ? (
                    <p className="text-sm text-slate-500 py-2">
                      Queue clear — walk right up or reserve remotely.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-800/80 border-t border-slate-800/80">
                      {rankedWaiting.slice(0, 4).map((item) => (
                        <div
                          key={item.token.id}
                          className="py-2.5 flex items-center justify-between gap-3 text-sm"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono tabular-nums text-xs text-slate-500 w-5">
                              #{item.position}
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-white">
                              {item.token.token_number}
                            </span>
                            <span className="text-slate-300 truncate">
                              {item.token.student_name}
                            </span>
                            <span className="hidden sm:inline text-xs text-slate-400 truncate">
                              · {priorityLabel(item.token.priority_level)}
                            </span>
                          </div>

                          <div className="font-mono tabular-nums text-xs sm:text-sm text-right shrink-0">
                            <span className="text-amber-300 font-semibold">
                              ~{item.liveEstimatedWait.toFixed(1)}m
                            </span>
                            <span className="text-slate-500 ml-2">
                              ({item.priority.totalScore.toFixed(0)} pts)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

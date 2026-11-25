import React, { useMemo, useState } from 'react';
import { ArrowRight, Clock, Search, Star } from 'lucide-react';
import {
  getEffectiveHour,
  getRankedWaitingQueue,
  getStationLiveSummary,
} from '../engine/queueStore';
import type { QueuePulseState, QueueToken } from '../engine/types';
import {
  congestionMeta,
  formatElapsedSeconds,
  formatHourSlot,
  formatShortTime,
  formatSignedMinutes,
  priorityLabel,
  statusLabel,
  statusTextClass,
} from '../utils/formatters';

interface StudentHubViewProps {
  state: QueuePulseState;
  nowMs: number;
  trackedTokenNumber: string;
  onSelectTrackedToken: (tokenNumber: string) => void;
  onOpenJoinForStation: (locationId: number) => void;
  onCancelToken: (tokenId: number) => void;
  onSubmitFeedback: (payload: {
    tokenId: number;
    rating: number;
    perceivedWaitMinutes: number;
    comments: string;
  }) => void;
  onSetHourOverride: (hour: number | null) => void;
}

const FSM_STEPS = [
  { key: 'WAITING', label: 'Waiting' },
  { key: 'CALLED', label: 'Called' },
  { key: 'SERVING', label: 'Serving' },
  { key: 'COMPLETED', label: 'Completed' },
] as const;

function getStepIndex(status: QueueToken['status']): number {
  switch (status) {
    case 'WAITING':
      return 0;
    case 'CALLED':
      return 1;
    case 'SERVING':
      return 2;
    case 'COMPLETED':
      return 3;
    default:
      return -1;
  }
}

export function StudentHubView({
  state,
  nowMs,
  trackedTokenNumber,
  onSelectTrackedToken,
  onOpenJoinForStation,
  onCancelToken,
  onSubmitFeedback,
  onSetHourOverride,
}: StudentHubViewProps) {
  const [searchInput, setSearchInput] = useState(trackedTokenNumber);
  const [stationFeedFilter, setStationFeedFilter] = useState<number | 'ALL'>('ALL');
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [perceivedWait, setPerceivedWait] = useState<string>('');
  const [feedbackComments, setFeedbackComments] = useState<string>('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const effectiveHour = getEffectiveHour(state, nowMs);

  const stationSummaries = useMemo(
    () =>
      state.locations.map((loc) =>
        getStationLiveSummary(state, loc.id, nowMs)
      ),
    [state, nowMs]
  );

  const trackedToken = useMemo(() => {
    const query = trackedTokenNumber.trim().toUpperCase();
    if (!query) return null;
    return (
      state.tokens.find((t) => t.token_number.toUpperCase() === query) ?? null
    );
  }, [state.tokens, trackedTokenNumber]);

  const trackedLocation = useMemo(
    () =>
      trackedToken
        ? state.locations.find((l) => l.id === trackedToken.location_id) ?? null
        : null,
    [state.locations, trackedToken]
  );

  const trackedRankedInfo = useMemo(() => {
    if (!trackedToken || trackedToken.status !== 'WAITING') return null;
    const ranked = getRankedWaitingQueue(state, trackedToken.location_id, nowMs);
    return ranked.find((r) => r.token.id === trackedToken.id) ?? null;
  }, [state, trackedToken, nowMs]);

  const existingFeedback = useMemo(
    () =>
      trackedToken
        ? state.feedback.find((f) => f.token_id === trackedToken.id) ?? null
        : null,
    [state.feedback, trackedToken]
  );

  const activeCampusQueue = useMemo(() => {
    const items = stationSummaries.flatMap((summary) =>
      summary.rankedWaiting.map((ranked) => ({
        ...ranked,
        location: summary.location,
      }))
    );
    if (stationFeedFilter === 'ALL') return items;
    return items.filter((item) => item.location.id === stationFeedFilter);
  }, [stationSummaries, stationFeedFilter]);

  const recentTokens = useMemo(
    () => [...state.tokens].sort((a, b) => b.id - a.id).slice(0, 6),
    [state.tokens]
  );

  const handleTrackSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSelectTrackedToken(searchInput.trim().toUpperCase());
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackedToken) return;
    const parsedWait =
      perceivedWait.trim() !== ''
        ? Number(perceivedWait)
        : trackedToken.actual_wait_minutes ?? trackedToken.estimated_wait_minutes;

    if (!Number.isFinite(parsedWait) || parsedWait <= 0) {
      setFeedbackError('Enter a valid perceived wait duration in minutes.');
      return;
    }

    setFeedbackError(null);
    onSubmitFeedback({
      tokenId: trackedToken.id,
      rating: feedbackRating,
      perceivedWaitMinutes: parsedWait,
      comments: feedbackComments.trim(),
    });
    setFeedbackComments('');
    setPerceivedWait('');
  };

  const hourPresets: Array<{ label: string; hour: number | null }> = [
    { label: 'Live Clock', hour: null },
    { label: '09:00 Print Rush', hour: 9 },
    { label: '13:00 Lunch Peak', hour: 13 },
    { label: '15:00 Lab Practicals', hour: 15 },
  ];

  return (
    <div className="space-y-8">
      {/* Compact Hero / Context Header */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Predict and beat campus queues
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-slate-600 leading-relaxed">
            Inspect live waiting times across campus hubs, reserve a remote digital token, and track your counter call in real time.
          </p>
        </div>

        {/* Time-of-Day Rush Scenario Switcher */}
        <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              Forecast Hour: {formatHourSlot(effectiveHour)}
              {state.simulatedHourOverride !== null ? ' (Simulated Rush)' : ''}
            </span>
          </div>
          <div
            role="group"
            aria-label="Forecast hour preview"
            className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/80 w-full sm:w-auto"
          >
            {hourPresets.map((preset) => {
              const active = state.simulatedHourOverride === preset.hour;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onSetHourOverride(preset.hour)}
                  className={`min-h-[38px] sm:min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center cursor-pointer ${
                    active
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4-Column Live Campus Stations Grid */}
      <section aria-labelledby="stations-heading">
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h2
            id="stations-heading"
            className="text-base sm:text-lg font-semibold text-slate-950"
          >
            Live Campus Service Stations
          </h2>
          <p className="text-xs text-slate-500 hidden sm:block">
            Estimates include EWMA hourly bias correction and rush scaling
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
          {stationSummaries.map((summary) => {
            const { location, waitingCount, estimatedWait, learnedBias, congestion, activeTokens } =
              summary;
            const cMeta = congestionMeta(congestion);
            const servingPreview = activeTokens[0];
            const barWidth = Math.min(100, Math.max(12, Math.round((estimatedWait / 20) * 100)));

            return (
              <article
                key={location.id}
                className="flex flex-col justify-between bg-white border border-slate-200 rounded-2xl p-5 transition-colors hover:border-slate-300"
              >
                <div>
                  {/* Quiet 1-line unboxed metadata */}
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 font-mono tabular-nums">
                    <span>
                      {location.code} · {location.counter_count} counters
                    </span>
                    <span className={`font-sans font-semibold ${cMeta.textClass}`}>
                      {cMeta.label}
                    </span>
                  </div>

                  {/* Station Name */}
                  <h3 className="mt-2 text-base font-semibold text-slate-950 leading-snug">
                    {location.name}
                  </h3>

                  {/* Dominant Wait Metric */}
                  <div className="mt-4 flex items-baseline justify-between gap-2">
                    <div>
                      <span className="text-3xl font-bold font-mono tabular-nums text-slate-950">
                        ~{estimatedWait.toFixed(1)}
                      </span>
                      <span className="ml-1 text-sm text-slate-500">min</span>
                    </div>
                    <div className="text-right text-xs text-slate-500 font-mono tabular-nums">
                      <div>{waitingCount} waiting</div>
                      <div>Bias {formatSignedMinutes(learnedBias)}</div>
                    </div>
                  </div>

                  {/* Congestion bar */}
                  <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${cMeta.barClass}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  {/* Now Serving + Rush Window */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Now serving</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900 truncate">
                        {servingPreview
                          ? `${servingPreview.token_number} (Desk ${servingPreview.counter_number ?? 1})`
                          : 'Desk open'}
                      </span>
                    </div>
                    <div className="text-slate-500 truncate" title={location.rush_hours_label}>
                      Rush: {location.rush_hours_label}
                    </div>
                  </div>
                </div>

                {/* Primary Station Action */}
                <button
                  type="button"
                  onClick={() => onOpenJoinForStation(location.id)}
                  className="mt-5 w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                >
                  <span>Join {location.code} Queue</span>
                  <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* 2-Column Balanced Workspace: Live Token Tracker + Active Queue Feed */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Live Token Tracker */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Live Token Tracker
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Track queue position, anti-starvation priority score, and counter calls
              </p>
            </div>

            <form onSubmit={handleTrackSearch} className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="track-token-input" className="sr-only">
                Token number
              </label>
              <div className="relative flex-1 sm:w-44">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="track-token-input"
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="e.g. CAN-101"
                  className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm font-mono uppercase rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                />
              </div>
              <button
                type="submit"
                className="min-h-[42px] px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Track
              </button>
            </form>
          </div>

          {/* Quick Token Switcher */}
          <div className="py-3 flex flex-wrap items-center gap-1.5 border-b border-slate-100">
            <span className="text-xs text-slate-500 mr-1">Recent tokens:</span>
            {recentTokens.map((t) => {
              const isSelected =
                trackedToken?.token_number === t.token_number;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSearchInput(t.token_number);
                    onSelectTrackedToken(t.token_number);
                  }}
                  className={`min-h-[34px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-md border transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-blue-700 bg-blue-50 text-blue-800 font-semibold'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {t.token_number}
                </button>
              );
            })}
          </div>

          {/* Tracked Token Details */}
          {trackedToken && trackedLocation ? (
            <div className="pt-5 flex-1 flex flex-col justify-between space-y-5">
              {/* Alert banner when CALLED */}
              {trackedToken.status === 'CALLED' && (
                <div
                  role="status"
                  className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-950 font-medium"
                >
                  Token {trackedToken.token_number} has been called to Desk{' '}
                  {trackedToken.counter_number ?? 1} at {trackedLocation.name}. Please proceed to the counter now.
                </div>
              )}

              {/* Header info */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-800">
                      {trackedLocation.name}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{priorityLabel(trackedToken.priority_level)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Issued {formatShortTime(trackedToken.created_at)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-3">
                    <span className="text-3xl font-bold font-mono tabular-nums text-slate-950">
                      {trackedToken.token_number}
                    </span>
                    <span
                      className={`text-sm font-semibold ${statusTextClass(
                        trackedToken.status
                      )}`}
                    >
                      {statusLabel(trackedToken.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {trackedToken.student_name}{' '}
                    <span className="font-mono text-xs text-slate-500">
                      ({trackedToken.student_id})
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {trackedToken.workload_label}
                    {trackedToken.notes ? ` · ${trackedToken.notes}` : ''}
                  </p>
                </div>

                {/* Live Metric Block */}
                <div className="text-left sm:text-right">
                  <div className="text-xs text-slate-500">
                    {trackedToken.status === 'COMPLETED'
                      ? 'Actual Wait'
                      : 'Est. Wait Remaining'}
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-0.5">
                    {trackedToken.status === 'COMPLETED'
                      ? `${(trackedToken.actual_wait_minutes ?? 0).toFixed(1)} min`
                      : trackedRankedInfo
                        ? `~${trackedRankedInfo.liveEstimatedWait.toFixed(1)} min`
                        : trackedToken.status === 'SERVING' ||
                            trackedToken.status === 'CALLED'
                          ? `Desk ${trackedToken.counter_number ?? 1}`
                          : '—'}
                  </div>
                  {trackedRankedInfo && (
                    <div className="text-xs text-slate-600 font-mono tabular-nums mt-0.5">
                      Position #{trackedRankedInfo.position} ({trackedRankedInfo.studentsAhead}{' '}
                      ahead)
                    </div>
                  )}
                </div>
              </div>

              {/* FSM Lifecycle Progress Bar */}
              {getStepIndex(trackedToken.status) >= 0 && (
                <div>
                  <div className="grid grid-cols-4 gap-2">
                    {FSM_STEPS.map((step, idx) => {
                      const currentIdx = getStepIndex(trackedToken.status);
                      const reached = idx <= currentIdx;
                      const isCurrent = idx === currentIdx;
                      return (
                        <div key={step.key} className="space-y-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              reached ? 'bg-blue-700' : 'bg-slate-200'
                            }`}
                          />
                          <div
                            className={`text-xs font-medium ${
                              isCurrent
                                ? 'text-blue-700 font-semibold'
                                : reached
                                  ? 'text-slate-800'
                                  : 'text-slate-400'
                            }`}
                          >
                            {step.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Priority Score Breakdown while waiting */}
              {trackedRankedInfo && (
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 font-mono tabular-nums space-y-0.5">
                    <div>
                      Live Priority Score:{' '}
                      <strong className="text-slate-950">
                        {trackedRankedInfo.priority.totalScore.toFixed(1)}
                      </strong>{' '}
                      (Base {trackedRankedInfo.priority.baseWeight} + Express{' '}
                      {trackedRankedInfo.priority.expressBonus} + Aging{' '}
                      {trackedRankedInfo.priority.agingBonus.toFixed(1)})
                    </div>
                    <div className="text-slate-500">
                      Elapsed wait:{' '}
                      {formatElapsedSeconds(
                        trackedRankedInfo.priority.elapsedSeconds
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCancelToken(trackedToken.id)}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel Token
                  </button>
                </div>
              )}

              {/* Post-Completion Feedback Loop */}
              {trackedToken.status === 'COMPLETED' && (
                <div className="pt-4 border-t border-slate-200">
                  {existingFeedback ? (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          Feedback Submitted
                        </span>
                        <span className="text-sm font-mono tabular-nums font-semibold text-amber-700">
                          {existingFeedback.rating} / 5 Stars
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                        Perceived wait: {existingFeedback.perceived_wait_minutes.toFixed(1)}m · Actual wait:{' '}
                        {(existingFeedback.actual_wait_minutes ?? 0).toFixed(1)}m
                      </p>
                      {existingFeedback.comments && (
                        <p className="text-sm text-slate-700 mt-2">
                          “{existingFeedback.comments}”
                        </p>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleFeedbackSubmit} className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-950">
                          Rate Your Experience ({trackedToken.token_number})
                        </h3>
                        <p className="text-xs text-slate-500">
                          Compare perceived vs. actual wait to improve campus forecasting.
                        </p>
                      </div>

                      {feedbackError && (
                        <p role="alert" className="text-xs text-red-700">
                          {feedbackError}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-1" role="group" aria-label="Star rating">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setFeedbackRating(star)}
                              aria-label={`Rate ${star} stars`}
                              aria-pressed={feedbackRating === star}
                              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
                            >
                              <Star
                                className={`w-5 h-5 ${
                                  star <= feedbackRating
                                    ? 'fill-amber-500 text-amber-500'
                                    : 'text-slate-300'
                                }`}
                              />
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="perceived-wait"
                            className="text-xs font-medium text-slate-700"
                          >
                            Perceived wait (min)
                          </label>
                          <input
                            id="perceived-wait"
                            type="number"
                            step="0.5"
                            min="0.5"
                            placeholder={String(
                              trackedToken.actual_wait_minutes ??
                                trackedToken.estimated_wait_minutes
                            )}
                            value={perceivedWait}
                            onChange={(e) => setPerceivedWait(e.target.value)}
                            className="w-24 min-h-[40px] px-2.5 py-1.5 text-sm font-mono tabular-nums rounded-lg border border-slate-300"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <label htmlFor="feedback-comments" className="sr-only">
                          Feedback comments
                        </label>
                        <input
                          id="feedback-comments"
                          type="text"
                          value={feedbackComments}
                          onChange={(e) => setFeedbackComments(e.target.value)}
                          placeholder="Optional note on counter speed or wait estimate accuracy..."
                          className="flex-1 min-h-[42px] px-3 py-2 text-sm rounded-lg border border-slate-300"
                        />
                        <button
                          type="submit"
                          className="min-h-[42px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold whitespace-nowrap cursor-pointer"
                        >
                          Submit Feedback
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm font-medium text-slate-800">
                {trackedTokenNumber
                  ? `No token matching "${trackedTokenNumber}" was found.`
                  : 'Select a recent token or reserve a new one to track live progress.'}
              </p>
              <button
                type="button"
                onClick={() => onOpenJoinForStation(1)}
                className="mt-4 min-h-[44px] px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold cursor-pointer"
              >
                Reserve New Token
              </button>
            </div>
          )}
        </div>

        {/* Right: Active Waiting Queue Feed */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Active Campus Queue
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ranked dynamically by anti-starvation priority score
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setStationFeedFilter('ALL')}
                className={`min-h-[32px] px-2.5 text-xs font-medium rounded-md cursor-pointer ${
                  stationFeedFilter === 'ALL'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              {state.locations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setStationFeedFilter(loc.id)}
                  className={`min-h-[32px] px-2 text-xs font-mono rounded-md cursor-pointer ${
                    stationFeedFilter === loc.id
                      ? 'bg-white text-slate-950 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {loc.code}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-[360px] mt-1">
            {activeCampusQueue.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-600">
                  No students currently waiting in this station queue.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Counters are open for immediate walk-up or digital reservation.
                </p>
              </div>
            ) : (
              activeCampusQueue.map((item) => (
                <div
                  key={item.token.id}
                  className="py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                      <span className="font-semibold text-slate-950 text-sm">
                        {item.token.token_number}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>#{item.position}</span>
                      <span aria-hidden="true">·</span>
                      <span>Score {item.priority.totalScore.toFixed(1)}</span>
                    </div>
                    <div className="text-sm text-slate-800 truncate mt-0.5">
                      {item.token.student_name} ·{' '}
                      <span className="text-slate-500">
                        {item.token.workload_label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-semibold text-slate-900">
                        ~{item.liveEstimatedWait.toFixed(1)}m
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {priorityLabel(item.token.priority_level)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput(item.token.token_number);
                        onSelectTrackedToken(item.token.token_number);
                      }}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                    >
                      Track
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { getLearnedBias } from '../engine/ewmaPredictor';
import { createServiceLocation } from '../engine/serviceLocations';
import { getEffectiveHour } from '../engine/queueStore';
import type { PriorityLevel, QueuePulseState } from '../engine/types';
import { formatSignedMinutes, priorityLabel } from '../utils/formatters';

interface JoinQueueModalProps {
  isOpen: boolean;
  initialLocationId: number;
  state: QueuePulseState;
  nowMs: number;
  onClose: () => void;
  onSubmit: (payload: {
    locationId: number;
    studentId: string;
    studentName: string;
    priorityLevel: PriorityLevel;
    workloadParam: number;
    notes: string;
  }) => void;
}

const PRIORITY_OPTIONS: PriorityLevel[] = [
  'NORMAL',
  'EXPRESS',
  'FACULTY_STAFF',
  'EMERGENCY_DEADLINE',
];

export function JoinQueueModal({
  isOpen,
  initialLocationId,
  state,
  nowMs,
  onClose,
  onSubmit,
}: JoinQueueModalProps) {
  const [locationId, setLocationId] = useState<number>(initialLocationId);
  const [studentId, setStudentId] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');
  const [priorityLevel, setPriorityLevel] = useState<PriorityLevel>('NORMAL');
  const [workloadParam, setWorkloadParam] = useState<number>(2);
  const [notes, setNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedLocation = useMemo(
    () =>
      state.locations.find((l) => l.id === locationId) ?? state.locations[0],
    [state.locations, locationId]
  );

  const serviceInstance = useMemo(
    () => createServiceLocation(selectedLocation),
    [selectedLocation]
  );

  useEffect(() => {
    if (isOpen) {
      setLocationId(initialLocationId);
      setErrorMessage(null);
    }
  }, [isOpen, initialLocationId]);

  useEffect(() => {
    const cfg = serviceInstance.workloadConfig;
    setWorkloadParam(cfg.defaultValue);
  }, [serviceInstance]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const preview = useMemo(() => {
    const hour = getEffectiveHour(state, nowMs);
    const learnedBias = getLearnedBias(
      state.learnedBiasMatrix,
      selectedLocation.id,
      hour
    );
    const waitingAhead = state.tokens.filter(
      (t) => t.location_id === selectedLocation.id && t.status === 'WAITING'
    ).length;
    const occupiedCounters = state.tokens.filter(
      (t) =>
        t.location_id === selectedLocation.id &&
        (t.status === 'CALLED' || t.status === 'SERVING')
    ).length;

    const estWait = serviceInstance.calculateEstimatedWait({
      queueAhead: waitingAhead,
      workloadParam,
      priorityLevel,
      hourOfDay: hour,
      learnedBias,
      occupiedCounters,
    });
    const priority = serviceInstance.calculatePriority(
      priorityLevel,
      workloadParam,
      0
    );
    const rushMultiplier = serviceInstance.getRushMultiplier(hour);

    return {
      estWait,
      learnedBias,
      waitingAhead,
      priority,
      rushMultiplier,
    };
  }, [state, nowMs, selectedLocation, serviceInstance, workloadParam, priorityLevel]);

  if (!isOpen) return null;

  const cfg = serviceInstance.workloadConfig;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedId = studentId.trim();
    const cleanedName = studentName.trim();

    if (!cleanedId) {
      setErrorMessage('Please enter your Student ID or Roll Number (e.g., STU-8823).');
      return;
    }
    if (!cleanedName) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (
      !Number.isFinite(workloadParam) ||
      workloadParam < cfg.min ||
      workloadParam > cfg.max
    ) {
      setErrorMessage(
        `${cfg.label} must be between ${cfg.min} and ${cfg.max}.`
      );
      return;
    }

    setErrorMessage(null);
    onSubmit({
      locationId: selectedLocation.id,
      studentId: cleanedId,
      studentName: cleanedName,
      priorityLevel,
      workloadParam,
      notes: notes.trim(),
    });
    setStudentId('');
    setStudentName('');
    setNotes('');
    setPriorityLevel('NORMAL');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-950/55 backdrop-blur-xs p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-queue-title"
    >
      <div className="w-full md:max-w-xl bg-white rounded-t-3xl md:rounded-2xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Mobile grab handle */}
        <div className="md:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-slate-200">
          <div>
            <h2
              id="join-queue-title"
              className="text-lg font-bold text-slate-950"
            >
              Reserve Digital Queue Token
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Instant remote queueing with polymorphic wait-time estimation
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reserve token dialog"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form
          onSubmit={handleFormSubmit}
          noValidate
          className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5"
        >
          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-800"
            >
              {errorMessage}
            </div>
          )}

          {/* Station Select */}
          <div>
            <label
              htmlFor="queue-station"
              className="block text-sm font-medium text-slate-800 mb-1.5"
            >
              Campus Service Station
            </label>
            <select
              id="queue-station"
              value={locationId}
              onChange={(e) => setLocationId(Number(e.target.value))}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            >
              {state.locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code}) — {loc.counter_count} counters
                </option>
              ))}
            </select>
          </div>

          {/* Student ID + Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="student-id"
                className="block text-sm font-medium text-slate-800 mb-1.5"
              >
                Student ID / Roll No.
              </label>
              <input
                id="student-id"
                type="text"
                required
                placeholder="e.g., STU-8823"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
              />
            </div>

            <div>
              <label
                htmlFor="student-name"
                className="block text-sm font-medium text-slate-800 mb-1.5"
              >
                Student Full Name
              </label>
              <input
                id="student-name"
                type="text"
                required
                placeholder="e.g., Alex Chen"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
              />
            </div>
          </div>

          {/* Priority Level */}
          <fieldset>
            <legend className="block text-sm font-medium text-slate-800 mb-2">
              Priority Tier
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {PRIORITY_OPTIONS.map((opt) => {
                const active = priorityLevel === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPriorityLevel(opt)}
                    aria-pressed={active}
                    className={`min-h-[44px] px-3 py-2 text-left rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-blue-700 bg-blue-50/70 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {priorityLabel(opt)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Service-Specific Polymorphic Workload Input */}
          <div>
            <label
              htmlFor="workload-param"
              className="block text-sm font-medium text-slate-800 mb-1.5"
            >
              {cfg.label}
            </label>

            {cfg.options ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cfg.options.map((opt) => {
                  const active = workloadParam === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setWorkloadParam(opt.value)}
                      aria-pressed={active}
                      className={`min-h-[44px] px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-700 bg-blue-50/70 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-sm font-medium leading-snug">
                        {opt.label}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                        Base duration {opt.durationLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <input
                    id="workload-param"
                    type="number"
                    min={cfg.min}
                    max={cfg.max}
                    value={workloadParam}
                    onChange={(e) =>
                      setWorkloadParam(Math.max(cfg.min, Number(e.target.value) || cfg.min))
                    }
                    className="w-28 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
                  />
                  <span className="text-sm text-slate-600">{cfg.unit}</span>

                  {selectedLocation.service_type === 'PHOTOCOPY' && (
                    <div className="flex flex-wrap gap-1.5 ml-auto">
                      {[4, 10, 40, 150].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setWorkloadParam(preset)}
                          className={`min-h-[36px] px-2.5 text-xs font-mono tabular-nums rounded-md border transition-colors cursor-pointer ${
                            workloadParam === preset
                              ? 'border-blue-700 bg-blue-50 text-blue-800'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {preset}p
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedLocation.service_type === 'CANTEEN' && (
                    <div className="flex flex-wrap gap-1.5 ml-auto">
                      {[1, 2, 4, 6].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setWorkloadParam(preset)}
                          className={`min-h-[36px] px-2.5 text-xs font-mono tabular-nums rounded-md border transition-colors cursor-pointer ${
                            workloadParam === preset
                              ? 'border-blue-700 bg-blue-50 text-blue-800'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500 mt-1.5">{cfg.helperText}</p>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="token-notes"
              className="block text-sm font-medium text-slate-800 mb-1.5"
            >
              Order / Request Notes (optional)
            </label>
            <input
              id="token-notes"
              type="text"
              placeholder={
                selectedLocation.service_type === 'CANTEEN'
                  ? 'e.g., Cold Coffee & Sandwich'
                  : selectedLocation.service_type === 'PHOTOCOPY'
                    ? 'e.g., Lab report double-sided'
                    : 'e.g., Bonafide letter for internship'
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            />
          </div>

          {/* Live Polymorphic Prediction Summary Strip */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">
                Predicted Wait Estimate
              </span>
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                ~{preview.estWait.toFixed(1)} min
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 font-mono tabular-nums">
              <span>Queue ahead: {preview.waitingAhead}</span>
              <span aria-hidden="true">·</span>
              <span>Rush: {preview.rushMultiplier.toFixed(2)}x</span>
              <span aria-hidden="true">·</span>
              <span>EWMA bias: {formatSignedMinutes(preview.learnedBias)}</span>
              <span aria-hidden="true">·</span>
              <span>Initial priority: {preview.priority.totalScore}</span>
            </div>
            {preview.priority.expressReason && (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                Express bonus active: {preview.priority.expressReason}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-sm font-semibold text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              Confirm Digital Token
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

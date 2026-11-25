import type {
  CongestionLevel,
  PriorityLevel,
  QueuePulseState,
  TokenStatus,
} from '../engine/types';

export const STORAGE_KEY = 'queuepulse_state_v1';

export function loadPersistedState(): QueuePulseState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QueuePulseState;
    if (
      !parsed ||
      !Array.isArray(parsed.locations) ||
      !Array.isArray(parsed.tokens) ||
      !Array.isArray(parsed.events) ||
      !Array.isArray(parsed.history)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedState(state: QueuePulseState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in restricted contexts
  }
}

export function clearPersistedState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function formatHourSlot(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

export function formatSignedMinutes(val: number): string {
  const rounded = Number(val.toFixed(1));
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}m`;
}

export function formatElapsedSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins === 0) return `${rem}s`;
  return `${mins}m ${String(rem).padStart(2, '0')}s`;
}

export function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--';
  }
}

export function priorityLabel(level: PriorityLevel): string {
  switch (level) {
    case 'NORMAL':
      return 'Normal';
    case 'EXPRESS':
      return 'Express';
    case 'FACULTY_STAFF':
      return 'Faculty / Staff';
    case 'EMERGENCY_DEADLINE':
      return 'Emergency Deadline';
  }
}

export function statusLabel(status: TokenStatus): string {
  switch (status) {
    case 'WAITING':
      return 'Waiting in Queue';
    case 'CALLED':
      return 'Called to Counter';
    case 'SERVING':
      return 'Now Serving';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'NO_SHOW':
      return 'No-Show';
  }
}

export function congestionMeta(level: CongestionLevel): {
  label: string;
  textClass: string;
  barClass: string;
  boardTextClass: string;
} {
  switch (level) {
    case 'FAST':
      return {
        label: 'Fast Line',
        textClass: 'text-emerald-700',
        barClass: 'bg-emerald-600',
        boardTextClass: 'text-emerald-400',
      };
    case 'MODERATE':
      return {
        label: 'Moderate',
        textClass: 'text-amber-700',
        barClass: 'bg-amber-500',
        boardTextClass: 'text-amber-400',
      };
    case 'PEAK':
      return {
        label: 'Peak Rush',
        textClass: 'text-red-700',
        barClass: 'bg-red-600',
        boardTextClass: 'text-rose-400',
      };
  }
}

export function statusTextClass(status: TokenStatus): string {
  switch (status) {
    case 'WAITING':
      return 'text-blue-700';
    case 'CALLED':
      return 'text-amber-700';
    case 'SERVING':
      return 'text-emerald-700';
    case 'COMPLETED':
      return 'text-slate-600';
    case 'CANCELLED':
      return 'text-slate-500';
    case 'NO_SHOW':
      return 'text-red-700';
  }
}

import type { StationAnalytics, WaitTimeHistoryRecord } from './types';

export const EWMA_ALPHA = 0.25;

export function biasKey(locationId: number, hour: number): string {
  const normalizedHour = ((Math.floor(hour) % 24) + 24) % 24;
  return `${locationId}:${normalizedHour}`;
}

export function getLearnedBias(
  matrix: Record<string, number>,
  locationId: number,
  hour: number
): number {
  const val = matrix[biasKey(locationId, hour)];
  return typeof val === 'number' && Number.isFinite(val) ? val : 0;
}

/**
 * Self-correcting EWMA update rule:
 * ErrorDelta (Δ) = ActualWaitMinutes - EstimatedWaitMinutes
 * LearnedBias[loc, hour] = (1 - α) * LearnedBias[loc, hour] + (α * ErrorDelta)
 */
export function computeEwmaBiasUpdate(
  currentBias: number,
  estimatedWaitMinutes: number,
  actualWaitMinutes: number,
  alpha: number = EWMA_ALPHA
): { errorDelta: number; nextBias: number } {
  const errorDelta = Number((actualWaitMinutes - estimatedWaitMinutes).toFixed(2));
  const rawNext = (1 - alpha) * currentBias + alpha * errorDelta;
  // Clamp to sensible bounds [-10, +20] minutes
  const clamped = Math.max(-10, Math.min(20, rawNext));
  const nextBias = Number(clamped.toFixed(2));
  return { errorDelta, nextBias };
}

/**
 * Rebuilds the learned bias matrix sequentially from historical WaitTimeHistory rows.
 */
export function buildInitialBiasMatrix(
  history: WaitTimeHistoryRecord[],
  alpha: number = EWMA_ALPHA
): Record<string, number> {
  const matrix: Record<string, number> = {};
  for (const row of history) {
    const key = biasKey(row.location_id, row.time_slot_hour);
    const prev = matrix[key] ?? 0;
    const { nextBias } = computeEwmaBiasUpdate(
      prev,
      row.estimated_wait_minutes,
      row.actual_wait_minutes,
      alpha
    );
    matrix[key] = nextBias;
  }
  return matrix;
}

/**
 * Computes MAE, <=3m accuracy percentage, current-hour benchmark, and 24-hour peak profile.
 */
export function computeStationAnalytics(
  locationId: number,
  history: WaitTimeHistoryRecord[],
  biasMatrix: Record<string, number>,
  currentHour: number
): StationAnalytics {
  const locRows = history.filter((r) => r.location_id === locationId);
  const totalSamples = locRows.length;

  let absErrorSum = 0;
  let withinTolerance = 0;

  for (const row of locRows) {
    const absErr = Math.abs(row.actual_wait_minutes - row.estimated_wait_minutes);
    absErrorSum += absErr;
    if (absErr <= 3.0) {
      withinTolerance += 1;
    }
  }

  const mae = totalSamples > 0 ? Number((absErrorSum / totalSamples).toFixed(2)) : 0;
  const accuracyWithin3m =
    totalSamples > 0 ? Number(((withinTolerance / totalSamples) * 100).toFixed(1)) : 100;

  // Campus operational hours 08:00 to 19:00 plus any recorded hours
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const hourlyProfile = hours.map((hour) => {
    const slotRows = locRows.filter((r) => r.time_slot_hour === hour);
    const avgWait =
      slotRows.length > 0
        ? Number(
            (
              slotRows.reduce((acc, r) => acc + r.actual_wait_minutes, 0) /
              slotRows.length
            ).toFixed(1)
          )
        : 0;
    return {
      hour,
      avgWait,
      learnedBias: getLearnedBias(biasMatrix, locationId, hour),
      sampleCount: slotRows.length,
    };
  });

  const currentSlotRows = locRows.filter((r) => r.time_slot_hour === currentHour);
  const currentHourBenchmark =
    currentSlotRows.length > 0
      ? Number(
          (
            currentSlotRows.reduce((acc, r) => acc + r.actual_wait_minutes, 0) /
            currentSlotRows.length
          ).toFixed(1)
        )
      : locRows.length > 0
        ? Number(
            (
              locRows.reduce((acc, r) => acc + r.actual_wait_minutes, 0) /
              locRows.length
            ).toFixed(1)
          )
        : 0;

  return {
    locationId,
    currentHour,
    currentHourBenchmark,
    learnedBias: getLearnedBias(biasMatrix, locationId, currentHour),
    mae,
    accuracyWithin3m,
    totalSamples,
    hourlyProfile,
  };
}

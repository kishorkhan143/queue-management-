import type {
  CongestionLevel,
  LocationRecord,
  PriorityBreakdown,
  PriorityLevel,
} from './types';

export const BASE_PRIORITY_WEIGHTS: Record<PriorityLevel, number> = {
  NORMAL: 10,
  EXPRESS: 25,
  FACULTY_STAFF: 35,
  EMERGENCY_DEADLINE: 50,
};

export interface WaitCalculationInput {
  queueAhead: number;
  workloadParam: number;
  priorityLevel: PriorityLevel;
  hourOfDay: number;
  learnedBias: number;
  occupiedCounters?: number;
}

export interface WorkloadConfig {
  label: string;
  unit: string;
  min: number;
  max: number;
  defaultValue: number;
  helperText: string;
  options?: Array<{ value: number; label: string; durationLabel: string }>;
}

/**
 * Abstract polymorphic base class modeling service-specific queuing dynamics,
 * priority aging divisors, express lane eligibility, and wait calculations.
 */
export abstract class ServiceLocation {
  readonly record: LocationRecord;

  constructor(record: LocationRecord) {
    this.record = record;
  }

  abstract get agingDivisorSeconds(): number;
  abstract get workloadConfig(): WorkloadConfig;
  abstract formatWorkload(workloadParam: number): string;
  abstract calculateSingleServiceMinutes(
    workloadParam: number,
    priorityLevel: PriorityLevel
  ): number;
  abstract getRushMultiplier(hourOfDay: number): number;
  abstract getExpressBonus(
    workloadParam: number,
    priorityLevel: PriorityLevel
  ): { bonus: number; reason: string | null };

  calculatePriority(
    priorityLevel: PriorityLevel,
    workloadParam: number,
    elapsedSecondsWaited: number
  ): PriorityBreakdown {
    const baseWeight = BASE_PRIORITY_WEIGHTS[priorityLevel];
    const { bonus: expressBonus, reason: expressReason } = this.getExpressBonus(
      workloadParam,
      priorityLevel
    );
    const clampedElapsed = Math.max(0, elapsedSecondsWaited);
    const agingBonus = Number(
      (clampedElapsed / this.agingDivisorSeconds).toFixed(2)
    );
    const totalScore = Number((baseWeight + expressBonus + agingBonus).toFixed(2));

    return {
      baseWeight,
      expressBonus,
      agingBonus,
      totalScore,
      elapsedSeconds: Math.round(clampedElapsed),
      expressReason,
    };
  }

  calculateEstimatedWait(input: WaitCalculationInput): number {
    const activeCounters = Math.max(1, this.record.counter_count);
    const serviceTime = this.calculateSingleServiceMinutes(
      input.workloadParam,
      input.priorityLevel
    );
    const rushMultiplier = this.getRushMultiplier(input.hourOfDay);

    // If queueAhead === 0, estimate turnaround based on counter occupancy
    const effectiveBatches =
      input.queueAhead > 0
        ? Math.ceil(input.queueAhead / activeCounters)
        : input.occupiedCounters !== undefined &&
            input.occupiedCounters >= activeCounters
          ? 0.75
          : 0.45;

    const rawWait =
      effectiveBatches * serviceTime * rushMultiplier + input.learnedBias;

    return Number(Math.max(1.0, rawWait).toFixed(1));
  }

  classifyCongestion(estimatedWaitMinutes: number, waitingCount: number): CongestionLevel {
    if (estimatedWaitMinutes >= 12 || waitingCount >= 6) {
      return 'PEAK';
    }
    if (estimatedWaitMinutes >= 5.5 || waitingCount >= 3) {
      return 'MODERATE';
    }
    return 'FAST';
  }
}

export class CanteenService extends ServiceLocation {
  get agingDivisorSeconds(): number {
    return 15; // +1.0 priority per 15 seconds
  }

  get workloadConfig(): WorkloadConfig {
    return {
      label: 'Food & Beverage Items',
      unit: 'items',
      min: 1,
      max: 12,
      defaultValue: 2,
      helperText:
        'Each item adds ~0.45m prep time. Single grab-and-go item (1) earns an Express discount (+15 priority).',
    };
  }

  formatWorkload(workloadParam: number): string {
    const items = Math.max(1, Math.round(workloadParam));
    return items === 1
      ? '1 item (Grab & Go)'
      : `${items} food/beverage items`;
  }

  calculateSingleServiceMinutes(
    workloadParam: number,
    priorityLevel: PriorityLevel
  ): number {
    const items = Math.max(1, Math.round(workloadParam));
    const base = this.record.base_service_minutes + items * 0.45;
    if (items === 1) {
      // Grab-and-go express discount
      return Number(Math.max(1.5, base * 0.62).toFixed(2));
    }
    if (priorityLevel === 'EXPRESS') {
      return Number((base * 0.85).toFixed(2));
    }
    return Number(base.toFixed(2));
  }

  getRushMultiplier(hourOfDay: number): number {
    if (hourOfDay >= 12 && hourOfDay < 14) {
      return 1.35; // Peak lunch rush
    }
    if (hourOfDay >= 17 && hourOfDay <= 18) {
      return 1.18; // Evening snack rush
    }
    return 1.0;
  }

  getExpressBonus(
    workloadParam: number,
    priorityLevel: PriorityLevel
  ): { bonus: number; reason: string | null } {
    if (Math.round(workloadParam) === 1) {
      return {
        bonus: 15,
        reason: 'Grab & Go single item (+15)',
      };
    }
    if (priorityLevel === 'EXPRESS') {
      return {
        bonus: 10,
        reason: 'Express meal tray (+10)',
      };
    }
    return { bonus: 0, reason: null };
  }
}

export class PhotocopyService extends ServiceLocation {
  get agingDivisorSeconds(): number {
    return 60; // +1.0 priority per 60 seconds
  }

  get workloadConfig(): WorkloadConfig {
    return {
      label: 'Document Page Count',
      unit: 'pages',
      min: 1,
      max: 300,
      defaultValue: 8,
      helperText:
        'Short print jobs (≤10 pages) automatically qualify for the Express Print Lane (+25 priority) to bypass long books.',
    };
  }

  formatWorkload(workloadParam: number): string {
    const pages = Math.max(1, Math.round(workloadParam));
    return pages <= 10
      ? `${pages} ${pages === 1 ? 'page' : 'pages'} (Express Lane)`
      : `${pages} pages (Standard Print)`;
  }

  isExpressEligible(pages: number): boolean {
    return pages <= 10;
  }

  calculateSingleServiceMinutes(
    workloadParam: number,
    _priorityLevel: PriorityLevel
  ): number {
    const pages = Math.max(1, Math.round(workloadParam));
    if (pages <= 10) {
      return Number((this.record.base_service_minutes + pages * 0.08).toFixed(2));
    }
    return Number((this.record.base_service_minutes + pages * 0.06).toFixed(2));
  }

  getRushMultiplier(hourOfDay: number): number {
    if (hourOfDay >= 9 && hourOfDay < 11) {
      return 1.35; // Morning class prep rush
    }
    if (hourOfDay >= 14 && hourOfDay <= 15) {
      return 1.2; // Afternoon lab manual rush
    }
    return 1.0;
  }

  getExpressBonus(
    workloadParam: number,
    _priorityLevel: PriorityLevel
  ): { bonus: number; reason: string | null } {
    if (this.isExpressEligible(workloadParam)) {
      return {
        bonus: 25,
        reason: 'Express print lane ≤10 pages (+25)',
      };
    }
    return { bonus: 0, reason: null };
  }
}

const OFFICE_TIERS: Array<{ value: number; label: string; minutes: number }> = [
  { value: 1, label: 'Fee Receipt Verification', minutes: 3.0 },
  { value: 2, label: 'Transcript / Bonafide Issuance', minutes: 5.5 },
  { value: 3, label: 'Scholarship Verification', minutes: 8.0 },
  { value: 4, label: 'Complex Academic Grievance', minutes: 12.0 },
];

export class CampusOfficeService extends ServiceLocation {
  get agingDivisorSeconds(): number {
    return 30; // +1.0 priority per 30 seconds
  }

  get workloadConfig(): WorkloadConfig {
    return {
      label: 'Inquiry Complexity Tier',
      unit: 'tier',
      min: 1,
      max: 4,
      defaultValue: 1,
      helperText:
        '4 structured complexity tiers (3.0m to 12.0m). Emergency deadline requests earn +40 priority points.',
      options: OFFICE_TIERS.map((tier) => ({
        value: tier.value,
        label: tier.label,
        durationLabel: `${tier.minutes.toFixed(1)}m`,
      })),
    };
  }

  formatWorkload(workloadParam: number): string {
    const tier =
      OFFICE_TIERS.find((t) => t.value === Math.round(workloadParam)) ??
      OFFICE_TIERS[0];
    return `Tier ${tier.value}: ${tier.label}`;
  }

  calculateSingleServiceMinutes(
    workloadParam: number,
    _priorityLevel: PriorityLevel
  ): number {
    const tier =
      OFFICE_TIERS.find((t) => t.value === Math.round(workloadParam)) ??
      OFFICE_TIERS[0];
    return tier.minutes;
  }

  getRushMultiplier(hourOfDay: number): number {
    if (hourOfDay >= 10 && hourOfDay < 13) {
      return 1.3; // Midday admin paperwork surge
    }
    return 1.0;
  }

  getExpressBonus(
    _workloadParam: number,
    priorityLevel: PriorityLevel
  ): { bonus: number; reason: string | null } {
    if (priorityLevel === 'EMERGENCY_DEADLINE') {
      return {
        bonus: 40,
        reason: 'Emergency deadline request (+40)',
      };
    }
    return { bonus: 0, reason: null };
  }
}

const LAB_BENCHES: Array<{ value: number; label: string; minutes: number }> = [
  { value: 1, label: 'Component Issue / Return Desk', minutes: 3.0 },
  { value: 2, label: 'PC / Simulation Workstation', minutes: 8.0 },
  { value: 3, label: 'Electronics Hardware Bench', minutes: 12.0 },
  { value: 4, label: 'GPU Server / Fume Hood Slot', minutes: 16.0 },
];

export class LaboratoryService extends ServiceLocation {
  get agingDivisorSeconds(): number {
    return 45; // +1.0 priority per 45 seconds
  }

  get workloadConfig(): WorkloadConfig {
    return {
      label: 'Workstation / Bench Allocation',
      unit: 'bench',
      min: 1,
      max: 4,
      defaultValue: 1,
      helperText:
        'Component Issue/Return runs on express 3.0m turnaround (+20 priority); practical bench slots reserve longer blocks.',
      options: LAB_BENCHES.map((bench) => ({
        value: bench.value,
        label: bench.label,
        durationLabel: `${bench.minutes.toFixed(1)}m`,
      })),
    };
  }

  formatWorkload(workloadParam: number): string {
    const bench =
      LAB_BENCHES.find((b) => b.value === Math.round(workloadParam)) ??
      LAB_BENCHES[0];
    return bench.label;
  }

  calculateSingleServiceMinutes(
    workloadParam: number,
    _priorityLevel: PriorityLevel
  ): number {
    const bench =
      LAB_BENCHES.find((b) => b.value === Math.round(workloadParam)) ??
      LAB_BENCHES[0];
    return bench.minutes;
  }

  getRushMultiplier(hourOfDay: number): number {
    if (hourOfDay >= 14 && hourOfDay < 17) {
      return 1.3; // Afternoon practical session surge
    }
    return 1.0;
  }

  getExpressBonus(
    workloadParam: number,
    _priorityLevel: PriorityLevel
  ): { bonus: number; reason: string | null } {
    if (Math.round(workloadParam) === 1) {
      return {
        bonus: 20,
        reason: 'Express component desk (+20)',
      };
    }
    return { bonus: 0, reason: null };
  }
}

/**
 * Polymorphic factory instantiating the concrete ServiceLocation subclass.
 */
export function createServiceLocation(record: LocationRecord): ServiceLocation {
  switch (record.service_type) {
    case 'CANTEEN':
      return new CanteenService(record);
    case 'PHOTOCOPY':
      return new PhotocopyService(record);
    case 'CAMPUS_OFFICE':
      return new CampusOfficeService(record);
    case 'LAB':
      return new LaboratoryService(record);
  }
}

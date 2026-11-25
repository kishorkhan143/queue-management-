export type ServiceType = 'CANTEEN' | 'PHOTOCOPY' | 'CAMPUS_OFFICE' | 'LAB';

export type PriorityLevel =
  | 'NORMAL'
  | 'EXPRESS'
  | 'FACULTY_STAFF'
  | 'EMERGENCY_DEADLINE';

export type TokenStatus =
  | 'WAITING'
  | 'CALLED'
  | 'SERVING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type ServiceEventType =
  | 'ARRIVED'
  | 'CALLED'
  | 'SERVICE_STARTED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type CongestionLevel = 'FAST' | 'MODERATE' | 'PEAK';

export type LabBenchType =
  | 'COMPONENT_ISSUE'
  | 'PC_WORKSTATION'
  | 'ELECTRONICS_BENCH'
  | 'GPU_SERVER';

export interface LocationRecord {
  id: number;
  code: 'CAN' | 'PHOTO' | 'OFFICE' | 'LAB';
  name: string;
  service_type: ServiceType;
  counter_count: number;
  base_service_minutes: number;
  rush_hours_label: string;
  is_active: boolean;
  created_at: string;
}

export interface QueueToken {
  id: number;
  token_number: string;
  location_id: number;
  student_id: string;
  student_name: string;
  priority_level: PriorityLevel;
  status: TokenStatus;
  /**
   * Polymorphic service parameter:
   * - CANTEEN: number of food/beverage items (1..15)
   * - PHOTOCOPY: page count (1..300)
   * - CAMPUS_OFFICE: inquiry complexity tier (1..4)
   * - LAB: bench mode index (1=Component Issue, 2=PC, 3=Electronics, 4=GPU/Fume)
   */
  workload_param: number;
  workload_label: string;
  notes: string;
  counter_number: number | null;
  estimated_wait_minutes: number;
  actual_wait_minutes: number | null;
  service_duration_minutes: number | null;
  created_at: string;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ServiceEvent {
  id: number;
  token_id: number;
  token_number: string;
  location_id: number;
  event_type: ServiceEventType;
  counter_number: number;
  operator_name: string;
  remarks: string;
  event_timestamp: string;
}

export interface WaitTimeHistoryRecord {
  id: number;
  location_id: number;
  time_slot_hour: number; // 0..23
  day_of_week: number; // 1..7 (1=Mon, 7=Sun)
  queue_length_at_arrival: number;
  estimated_wait_minutes: number;
  actual_wait_minutes: number;
  error_delta_minutes: number;
  service_duration_minutes: number;
  recorded_at: string;
}

export interface FeedbackRecord {
  id: number;
  token_id: number;
  token_number: string;
  location_id: number;
  rating: number; // 1..5
  perceived_wait_minutes: number;
  actual_wait_minutes: number | null;
  comments: string;
  created_at: string;
}

export interface PriorityBreakdown {
  baseWeight: number;
  expressBonus: number;
  agingBonus: number;
  totalScore: number;
  elapsedSeconds: number;
  expressReason: string | null;
}

export interface StationAnalytics {
  locationId: number;
  currentHour: number;
  currentHourBenchmark: number;
  learnedBias: number;
  mae: number;
  accuracyWithin3m: number;
  totalSamples: number;
  hourlyProfile: Array<{
    hour: number;
    avgWait: number;
    learnedBias: number;
    sampleCount: number;
  }>;
}

export interface QueuePulseState {
  locations: LocationRecord[];
  tokens: QueueToken[];
  events: ServiceEvent[];
  history: WaitTimeHistoryRecord[];
  feedback: FeedbackRecord[];
  /** Keyed by `${locationId}:${hour}` -> learned EWMA offset in minutes */
  learnedBiasMatrix: Record<string, number>;
  /** Sequential counter per location code for token numbering */
  tokenCounters: Record<string, number>;
  /** Simulated virtual time offset in seconds (allows demoing aging cleanly) */
  simulatedOffsetSeconds: number;
  /** Optional simulated hour override (0..23) or null for live clock */
  simulatedHourOverride: number | null;
}

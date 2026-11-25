import {
  EWMA_ALPHA,
  biasKey,
  buildInitialBiasMatrix,
  computeEwmaBiasUpdate,
  getLearnedBias,
} from './ewmaPredictor';
import { createServiceLocation } from './serviceLocations';
import type {
  FeedbackRecord,
  LocationRecord,
  PriorityBreakdown,
  PriorityLevel,
  QueuePulseState,
  QueueToken,
  ServiceEvent,
  WaitTimeHistoryRecord,
} from './types';

export interface RankedWaitingToken {
  token: QueueToken;
  priority: PriorityBreakdown;
  position: number;
  studentsAhead: number;
  liveEstimatedWait: number;
}

export interface IssueTokenInput {
  locationId: number;
  studentId: string;
  studentName: string;
  priorityLevel: PriorityLevel;
  workloadParam: number;
  notes?: string;
}

export interface CompleteServiceResult {
  nextState: QueuePulseState;
  completedToken: QueueToken;
  errorDelta: number;
  previousBias: number;
  updatedBias: number;
  hourSlot: number;
}

export function getEffectiveNowMs(
  state: QueuePulseState,
  realNowMs: number = Date.now()
): number {
  return realNowMs + state.simulatedOffsetSeconds * 1000;
}

export function getEffectiveHour(
  state: QueuePulseState,
  realNowMs: number = Date.now()
): number {
  if (state.simulatedHourOverride !== null) {
    return state.simulatedHourOverride;
  }
  return new Date(getEffectiveNowMs(state, realNowMs)).getHours();
}

const DEFAULT_LOCATIONS: LocationRecord[] = [
  {
    id: 1,
    code: 'CAN',
    name: 'Central Campus Food Court',
    service_type: 'CANTEEN',
    counter_count: 3,
    base_service_minutes: 3.5,
    rush_hours_label: '12:00–14:00 (Lunch), 17:00–18:30',
    is_active: true,
    created_at: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 2,
    code: 'PHOTO',
    name: 'Express Print & Xerox Hub',
    service_type: 'PHOTOCOPY',
    counter_count: 2,
    base_service_minutes: 2.0,
    rush_hours_label: '09:00–11:00 (Class prep), 14:00–15:30',
    is_active: true,
    created_at: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 3,
    code: 'OFFICE',
    name: 'Student Affairs & Registrar',
    service_type: 'CAMPUS_OFFICE',
    counter_count: 4,
    base_service_minutes: 6.0,
    rush_hours_label: '10:30–13:00 (Admin paperwork)',
    is_active: true,
    created_at: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 4,
    code: 'LAB',
    name: 'AI & Electronics Systems Lab',
    service_type: 'LAB',
    counter_count: 2,
    base_service_minutes: 12.0,
    rush_hours_label: '14:00–17:00 (Afternoon practicals)',
    is_active: true,
    created_at: '2026-10-01T08:00:00.000Z',
  },
];

/**
 * Generates deterministic 44 historical WaitTimeHistory rows matching the report's
 * TC-01 seed specification and 24-hour peak profiles (Fig 4.4).
 */
function buildSeedHistory(): WaitTimeHistoryRecord[] {
  const templates: Array<{
    location_id: number;
    entries: Array<[hour: number, queueLen: number, est: number, actual: number, dur: number]>;
  }> = [
    // Location 1: Central Campus Food Court (11 rows, peaks at 12:00-13:00 Lunch & 17:00)
    {
      location_id: 1,
      entries: [
        [8, 2, 4.2, 4.5, 3.4],
        [9, 3, 5.0, 5.2, 3.8],
        [10, 2, 4.5, 4.1, 3.5],
        [11, 3, 5.1, 5.4, 3.9],
        [12, 11, 14.2, 16.4, 4.4],
        [13, 14, 16.8, 19.0, 4.6],
        [14, 5, 7.2, 6.8, 3.7],
        [15, 3, 5.1, 4.9, 3.5],
        [16, 4, 6.0, 6.4, 3.6],
        [17, 8, 9.8, 11.2, 4.1],
        [18, 4, 6.2, 5.5, 3.6],
      ],
    },
    // Location 2: Express Print & Xerox Hub (11 rows, peaks at 09:00-11:00 Morning Rush)
    {
      location_id: 2,
      entries: [
        [8, 4, 6.5, 7.8, 2.4],
        [9, 9, 11.5, 14.0, 2.9],
        [10, 8, 10.8, 12.6, 2.7],
        [11, 9, 11.8, 14.1, 2.8],
        [12, 3, 4.4, 4.2, 2.1],
        [13, 2, 3.8, 4.0, 2.0],
        [14, 6, 7.4, 8.9, 2.5],
        [15, 3, 4.5, 4.1, 2.2],
        [16, 2, 3.6, 3.4, 2.0],
        [17, 3, 4.4, 4.0, 2.1],
        [18, 1, 3.4, 1.3, 1.8],
      ],
    },
    // Location 3: Student Affairs & Registrar (11 rows, peaks at 11:00-13:00 Admin Paperwork)
    {
      location_id: 3,
      entries: [
        [8, 3, 8.5, 9.0, 5.5],
        [9, 6, 13.5, 15.0, 6.2],
        [10, 8, 16.5, 18.4, 6.8],
        [11, 12, 21.8, 24.8, 7.4],
        [12, 11, 20.5, 23.2, 7.1],
        [13, 12, 22.0, 25.0, 7.5],
        [14, 7, 14.0, 15.6, 6.1],
        [15, 6, 13.8, 15.0, 6.0],
        [16, 5, 11.2, 12.1, 5.8],
        [17, 6, 13.6, 15.0, 6.0],
        [18, 2, 5.0, 5.0, 4.5],
      ],
    },
    // Location 4: AI & Electronics Systems Lab (11 rows, peaks at 14:00-16:00 Practicals)
    {
      location_id: 4,
      entries: [
        [8, 1, 4.0, 3.8, 3.2],
        [9, 2, 6.5, 6.2, 8.0],
        [10, 3, 9.0, 9.6, 9.5],
        [11, 2, 7.0, 6.8, 8.2],
        [12, 1, 4.2, 4.0, 3.5],
        [13, 2, 6.0, 6.4, 7.8],
        [14, 5, 15.2, 17.8, 12.5],
        [15, 6, 17.0, 19.6, 13.2],
        [16, 5, 14.8, 16.5, 12.0],
        [17, 3, 9.2, 8.8, 8.5],
        [18, 1, 4.0, 3.5, 3.4],
      ],
    },
  ];

  const records: WaitTimeHistoryRecord[] = [];
  let id = 1;
  for (const loc of templates) {
    for (const [hour, queueLen, est, actual, dur] of loc.entries) {
      records.push({
        id: id++,
        location_id: loc.location_id,
        time_slot_hour: hour,
        day_of_week: ((id % 5) + 1),
        queue_length_at_arrival: queueLen,
        estimated_wait_minutes: est,
        actual_wait_minutes: actual,
        error_delta_minutes: Number((actual - est).toFixed(2)),
        service_duration_minutes: dur,
        recorded_at: `2026-10-14T${String(hour).padStart(2, '0')}:20:00.000Z`,
      });
    }
  }
  return records;
}

/**
 * Creates a rich, deterministic initial QueuePulse state matching the report's
 * seed setup (4 locations, 44 history rows, live tokens on desks and waiting).
 */
export function createSeedState(nowMs: number = Date.now()): QueuePulseState {
  const history = buildSeedHistory();
  const learnedBiasMatrix = buildInitialBiasMatrix(history, EWMA_ALPHA);

  const minsAgo = (m: number) => new Date(nowMs - m * 60_000).toISOString();

  const tokens: QueueToken[] = [
    {
      id: 1,
      token_number: 'CAN-101',
      location_id: 1,
      student_id: 'STU-7410',
      student_name: 'Priya Sharma',
      priority_level: 'NORMAL',
      status: 'SERVING',
      workload_param: 3,
      workload_label: '3 food/beverage items',
      notes: 'Veg Thali & Lime Soda',
      counter_number: 1,
      estimated_wait_minutes: 4.5,
      actual_wait_minutes: 4.2,
      service_duration_minutes: null,
      created_at: minsAgo(7),
      called_at: minsAgo(3),
      started_at: minsAgo(2.8),
      completed_at: null,
    },
    {
      id: 2,
      token_number: 'PHOTO-101',
      location_id: 2,
      student_id: 'STU-7902',
      student_name: 'Ananya Rao',
      priority_level: 'NORMAL',
      status: 'SERVING',
      workload_param: 6,
      workload_label: '6 pages (Express Lane)',
      notes: 'DBMS Lab Record Sheet',
      counter_number: 1,
      estimated_wait_minutes: 2.4,
      actual_wait_minutes: 2.1,
      service_duration_minutes: null,
      created_at: minsAgo(5),
      called_at: minsAgo(3),
      started_at: minsAgo(2.9),
      completed_at: null,
    },
    {
      id: 3,
      token_number: 'PHOTO-102',
      location_id: 2,
      student_id: 'STU-8120',
      student_name: 'Karthik Subramanian',
      priority_level: 'NORMAL',
      status: 'WAITING',
      workload_param: 145,
      workload_label: '145 pages (Standard Print)',
      notes: 'Final Year Thesis Draft Spiral Bind',
      counter_number: null,
      estimated_wait_minutes: 6.0,
      actual_wait_minutes: null,
      service_duration_minutes: null,
      created_at: minsAgo(4),
      called_at: null,
      started_at: null,
      completed_at: null,
    },
    {
      id: 4,
      token_number: 'OFFICE-101',
      location_id: 3,
      student_id: 'STU-8315',
      student_name: 'Divya Krishnan',
      priority_level: 'EMERGENCY_DEADLINE',
      status: 'WAITING',
      workload_param: 2,
      workload_label: 'Tier 2: Transcript / Bonafide Issuance',
      notes: 'Scholarship portal closes 5:00 PM',
      counter_number: null,
      estimated_wait_minutes: 7.0,
      actual_wait_minutes: null,
      service_duration_minutes: null,
      created_at: minsAgo(3),
      called_at: null,
      started_at: null,
      completed_at: null,
    },
    {
      id: 5,
      token_number: 'LAB-101',
      location_id: 4,
      student_id: 'STU-8504',
      student_name: 'Rohan Varma',
      priority_level: 'NORMAL',
      status: 'WAITING',
      workload_param: 1,
      workload_label: 'Component Issue / Return Desk',
      notes: 'Returning Raspberry Pi 5 & sensor kit',
      counter_number: null,
      estimated_wait_minutes: 3.0,
      actual_wait_minutes: null,
      service_duration_minutes: null,
      created_at: minsAgo(2),
      called_at: null,
      started_at: null,
      completed_at: null,
    },
    {
      id: 6,
      token_number: 'CAN-100',
      location_id: 1,
      student_id: 'STU-7108',
      student_name: 'Arjun Menon',
      priority_level: 'NORMAL',
      status: 'COMPLETED',
      workload_param: 2,
      workload_label: '2 food/beverage items',
      notes: 'Masala Dosa & Filter Coffee',
      counter_number: 2,
      estimated_wait_minutes: 4.8,
      actual_wait_minutes: 5.1,
      service_duration_minutes: 3.6,
      created_at: minsAgo(24),
      called_at: minsAgo(19),
      started_at: minsAgo(18.9),
      completed_at: minsAgo(15.3),
    },
    {
      id: 7,
      token_number: 'CAN-099',
      location_id: 1,
      student_id: 'STU-7635',
      student_name: 'Nikhil Rajendran',
      priority_level: 'NORMAL',
      status: 'WAITING',
      workload_param: 4,
      workload_label: '4 food/beverage items',
      notes: 'South Indian Meals & Buttermilk',
      counter_number: null,
      estimated_wait_minutes: 6.2,
      actual_wait_minutes: null,
      service_duration_minutes: null,
      created_at: minsAgo(6.5),
      called_at: null,
      started_at: null,
      completed_at: null,
    },
  ];

  const events: ServiceEvent[] = [
    {
      id: 1,
      token_id: 6,
      token_number: 'CAN-100',
      location_id: 1,
      event_type: 'COMPLETED',
      counter_number: 2,
      operator_name: 'Suresh K.',
      remarks: 'Actual wait 5.1m vs est 4.8m (Δ +0.3m)',
      event_timestamp: minsAgo(15.3),
    },
    {
      id: 2,
      token_id: 1,
      token_number: 'CAN-101',
      location_id: 1,
      event_type: 'ARRIVED',
      counter_number: 0,
      operator_name: 'Student Portal',
      remarks: 'Digital token issued (3 food/beverage items)',
      event_timestamp: minsAgo(7),
    },
    {
      id: 8,
      token_id: 7,
      token_number: 'CAN-099',
      location_id: 1,
      event_type: 'ARRIVED',
      counter_number: 0,
      operator_name: 'Student Portal',
      remarks: 'Digital token issued (4 food/beverage items)',
      event_timestamp: minsAgo(6.5),
    },
    {
      id: 3,
      token_id: 1,
      token_number: 'CAN-101',
      location_id: 1,
      event_type: 'SERVICE_STARTED',
      counter_number: 1,
      operator_name: 'Suresh K.',
      remarks: 'Called to Desk 1 and service commenced',
      event_timestamp: minsAgo(2.8),
    },
    {
      id: 4,
      token_id: 2,
      token_number: 'PHOTO-101',
      location_id: 2,
      event_type: 'SERVICE_STARTED',
      counter_number: 1,
      operator_name: 'Meena R.',
      remarks: 'Express lane ≤10 pages served at Desk 1',
      event_timestamp: minsAgo(2.9),
    },
    {
      id: 5,
      token_id: 3,
      token_number: 'PHOTO-102',
      location_id: 2,
      event_type: 'ARRIVED',
      counter_number: 0,
      operator_name: 'Student Portal',
      remarks: 'Standard thesis print job queued (145 pages)',
      event_timestamp: minsAgo(4),
    },
    {
      id: 6,
      token_id: 4,
      token_number: 'OFFICE-101',
      location_id: 3,
      event_type: 'ARRIVED',
      counter_number: 0,
      operator_name: 'Student Portal',
      remarks: 'Emergency deadline bonafide request queued',
      event_timestamp: minsAgo(3),
    },
    {
      id: 7,
      token_id: 5,
      token_number: 'LAB-101',
      location_id: 4,
      event_type: 'ARRIVED',
      counter_number: 0,
      operator_name: 'Student Portal',
      remarks: 'Component return desk express token queued',
      event_timestamp: minsAgo(2),
    },
  ];

  const feedback: FeedbackRecord[] = [
    {
      id: 1,
      token_id: 6,
      token_number: 'CAN-100',
      location_id: 1,
      rating: 5,
      perceived_wait_minutes: 5.0,
      actual_wait_minutes: 5.1,
      comments: 'Estimate was spot-on, grabbed my tray right between lectures.',
      created_at: minsAgo(12),
    },
  ];

  return {
    locations: DEFAULT_LOCATIONS,
    tokens,
    events,
    history,
    feedback,
    learnedBiasMatrix,
    tokenCounters: {
      CAN: 101,
      PHOTO: 102,
      OFFICE: 101,
      LAB: 101,
    },
    simulatedOffsetSeconds: 0,
    simulatedHourOverride: null,
  };
}

/**
 * Returns waiting tokens for a location sorted by dynamic anti-starvation PriorityScore descending,
 * with FIFO created_at tie-breaker.
 */
export function getRankedWaitingQueue(
  state: QueuePulseState,
  locationId: number,
  realNowMs: number = Date.now()
): RankedWaitingToken[] {
  const location = state.locations.find((l) => l.id === locationId);
  if (!location) return [];

  const service = createServiceLocation(location);
  const nowMs = getEffectiveNowMs(state, realNowMs);
  const hour = getEffectiveHour(state, realNowMs);
  const learnedBias = getLearnedBias(state.learnedBiasMatrix, locationId, hour);
  const occupiedCounters = state.tokens.filter(
    (t) => t.location_id === locationId && (t.status === 'CALLED' || t.status === 'SERVING')
  ).length;

  const waiting = state.tokens.filter(
    (t) => t.location_id === locationId && t.status === 'WAITING'
  );

  const scored = waiting.map((token) => {
    const elapsedSeconds = Math.max(
      0,
      (nowMs - new Date(token.created_at).getTime()) / 1000
    );
    const priority = service.calculatePriority(
      token.priority_level,
      token.workload_param,
      elapsedSeconds
    );
    return { token, priority };
  });

  scored.sort((a, b) => {
    if (b.priority.totalScore !== a.priority.totalScore) {
      return b.priority.totalScore - a.priority.totalScore;
    }
    return (
      new Date(a.token.created_at).getTime() -
      new Date(b.token.created_at).getTime()
    );
  });

  return scored.map((item, idx) => ({
    token: item.token,
    priority: item.priority,
    position: idx + 1,
    studentsAhead: idx,
    liveEstimatedWait: service.calculateEstimatedWait({
      queueAhead: idx,
      workloadParam: item.token.workload_param,
      priorityLevel: item.token.priority_level,
      hourOfDay: hour,
      learnedBias,
      occupiedCounters,
    }),
  }));
}

export function getStationLiveSummary(
  state: QueuePulseState,
  locationId: number,
  realNowMs: number = Date.now()
) {
  const location = state.locations.find((l) => l.id === locationId);
  if (!location) {
    throw new Error(`Unknown location ${locationId}`);
  }
  const service = createServiceLocation(location);
  const hour = getEffectiveHour(state, realNowMs);
  const learnedBias = getLearnedBias(state.learnedBiasMatrix, locationId, hour);
  const rankedWaiting = getRankedWaitingQueue(state, locationId, realNowMs);
  const activeTokens = state.tokens.filter(
    (t) => t.location_id === locationId && (t.status === 'CALLED' || t.status === 'SERVING')
  );
  const defaultParam = service.workloadConfig.defaultValue;

  const estimatedWait = service.calculateEstimatedWait({
    queueAhead: rankedWaiting.length,
    workloadParam: defaultParam,
    priorityLevel: 'NORMAL',
    hourOfDay: hour,
    learnedBias,
    occupiedCounters: activeTokens.length,
  });

  const congestion = service.classifyCongestion(estimatedWait, rankedWaiting.length);

  return {
    location,
    service,
    waitingCount: rankedWaiting.length,
    rankedWaiting,
    activeTokens,
    estimatedWait,
    learnedBias,
    congestion,
    rushMultiplier: service.getRushMultiplier(hour),
    hour,
  };
}

/**
 * Issues a new digital queue token, computes polymorphic EWMA wait estimate,
 * and appends an ARRIVED audit row in ServiceEvents.
 */
export function issueToken(
  state: QueuePulseState,
  input: IssueTokenInput,
  realNowMs: number = Date.now()
): { nextState: QueuePulseState; token: QueueToken } {
  const location = state.locations.find((l) => l.id === input.locationId);
  if (!location) {
    throw new Error('Selected campus station does not exist.');
  }
  const trimmedStudentId = input.studentId.trim().toUpperCase();
  const trimmedName = input.studentName.trim();
  if (!trimmedStudentId) {
    throw new Error('Student roll number / ID is required.');
  }
  if (!trimmedName) {
    throw new Error('Student full name is required.');
  }

  const service = createServiceLocation(location);
  const nowMs = getEffectiveNowMs(state, realNowMs);
  const nowIso = new Date(nowMs).toISOString();
  const hour = getEffectiveHour(state, realNowMs);
  const learnedBias = getLearnedBias(state.learnedBiasMatrix, location.id, hour);

  const waitingAhead = state.tokens.filter(
    (t) => t.location_id === location.id && t.status === 'WAITING'
  ).length;
  const occupiedCounters = state.tokens.filter(
    (t) => t.location_id === location.id && (t.status === 'CALLED' || t.status === 'SERVING')
  ).length;

  const estimatedWait = service.calculateEstimatedWait({
    queueAhead: waitingAhead,
    workloadParam: input.workloadParam,
    priorityLevel: input.priorityLevel,
    hourOfDay: hour,
    learnedBias,
    occupiedCounters,
  });

  const nextSeq = (state.tokenCounters[location.code] ?? 100) + 1;
  const tokenNumber = `${location.code}-${nextSeq}`;
  const nextTokenId =
    state.tokens.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  const nextEventId =
    state.events.reduce((max, e) => Math.max(max, e.id), 0) + 1;

  const workloadLabel = service.formatWorkload(input.workloadParam);

  const token: QueueToken = {
    id: nextTokenId,
    token_number: tokenNumber,
    location_id: location.id,
    student_id: trimmedStudentId,
    student_name: trimmedName,
    priority_level: input.priorityLevel,
    status: 'WAITING',
    workload_param: input.workloadParam,
    workload_label: workloadLabel,
    notes: (input.notes ?? '').trim(),
    counter_number: null,
    estimated_wait_minutes: estimatedWait,
    actual_wait_minutes: null,
    service_duration_minutes: null,
    created_at: nowIso,
    called_at: null,
    started_at: null,
    completed_at: null,
  };

  const event: ServiceEvent = {
    id: nextEventId,
    token_id: token.id,
    token_number: token.token_number,
    location_id: location.id,
    event_type: 'ARRIVED',
    counter_number: 0,
    operator_name: 'Student Portal',
    remarks: `Issued ${token.token_number} (${workloadLabel}, est ~${estimatedWait.toFixed(1)}m)`,
    event_timestamp: nowIso,
  };

  const nextState: QueuePulseState = {
    ...state,
    tokens: [...state.tokens, token],
    events: [event, ...state.events],
    tokenCounters: {
      ...state.tokenCounters,
      [location.code]: nextSeq,
    },
  };

  return { nextState, token };
}

/**
 * Staff Operator Action: Calls the highest-priority WAITING token to the specified counter desk.
 */
export function callNextToken(
  state: QueuePulseState,
  locationId: number,
  counterNumber: number,
  operatorName: string,
  realNowMs: number = Date.now()
): { nextState: QueuePulseState; calledToken: QueueToken | null } {
  const ranked = getRankedWaitingQueue(state, locationId, realNowMs);
  if (ranked.length === 0) {
    return { nextState: state, calledToken: null };
  }

  const top = ranked[0];
  const nowIso = new Date(getEffectiveNowMs(state, realNowMs)).toISOString();
  const nextEventId =
    state.events.reduce((max, e) => Math.max(max, e.id), 0) + 1;

  const updatedToken: QueueToken = {
    ...top.token,
    status: 'CALLED',
    counter_number: counterNumber,
    called_at: nowIso,
  };

  const event: ServiceEvent = {
    id: nextEventId,
    token_id: updatedToken.id,
    token_number: updatedToken.token_number,
    location_id: locationId,
    event_type: 'CALLED',
    counter_number: counterNumber,
    operator_name: operatorName.trim() || 'Counter Operator',
    remarks: `Selected with Priority ${top.priority.totalScore.toFixed(1)} (Base ${top.priority.baseWeight} + Express ${top.priority.expressBonus} + Aging ${top.priority.agingBonus.toFixed(1)})`,
    event_timestamp: nowIso,
  };

  const nextState: QueuePulseState = {
    ...state,
    tokens: state.tokens.map((t) =>
      t.id === updatedToken.id ? updatedToken : t
    ),
    events: [event, ...state.events],
  };

  return { nextState, calledToken: updatedToken };
}

/**
 * Staff Operator Action: Moves a CALLED token into SERVING and calculates actual wait time.
 */
export function commenceService(
  state: QueuePulseState,
  tokenId: number,
  operatorName: string,
  realNowMs: number = Date.now()
): { nextState: QueuePulseState; token: QueueToken } {
  const existing = state.tokens.find((t) => t.id === tokenId);
  if (!existing || existing.status !== 'CALLED') {
    throw new Error('Only a CALLED token can commence service.');
  }

  const nowMs = getEffectiveNowMs(state, realNowMs);
  const nowIso = new Date(nowMs).toISOString();
  const actualWaitMins = Number(
    Math.max(0.5, (nowMs - new Date(existing.created_at).getTime()) / 60_000).toFixed(1)
  );

  const updatedToken: QueueToken = {
    ...existing,
    status: 'SERVING',
    started_at: nowIso,
    actual_wait_minutes: actualWaitMins,
  };

  const nextEventId =
    state.events.reduce((max, e) => Math.max(max, e.id), 0) + 1;

  const event: ServiceEvent = {
    id: nextEventId,
    token_id: updatedToken.id,
    token_number: updatedToken.token_number,
    location_id: updatedToken.location_id,
    event_type: 'SERVICE_STARTED',
    counter_number: updatedToken.counter_number ?? 1,
    operator_name: operatorName.trim() || 'Counter Operator',
    remarks: `Student arrived at Desk ${updatedToken.counter_number ?? 1}; actual wait ${actualWaitMins.toFixed(1)}m`,
    event_timestamp: nowIso,
  };

  return {
    nextState: {
      ...state,
      tokens: state.tokens.map((t) => (t.id === tokenId ? updatedToken : t)),
      events: [event, ...state.events],
    },
    token: updatedToken,
  };
}

/**
 * Staff Operator Action: Completes a SERVING token, logs ServiceEvents + WaitTimeHistory,
 * and triggers Self-Correcting EWMA Bias Calibration.
 */
export function completeService(
  state: QueuePulseState,
  tokenId: number,
  operatorName: string,
  actualWaitOverrideMinutes?: number,
  realNowMs: number = Date.now()
): CompleteServiceResult {
  const existing = state.tokens.find((t) => t.id === tokenId);
  if (!existing || (existing.status !== 'SERVING' && existing.status !== 'CALLED')) {
    throw new Error('Only a SERVING or CALLED token can be completed.');
  }

  const nowMs = getEffectiveNowMs(state, realNowMs);
  const nowIso = new Date(nowMs).toISOString();
  const hourSlot = getEffectiveHour(state, realNowMs);
  const jsDay = new Date(nowMs).getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;

  const computedWait =
    existing.actual_wait_minutes ??
    Number(
      Math.max(0.5, (nowMs - new Date(existing.created_at).getTime()) / 60_000).toFixed(1)
    );

  const actualWaitMinutes =
    typeof actualWaitOverrideMinutes === 'number' &&
    Number.isFinite(actualWaitOverrideMinutes) &&
    actualWaitOverrideMinutes > 0
      ? Number(actualWaitOverrideMinutes.toFixed(1))
      : computedWait;

  const startedAtMs = existing.started_at
    ? new Date(existing.started_at).getTime()
    : nowMs - 120_000;
  const serviceDurationMinutes = Number(
    Math.max(1.0, (nowMs - startedAtMs) / 60_000).toFixed(1)
  );

  const previousBias = getLearnedBias(
    state.learnedBiasMatrix,
    existing.location_id,
    hourSlot
  );
  const { errorDelta, nextBias } = computeEwmaBiasUpdate(
    previousBias,
    existing.estimated_wait_minutes,
    actualWaitMinutes,
    EWMA_ALPHA
  );

  const completedToken: QueueToken = {
    ...existing,
    status: 'COMPLETED',
    started_at: existing.started_at ?? nowIso,
    completed_at: nowIso,
    actual_wait_minutes: actualWaitMinutes,
    service_duration_minutes: serviceDurationMinutes,
  };

  const nextEventId =
    state.events.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const nextHistoryId =
    state.history.reduce((max, h) => Math.max(max, h.id), 0) + 1;

  const deltaSign = errorDelta >= 0 ? '+' : '';
  const event: ServiceEvent = {
    id: nextEventId,
    token_id: completedToken.id,
    token_number: completedToken.token_number,
    location_id: completedToken.location_id,
    event_type: 'COMPLETED',
    counter_number: completedToken.counter_number ?? 1,
    operator_name: operatorName.trim() || 'Counter Operator',
    remarks: `Completed (Actual ${actualWaitMinutes.toFixed(1)}m vs Est ${completedToken.estimated_wait_minutes.toFixed(1)}m, Δ ${deltaSign}${errorDelta.toFixed(1)}m → Bias ${nextBias >= 0 ? '+' : ''}${nextBias.toFixed(2)}m)`,
    event_timestamp: nowIso,
  };

  const waitingAtLocation = state.tokens.filter(
    (t) => t.location_id === existing.location_id && t.status === 'WAITING'
  ).length;

  const historyRow: WaitTimeHistoryRecord = {
    id: nextHistoryId,
    location_id: completedToken.location_id,
    time_slot_hour: hourSlot,
    day_of_week: dayOfWeek,
    queue_length_at_arrival: waitingAtLocation,
    estimated_wait_minutes: completedToken.estimated_wait_minutes,
    actual_wait_minutes: actualWaitMinutes,
    error_delta_minutes: errorDelta,
    service_duration_minutes: serviceDurationMinutes,
    recorded_at: nowIso,
  };

  const nextState: QueuePulseState = {
    ...state,
    tokens: state.tokens.map((t) =>
      t.id === completedToken.id ? completedToken : t
    ),
    events: [event, ...state.events],
    history: [...state.history, historyRow],
    learnedBiasMatrix: {
      ...state.learnedBiasMatrix,
      [biasKey(completedToken.location_id, hourSlot)]: nextBias,
    },
  };

  return {
    nextState,
    completedToken,
    errorDelta,
    previousBias,
    updatedBias: nextBias,
    hourSlot,
  };
}

export function cancelToken(
  state: QueuePulseState,
  tokenId: number,
  actorName: string = 'Student Portal',
  realNowMs: number = Date.now()
): QueuePulseState {
  const existing = state.tokens.find((t) => t.id === tokenId);
  if (!existing || existing.status !== 'WAITING') {
    return state;
  }

  const nowIso = new Date(getEffectiveNowMs(state, realNowMs)).toISOString();
  const nextEventId =
    state.events.reduce((max, e) => Math.max(max, e.id), 0) + 1;

  const event: ServiceEvent = {
    id: nextEventId,
    token_id: existing.id,
    token_number: existing.token_number,
    location_id: existing.location_id,
    event_type: 'CANCELLED',
    counter_number: 0,
    operator_name: actorName,
    remarks: 'Token cancelled by student while waiting',
    event_timestamp: nowIso,
  };

  return {
    ...state,
    tokens: state.tokens.map((t) =>
      t.id === tokenId ? { ...t, status: 'CANCELLED', completed_at: nowIso } : t
    ),
    events: [event, ...state.events],
  };
}

export function markNoShow(
  state: QueuePulseState,
  tokenId: number,
  operatorName: string,
  realNowMs: number = Date.now()
): QueuePulseState {
  const existing = state.tokens.find((t) => t.id === tokenId);
  if (!existing || existing.status !== 'CALLED') {
    return state;
  }

  const nowIso = new Date(getEffectiveNowMs(state, realNowMs)).toISOString();
  const nextEventId =
    state.events.reduce((max, e) => Math.max(max, e.id), 0) + 1;

  const event: ServiceEvent = {
    id: nextEventId,
    token_id: existing.id,
    token_number: existing.token_number,
    location_id: existing.location_id,
    event_type: 'NO_SHOW',
    counter_number: existing.counter_number ?? 1,
    operator_name: operatorName.trim() || 'Counter Operator',
    remarks: `Student absent at Desk ${existing.counter_number ?? 1}; desk freed`,
    event_timestamp: nowIso,
  };

  return {
    ...state,
    tokens: state.tokens.map((t) =>
      t.id === tokenId ? { ...t, status: 'NO_SHOW', completed_at: nowIso } : t
    ),
    events: [event, ...state.events],
  };
}

export function submitFeedback(
  state: QueuePulseState,
  input: {
    tokenId: number;
    rating: number;
    perceivedWaitMinutes: number;
    comments: string;
  },
  realNowMs: number = Date.now()
): { nextState: QueuePulseState; record: FeedbackRecord } {
  const token = state.tokens.find((t) => t.id === input.tokenId);
  if (!token) {
    throw new Error('Token not found for feedback.');
  }
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const perceivedWait = Math.max(0.5, Number(input.perceivedWaitMinutes.toFixed(1)));
  const nextId = state.feedback.reduce((max, f) => Math.max(max, f.id), 0) + 1;

  const record: FeedbackRecord = {
    id: nextId,
    token_id: token.id,
    token_number: token.token_number,
    location_id: token.location_id,
    rating,
    perceived_wait_minutes: perceivedWait,
    actual_wait_minutes: token.actual_wait_minutes,
    comments: input.comments.trim(),
    created_at: new Date(getEffectiveNowMs(state, realNowMs)).toISOString(),
  };

  return {
    nextState: {
      ...state,
      feedback: [record, ...state.feedback],
    },
    record,
  };
}

const DEMO_STUDENTS = [
  { id: 'STU-8901', name: 'Meera Nair', note: 'Quick bite between labs' },
  { id: 'STU-8914', name: 'Siddharth Rao', note: 'OS assignment print' },
  { id: 'STU-8928', name: 'Kavya Venkatesh', note: 'Semester fee verification' },
  { id: 'STU-8942', name: 'Vikramaditya S.', note: 'Arduino kit bench request' },
  { id: 'STU-8955', name: 'Sneha Sundaram', note: 'Filter coffee grab-and-go' },
  { id: 'STU-8967', name: 'Pranav Joshi', note: 'ML project report print' },
];

export function simulateCampusBurst(
  state: QueuePulseState,
  locationId: number,
  realNowMs: number = Date.now()
): QueuePulseState {
  const loc = state.locations.find((l) => l.id === locationId);
  if (!loc) return state;

  let next = state;
  const seedBase = state.tokens.length;
  const samples = [
    {
      student: DEMO_STUDENTS[seedBase % DEMO_STUDENTS.length],
      priority: 'NORMAL' as PriorityLevel,
      workload: loc.service_type === 'PHOTOCOPY' ? 64 : loc.service_type === 'CANTEEN' ? 4 : 2,
    },
    {
      student: DEMO_STUDENTS[(seedBase + 1) % DEMO_STUDENTS.length],
      priority: 'EXPRESS' as PriorityLevel,
      workload: loc.service_type === 'PHOTOCOPY' ? 5 : 1,
    },
  ];

  for (const sample of samples) {
    const res = issueToken(
      next,
      {
        locationId,
        studentId: sample.student.id,
        studentName: sample.student.name,
        priorityLevel: sample.priority,
        workloadParam: sample.workload,
        notes: sample.student.note,
      },
      realNowMs
    );
    next = res.nextState;
  }
  return next;
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Generates clean ANSI SQL DDL + DML export (`schema.sql`) covering all 5 normalized tables,
 * foreign keys with ON DELETE CASCADE, check constraints, and indexes (TC-10).
 */
export function exportSchemaSql(state: QueuePulseState): string {
  const lines: string[] = [
    '-- ============================================================================',
    '-- QueuePulse Normalized Relational Schema (3NF) & Live Data Snapshot',
    '-- Generated ANSI SQL DDL & DML Export (schema.sql)',
    '-- ============================================================================',
    '',
    'CREATE TABLE Locations (',
    '  id INTEGER PRIMARY KEY,',
    '  code VARCHAR(10) NOT NULL UNIQUE,',
    '  name VARCHAR(100) NOT NULL,',
    '  service_type VARCHAR(30) NOT NULL,',
    '  counter_count INTEGER NOT NULL DEFAULT 1,',
    '  base_service_minutes REAL NOT NULL DEFAULT 3.0,',
    '  is_active BOOLEAN NOT NULL DEFAULT TRUE,',
    '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    ');',
    '',
    'CREATE TABLE QueueTokens (',
    '  id INTEGER PRIMARY KEY,',
    '  token_number VARCHAR(20) NOT NULL UNIQUE,',
    '  location_id INTEGER NOT NULL,',
    '  student_id VARCHAR(30) NOT NULL,',
    '  student_name VARCHAR(100) NOT NULL,',
    "  priority_level VARCHAR(25) NOT NULL DEFAULT 'NORMAL',",
    "  status VARCHAR(20) NOT NULL DEFAULT 'WAITING',",
    '  workload_param INTEGER NOT NULL DEFAULT 1,',
    '  counter_number INTEGER,',
    '  estimated_wait_minutes REAL NOT NULL,',
    '  actual_wait_minutes REAL,',
    '  service_duration_minutes REAL,',
    '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,',
    '  FOREIGN KEY (location_id) REFERENCES Locations(id) ON DELETE CASCADE',
    ');',
    '',
    'CREATE TABLE ServiceEvents (',
    '  id INTEGER PRIMARY KEY,',
    '  token_id INTEGER NOT NULL,',
    '  location_id INTEGER NOT NULL,',
    '  event_type VARCHAR(30) NOT NULL,',
    '  counter_number INTEGER DEFAULT 0,',
    '  operator_name VARCHAR(50),',
    '  remarks TEXT,',
    '  event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,',
    '  FOREIGN KEY (token_id) REFERENCES QueueTokens(id) ON DELETE CASCADE,',
    '  FOREIGN KEY (location_id) REFERENCES Locations(id) ON DELETE CASCADE',
    ');',
    '',
    'CREATE TABLE WaitTimeHistory (',
    '  id INTEGER PRIMARY KEY,',
    '  location_id INTEGER NOT NULL,',
    '  time_slot_hour INTEGER NOT NULL CHECK (time_slot_hour BETWEEN 0 AND 23),',
    '  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),',
    '  queue_length_at_arrival INTEGER NOT NULL DEFAULT 0,',
    '  estimated_wait_minutes REAL NOT NULL,',
    '  actual_wait_minutes REAL NOT NULL,',
    '  error_delta_minutes REAL NOT NULL,',
    '  service_duration_minutes REAL NOT NULL,',
    '  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,',
    '  FOREIGN KEY (location_id) REFERENCES Locations(id) ON DELETE CASCADE',
    ');',
    '',
    'CREATE TABLE Feedback (',
    '  id INTEGER PRIMARY KEY,',
    '  token_id INTEGER NOT NULL UNIQUE,',
    '  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),',
    '  perceived_wait_minutes REAL NOT NULL,',
    '  comments TEXT,',
    '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,',
    '  FOREIGN KEY (token_id) REFERENCES QueueTokens(id) ON DELETE CASCADE',
    ');',
    '',
    'CREATE INDEX idx_tokens_location_status ON QueueTokens(location_id, status);',
    'CREATE INDEX idx_events_token_ts ON ServiceEvents(token_id, event_timestamp);',
    'CREATE INDEX idx_history_loc_hour ON WaitTimeHistory(location_id, time_slot_hour);',
    '',
    '-- Seed & Live Locations',
  ];

  for (const loc of state.locations) {
    lines.push(
      `INSERT INTO Locations (id, code, name, service_type, counter_count, base_service_minutes, is_active) VALUES (${loc.id}, '${sqlEscape(loc.code)}', '${sqlEscape(loc.name)}', '${sqlEscape(loc.service_type)}', ${loc.counter_count}, ${loc.base_service_minutes}, ${loc.is_active ? 'TRUE' : 'FALSE'});`
    );
  }

  lines.push('', '-- Active & Historical QueueTokens');
  for (const t of state.tokens) {
    lines.push(
      `INSERT INTO QueueTokens (id, token_number, location_id, student_id, student_name, priority_level, status, workload_param, counter_number, estimated_wait_minutes, actual_wait_minutes) VALUES (${t.id}, '${sqlEscape(t.token_number)}', ${t.location_id}, '${sqlEscape(t.student_id)}', '${sqlEscape(t.student_name)}', '${t.priority_level}', '${t.status}', ${t.workload_param}, ${t.counter_number ?? 'NULL'}, ${t.estimated_wait_minutes}, ${t.actual_wait_minutes ?? 'NULL'});`
    );
  }

  return lines.join('\n');
}

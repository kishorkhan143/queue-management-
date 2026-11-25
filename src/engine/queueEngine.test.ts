import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CanteenService,
  CampusOfficeService,
  LaboratoryService,
  PhotocopyService,
  createServiceLocation,
} from './serviceLocations';
import { computeEwmaBiasUpdate } from './ewmaPredictor';
import {
  callNextToken,
  commenceService,
  completeService,
  createSeedState,
  exportSchemaSql,
  getRankedWaitingQueue,
  issueToken,
  submitFeedback,
} from './queueStore';

const FIXED_NOW = Date.parse('2026-10-15T12:30:00.000Z');

test('TC-01: DBMS tables and seed data initialize with 4 locations and 44 history rows', () => {
  const state = createSeedState(FIXED_NOW);
  assert.equal(state.locations.length, 4);
  assert.equal(state.history.length, 44);
  assert.ok(state.tokens.length >= 5);
  assert.ok(state.events.length >= 5);
  assert.ok(state.feedback.length >= 1);
});

test('TC-02: OOP Polymorphism factory instantiates correct service subtypes', () => {
  const state = createSeedState(FIXED_NOW);
  const instances = state.locations.map((loc) => createServiceLocation(loc));
  assert.ok(instances[0] instanceof CanteenService);
  assert.ok(instances[1] instanceof PhotocopyService);
  assert.ok(instances[2] instanceof CampusOfficeService);
  assert.ok(instances[3] instanceof LaboratoryService);
});

test('TC-03: Photocopy express print lane grants +25 bonus for <=10 pages and 0 for 150 pages', () => {
  const state = createSeedState(FIXED_NOW);
  const photo = createServiceLocation(state.locations[1]) as PhotocopyService;

  assert.equal(photo.isExpressEligible(4), true);
  assert.equal(photo.isExpressEligible(10), true);
  assert.equal(photo.isExpressEligible(150), false);

  const shortJob = photo.calculatePriority('NORMAL', 4, 0);
  const thesisJob = photo.calculatePriority('NORMAL', 150, 0);
  assert.equal(shortJob.expressBonus, 25);
  assert.equal(thesisJob.expressBonus, 0);
  assert.ok(shortJob.totalScore > thesisJob.totalScore);
});

test('TC-04: Dynamic Priority Aging prevents starvation (Normal at 600s score 50 > new Express 40)', () => {
  const state = createSeedState(FIXED_NOW);
  const canteen = createServiceLocation(state.locations[0]);

  const agedNormal = canteen.calculatePriority('NORMAL', 3, 600); // 10 + 0 + 600/15 = 50
  const freshExpress = canteen.calculatePriority('EXPRESS', 1, 0); // 25 + 15 + 0 = 40

  assert.equal(agedNormal.totalScore, 50);
  assert.equal(freshExpress.totalScore, 40);
  assert.ok(agedNormal.totalScore > freshExpress.totalScore);
});

test('TC-05: EWMA Error Delta self-learning adapts bias on repeated +10m delays (0.0 -> +2.5 -> +4.38)', () => {
  const step1 = computeEwmaBiasUpdate(0.0, 5.0, 15.0, 0.25);
  assert.equal(step1.errorDelta, 10.0);
  assert.equal(step1.nextBias, 2.5);

  const step2 = computeEwmaBiasUpdate(step1.nextBias, 7.5, 17.5, 0.25);
  assert.equal(step2.errorDelta, 10.0);
  assert.equal(step2.nextBias, 4.38);

  // Verify downward recalibration when service speeds up
  const step3 = computeEwmaBiasUpdate(step2.nextBias, 10.0, 6.0, 0.25);
  assert.equal(step3.errorDelta, -4.0);
  assert.ok(step3.nextBias < step2.nextBias);
});

test('TC-06 to TC-09: Full lifecycle (issue token -> call -> serve -> complete -> EWMA -> feedback)', () => {
  let state = createSeedState(FIXED_NOW);

  // TC-06: Issue CAN-102 for Alex Chen
  const issued = issueToken(
    state,
    {
      locationId: 1,
      studentId: 'STU-8823',
      studentName: 'Alex Chen',
      priorityLevel: 'EXPRESS',
      workloadParam: 1,
      notes: 'Cold Coffee & Sandwich',
    },
    FIXED_NOW
  );
  state = issued.nextState;
  assert.equal(issued.token.token_number, 'CAN-102');
  assert.equal(issued.token.status, 'WAITING');

  const ranked = getRankedWaitingQueue(state, 1, FIXED_NOW);
  assert.equal(ranked[0].token.token_number, 'CAN-102');

  // TC-07: Counter calls and commences service
  const called = callNextToken(state, 1, 2, 'Suresh K.', FIXED_NOW + 60_000);
  state = called.nextState;
  assert.equal(called.calledToken?.token_number, 'CAN-102');
  assert.equal(called.calledToken?.status, 'CALLED');

  const started = commenceService(
    state,
    issued.token.id,
    'Suresh K.',
    FIXED_NOW + 120_000
  );
  state = started.nextState;
  assert.equal(started.token.status, 'SERVING');

  // TC-08: Service completion updates audit log & WaitTimeHistory + EWMA bias
  const historyBefore = state.history.length;
  const completed = completeService(
    state,
    issued.token.id,
    'Suresh K.',
    6.5,
    FIXED_NOW + 300_000
  );
  state = completed.nextState;
  assert.equal(completed.completedToken.status, 'COMPLETED');
  assert.equal(state.history.length, historyBefore + 1);
  assert.equal(state.events[0].event_type, 'COMPLETED');

  // TC-09: Student feedback recording
  const fb = submitFeedback(
    state,
    {
      tokenId: issued.token.id,
      rating: 5,
      perceivedWaitMinutes: 6.0,
      comments: 'Fast express service',
    },
    FIXED_NOW + 360_000
  );
  state = fb.nextState;
  assert.equal(fb.record.rating, 5);
  assert.equal(state.feedback[0].token_number, 'CAN-102');
});

test('TC-10: ANSI SQL Schema Export includes all 5 tables, foreign keys, and indexes', () => {
  const state = createSeedState(FIXED_NOW);
  const sql = exportSchemaSql(state);
  assert.match(sql, /CREATE TABLE Locations/);
  assert.match(sql, /CREATE TABLE QueueTokens/);
  assert.match(sql, /CREATE TABLE ServiceEvents/);
  assert.match(sql, /CREATE TABLE WaitTimeHistory/);
  assert.match(sql, /CREATE TABLE Feedback/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.match(sql, /CREATE INDEX idx_history_loc_hour/);
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AppShell, type ActiveTab } from './components/AppShell';
import { AnalyticsSqlView } from './components/AnalyticsSqlView';
import { JoinQueueModal } from './components/JoinQueueModal';
import { PublicBoardView } from './components/PublicBoardView';
import {
  StaffConsoleView,
  type CalibrationNotice,
} from './components/StaffConsoleView';
import { StudentHubView } from './components/StudentHubView';
import {
  callNextToken,
  cancelToken,
  commenceService,
  completeService,
  createSeedState,
  issueToken,
  markNoShow,
  simulateCampusBurst,
  submitFeedback,
} from './engine/queueStore';
import type { PriorityLevel, QueuePulseState } from './engine/types';
import {
  clearPersistedState,
  loadPersistedState,
  savePersistedState,
} from './utils/formatters';

export default function App() {
  const [state, setState] = useState<QueuePulseState>(
    () => loadPersistedState() ?? createSeedState()
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [activeTab, setActiveTab] = useState<ActiveTab>('student');
  const [trackedTokenNumber, setTrackedTokenNumber] = useState<string>(() => {
    const initial = loadPersistedState();
    const firstWaiting = initial?.tokens.find((t) => t.status === 'WAITING');
    return firstWaiting?.token_number ?? 'PHOTO-102';
  });

  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinInitialLocationId, setJoinInitialLocationId] = useState<number>(1);
  const [lastCalibration, setLastCalibration] =
    useState<CalibrationNotice | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Persist relational state on every mutation
  useEffect(() => {
    savePersistedState(state);
  }, [state]);

  // Gentle 5s live clock tick for anti-starvation priority aging
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-dismiss transient status banner after 6s
  useEffect(() => {
    if (!statusBanner) return;
    const t = window.setTimeout(() => setStatusBanner(null), 6000);
    return () => window.clearTimeout(t);
  }, [statusBanner]);

  const handleOpenJoinForStation = (locationId: number) => {
    setJoinInitialLocationId(locationId);
    setJoinModalOpen(true);
  };

  const handleIssueToken = (payload: {
    locationId: number;
    studentId: string;
    studentName: string;
    priorityLevel: PriorityLevel;
    workloadParam: number;
    notes: string;
  }) => {
    const { nextState, token } = issueToken(state, payload, nowMs);
    setState(nextState);
    setTrackedTokenNumber(token.token_number);
    setJoinModalOpen(false);
    setActiveTab('student');
    setStatusBanner(
      `Digital token ${token.token_number} issued for ${token.student_name} (Estimated wait ~${token.estimated_wait_minutes.toFixed(1)}m).`
    );
  };

  const handleCancelToken = (tokenId: number) => {
    const target = state.tokens.find((t) => t.id === tokenId);
    setState((prev) => cancelToken(prev, tokenId, 'Student Portal', nowMs));
    if (target) {
      setStatusBanner(`Token ${target.token_number} has been cancelled.`);
    }
  };

  const handleSubmitFeedback = (payload: {
    tokenId: number;
    rating: number;
    perceivedWaitMinutes: number;
    comments: string;
  }) => {
    const { nextState, record } = submitFeedback(state, payload, nowMs);
    setState(nextState);
    setStatusBanner(
      `Feedback recorded for ${record.token_number} (${record.rating}/5 stars).`
    );
  };

  const handleCallNext = (
    locationId: number,
    counterNumber: number,
    operatorName: string
  ) => {
    const { nextState, calledToken } = callNextToken(
      state,
      locationId,
      counterNumber,
      operatorName,
      nowMs
    );
    if (!calledToken) return;
    setState(nextState);
    setTrackedTokenNumber(calledToken.token_number);
    setStatusBanner(
      `Called ${calledToken.token_number} (${calledToken.student_name}) to Desk ${counterNumber}.`
    );
  };

  const handleCommenceService = (tokenId: number, operatorName: string) => {
    const { nextState, token } = commenceService(
      state,
      tokenId,
      operatorName,
      nowMs
    );
    setState(nextState);
    setStatusBanner(`Service started for ${token.token_number} at Desk ${token.counter_number ?? 1}.`);
  };

  const handleCompleteService = (
    tokenId: number,
    operatorName: string,
    actualWaitOverride?: number
  ) => {
    const result = completeService(
      state,
      tokenId,
      operatorName,
      actualWaitOverride,
      nowMs
    );
    setState(result.nextState);
    setTrackedTokenNumber(result.completedToken.token_number);
    setLastCalibration({
      tokenNumber: result.completedToken.token_number,
      estimatedWait: result.completedToken.estimated_wait_minutes,
      actualWait: result.completedToken.actual_wait_minutes ?? 0,
      errorDelta: result.errorDelta,
      previousBias: result.previousBias,
      updatedBias: result.updatedBias,
      hourSlot: result.hourSlot,
    });
  };

  const handleMarkNoShow = (tokenId: number, operatorName: string) => {
    const target = state.tokens.find((t) => t.id === tokenId);
    setState((prev) => markNoShow(prev, tokenId, operatorName, nowMs));
    if (target) {
      setStatusBanner(`Marked ${target.token_number} as no-show; desk freed.`);
    }
  };

  const handleAdvanceAging = (seconds: number) => {
    setState((prev) => ({
      ...prev,
      simulatedOffsetSeconds: prev.simulatedOffsetSeconds + seconds,
    }));
    setStatusBanner(
      `Advanced simulation clock by +${Math.round(seconds / 60)} minutes — anti-starvation priority aging updated.`
    );
  };

  const handleSimulateBurst = (locationId: number) => {
    const loc = state.locations.find((l) => l.id === locationId);
    setState((prev) => simulateCampusBurst(prev, locationId, nowMs));
    setStatusBanner(
      `Simulated 2 new student arrivals at ${loc?.name ?? 'selected station'}.`
    );
  };

  const handleSetHourOverride = (hour: number | null) => {
    setState((prev) => ({
      ...prev,
      simulatedHourOverride: hour,
    }));
  };

  const handleResetDemo = () => {
    clearPersistedState();
    const fresh = createSeedState();
    setState(fresh);
    setTrackedTokenNumber('PHOTO-102');
    setLastCalibration(null);
    setStatusBanner('Demo database reset to initial 4 campus stations and 44 historical observations.');
  };

  return (
    <AppShell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onOpenJoinModal={() => handleOpenJoinForStation(1)}
    >
      {/* Clean Contextual Status Feedback Banner */}
      {statusBanner && (
        <div
          role="status"
          className="mb-5 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between gap-3 text-sm text-blue-950"
        >
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs font-medium text-blue-800 hover:text-blue-950 whitespace-nowrap cursor-pointer px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'student' && (
        <StudentHubView
          state={state}
          nowMs={nowMs}
          trackedTokenNumber={trackedTokenNumber}
          onSelectTrackedToken={setTrackedTokenNumber}
          onOpenJoinForStation={handleOpenJoinForStation}
          onCancelToken={handleCancelToken}
          onSubmitFeedback={handleSubmitFeedback}
          onSetHourOverride={handleSetHourOverride}
        />
      )}

      {activeTab === 'board' && (
        <PublicBoardView state={state} nowMs={nowMs} />
      )}

      {activeTab === 'staff' && (
        <StaffConsoleView
          state={state}
          nowMs={nowMs}
          lastCalibration={lastCalibration}
          onCallNext={handleCallNext}
          onCommenceService={handleCommenceService}
          onCompleteService={handleCompleteService}
          onMarkNoShow={handleMarkNoShow}
          onAdvanceAging={handleAdvanceAging}
          onSimulateBurst={handleSimulateBurst}
          onResetDemo={handleResetDemo}
        />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsSqlView state={state} nowMs={nowMs} />
      )}

      <JoinQueueModal
        isOpen={joinModalOpen}
        initialLocationId={joinInitialLocationId}
        state={state}
        nowMs={nowMs}
        onClose={() => setJoinModalOpen(false)}
        onSubmit={handleIssueToken}
      />
    </AppShell>
  );
}

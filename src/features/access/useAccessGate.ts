import { useCallback, useEffect, useRef, useState } from 'react';
import { getMachineIdentity } from '../license/licenseService';
import type {
  AccessSnapshot,
  ClaimTrialResponse,
} from './accessContracts';
import {
  accessGateStatus,
  assertAccessSnapshot,
  canUseFreeWorkspace,
  isTrialClaimAvailable,
  type AccessGateStatus,
} from './accessPolicy';
import {
  claimTrial,
  getAccessState,
} from './accessService';

const FREE_ACCESS_POLL_MS = 60_000;
const FREE_ACCESS_TICK_MS = 250;

interface FreeAccessDeadline {
  startedAtMonotonicMs: number;
  remainingMsAtStart: number;
}

export interface AccessGateState {
  status: AccessGateStatus;
  machineId: string | null;
  access: AccessSnapshot | null;
  error: string | null;
  claimInProgress: boolean;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Server-authoritative access hook for the 1-hour free experience and Trial claim.
 *
 * Important:
 * - No local Free Hour persistence.
 * - No 72h offline grace for Free Hour.
 * - Network/server failure never grants Free Hour access.
 * - Server time is converted into a monotonic in-session deadline so changing
 *   the Windows clock cannot extend the already-issued Free Hour snapshot.
 * - Trial eligibility/issuance is decided again by the server.
 */
export function useAccessGate(
  addLog: (message: string, category?: string) => void,
  appVersion?: string,
) {
  const [state, setState] = useState<AccessGateState>({
    status: 'CHECKING',
    machineId: null,
    access: null,
    error: null,
    claimInProgress: false,
  });
  const [freeRemainingSeconds, setFreeRemainingSeconds] = useState(0);

  const requestIdRef = useRef(0);
  const freeDeadlineRef = useRef<FreeAccessDeadline | null>(null);
  const expiryRefreshStartedRef = useRef(false);

  const clearFreeDeadline = useCallback(() => {
    freeDeadlineRef.current = null;
    expiryRefreshStartedRef.current = false;
    setFreeRemainingSeconds(0);
  }, []);

  const syncFreeDeadline = useCallback((access: AccessSnapshot) => {
    if (access.state !== 'FREE_HOUR_ACTIVE' || !canUseFreeWorkspace(access)) {
      clearFreeDeadline();
      return;
    }

    const remainingSeconds = Math.max(0, Number(access.free_remaining_seconds));
    if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
      clearFreeDeadline();
      return;
    }

    freeDeadlineRef.current = {
      startedAtMonotonicMs: performance.now(),
      remainingMsAtStart: remainingSeconds * 1000,
    };
    expiryRefreshStartedRef.current = false;
    setFreeRemainingSeconds(Math.ceil(remainingSeconds));
  }, [clearFreeDeadline]);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = ++requestIdRef.current;
    const silent = options?.silent === true;

    if (!silent) {
      setState((current) => ({
        ...current,
        status: 'CHECKING',
        error: null,
      }));
    }

    try {
      const identity = await getMachineIdentity();
      if (requestId !== requestIdRef.current) return;

      addLog('ACCESS_MACHINE_ID_READY', 'ACCESS');

      const response = await getAccessState(identity.machineId, appVersion);
      if (requestId !== requestIdRef.current) return;

      if (!response.success || !response.access) {
        throw new Error(response.error ?? 'ACCESS_STATE_UNAVAILABLE');
      }

      const access = assertAccessSnapshot(response.access);

      if (access.machine_id !== identity.machineId) {
        throw new Error('ACCESS_MACHINE_MISMATCH');
      }

      syncFreeDeadline(access);
      addLog(`ACCESS_STATE: ${access.state}`, 'ACCESS');

      setState((current) => ({
        ...current,
        status: accessGateStatus(access),
        machineId: identity.machineId,
        access,
        error: null,
      }));
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;

      const message = errorMessage(cause);
      addLog(`ACCESS_CHECK_FAILED: ${message}`, 'ACCESS');

      clearFreeDeadline();
      setState((current) => ({
        ...current,
        status: 'NETWORK_ERROR',
        access: null,
        error: message,
      }));
    }
  }, [addLog, appVersion, clearFreeDeadline, syncFreeDeadline]);

  const claimTrialNow = useCallback(async (): Promise<ClaimTrialResponse> => {
    setState((current) => ({
      ...current,
      claimInProgress: true,
      error: null,
    }));

    try {
      let machineId = state.machineId;

      if (!machineId) {
        const identity = await getMachineIdentity();
        machineId = identity.machineId;
      }

      addLog('TRIAL_CLAIM_START', 'ACCESS');
      const response = await claimTrial(machineId, appVersion);

      if (response.success && response.license) {
        addLog('TRIAL_CLAIM_SUCCESS', 'ACCESS');
      } else {
        addLog(`TRIAL_CLAIM_REJECTED: ${response.error ?? 'UNKNOWN'}`, 'ACCESS');
      }

      await refresh();
      return response;
    } catch (cause) {
      const message = errorMessage(cause);
      addLog(`TRIAL_CLAIM_FAILED: ${message}`, 'ACCESS');

      clearFreeDeadline();
      setState((current) => ({
        ...current,
        status: 'NETWORK_ERROR',
        access: null,
        error: message,
      }));

      return { success: false, error: message };
    } finally {
      setState((current) => ({ ...current, claimInProgress: false }));
    }
  }, [addLog, appVersion, clearFreeDeadline, refresh, state.machineId]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
      freeDeadlineRef.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    if (state.status !== 'FREE_HOUR_ACTIVE') return;

    const timer = window.setInterval(() => {
      void refresh({ silent: true });
    }, FREE_ACCESS_POLL_MS);

    return () => window.clearInterval(timer);
  }, [refresh, state.status]);

  useEffect(() => {
    if (state.status !== 'FREE_HOUR_ACTIVE') return;

    const tick = () => {
      const deadline = freeDeadlineRef.current;
      if (!deadline) {
        setFreeRemainingSeconds(0);
        return;
      }

      const elapsedMs = Math.max(0, performance.now() - deadline.startedAtMonotonicMs);
      const remainingMs = Math.max(0, deadline.remainingMsAtStart - elapsedMs);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      setFreeRemainingSeconds((current) => current === remainingSeconds ? current : remainingSeconds);

      if (remainingMs > 0 || expiryRefreshStartedRef.current) return;

      expiryRefreshStartedRef.current = true;
      freeDeadlineRef.current = null;

      setState((current) => {
        if (current.status !== 'FREE_HOUR_ACTIVE') return current;
        return {
          ...current,
          access: current.access
            ? { ...current.access, free_remaining_seconds: 0, can_use_workspace: false }
            : null,
        };
      });

      addLog('FREE_HOUR_DEADLINE_REACHED', 'ACCESS');
      void refresh({ silent: true });
    };

    tick();
    const timer = window.setInterval(tick, FREE_ACCESS_TICK_MS);
    return () => window.clearInterval(timer);
  }, [addLog, refresh, state.status]);

  const effectiveFreeWorkspace =
    state.status === 'FREE_HOUR_ACTIVE' &&
    freeRemainingSeconds > 0 &&
    canUseFreeWorkspace(state.access);

  return {
    state,
    refresh,
    claimTrial: claimTrialNow,
    canUseFreeWorkspace: effectiveFreeWorkspace,
    freeRemainingSeconds,
    trialClaimAvailable: isTrialClaimAvailable(state.access),
  };
}
